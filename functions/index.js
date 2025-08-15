/**
 * BrokeBull — Stripe Subscriptions (Checkout + Portal + Webhook)
 * Project: brokebull-2ed34
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

admin.initializeApp();

// --- CONFIG YOU PROVIDED ---
const PRICE_ID = 'price_1RwNgQ0PKkpPJFZAkXlbhB31'; // $19/mo
const SUCCESS_URL = 'https://www.brokebullinvestments.com/dashboard.html?checkout=success';
const CANCEL_URL  = 'https://www.brokebullinvestments.com/?checkout=cancel';

// Stripe client from secret (set via Firebase Secrets)
let stripe;
function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY');
    stripe = require('stripe')(key, { apiVersion: '2024-06-20' });
  }
  return stripe;
}

// ---------- helpers ----------
async function verifyFirebaseIdToken(req) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer (.+)$/i);
  if (!m) throw new Error('Missing Authorization: Bearer <ID_TOKEN>');
  const idToken = m[1];
  return admin.auth().verifyIdToken(idToken);
}

async function getOrCreateCustomer(uid, email) {
  const ref = admin.firestore().collection('users').doc(uid);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : {};
  if (existing.stripeCustomerId) return existing.stripeCustomerId;

  const s = getStripe();
  const customer = await s.customers.create({ email, metadata: { uid } });
  await ref.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

async function markUserPro(uid, sub) {
  const data = {
    role: 'pro',
    subscriptionId: sub?.id || null,
    subscriptionStatus: sub?.status || 'active',
    currentPeriodEnd: sub?.current_period_end
      ? admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000)
      : admin.firestore.FieldValue.delete(),
    proSince: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await admin.firestore().collection('users').doc(uid).set(data, { merge: true });
}

async function markUserBasicByCustomerId(customerId) {
  const q = await admin.firestore().collection('users')
    .where('stripeCustomerId', '==', customerId).limit(1).get();
  if (q.empty) return;
  await q.docs[0].ref.set({
    role: 'basic',
    subscriptionStatus: 'canceled',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ---------- 1) Create Checkout Session ----------
exports.createCheckoutSession = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY'] })
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        if (req.method !== 'POST') return res.status(405).end();

        const decoded = await verifyFirebaseIdToken(req);
        const uid = decoded.uid;
        const email = decoded.email || undefined;

        const customerId = await getOrCreateCustomer(uid, email);
        const s = getStripe();

        const session = await s.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: PRICE_ID, quantity: 1 }],
          success_url: SUCCESS_URL,
          cancel_url: CANCEL_URL,
          metadata: { firebaseUID: uid },
        });

        return res.status(200).json({ url: session.url });
      } catch (err) {
        console.error('createCheckoutSession error:', err);
        return res.status(400).json({ error: err.message || 'Failed to create session' });
      }
    });
  });

// ---------- 2) Create Customer Portal Session ----------
exports.createPortalSession = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY'] })
  .https.onRequest(async (req, res) => {
    cors(req, res, async () => {
      try {
        if (req.method !== 'POST') return res.status(405).end();

        const decoded = await verifyFirebaseIdToken(req);
        const uid = decoded.uid;

        const ref = admin.firestore().collection('users').doc(uid);
        const snap = await ref.get();
        const customerId = snap.data()?.stripeCustomerId;
        if (!customerId) throw new Error('No Stripe customer found.');

        const s = getStripe();
        const portal = await s.billingPortal.sessions.create({
          customer: customerId,
          return_url: 'https://www.brokebullinvestments.com/dashboard.html',
        });

        return res.status(200).json({ url: portal.url });
      } catch (err) {
        console.error('createPortalSession error:', err);
        return res.status(400).json({ error: err.message || 'Failed to open portal' });
      }
    });
  });

// ---------- 3) Stripe Webhook ----------
exports.stripeWebhook = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] })
  .https.onRequest(async (req, res) => {
    // DO NOT wrap webhook in CORS; Stripe posts directly
    try {
      const s = getStripe();
      const sig = req.headers['stripe-signature'];
      const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
      const event = s.webhooks.constructEvent(req.rawBody, sig, whSecret);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const uid = session.metadata?.firebaseUID;
          // Fetch subscription
          if (session.mode === 'subscription' && session.subscription && uid) {
            const sub = await s.subscriptions.retrieve(session.subscription);
            await markUserPro(uid, sub);
            // persist customer on user doc (for portal)
            const customerId = session.customer;
            if (customerId) {
              await admin.firestore().collection('users').doc(uid)
                .set({ stripeCustomerId: customerId }, { merge: true });
            }
          }
          break;
        }

        case 'customer.subscription.updated':
        case 'invoice.paid': {
          const sub = event.data.object;
          const customerId = sub.customer;
          const users = await admin.firestore().collection('users')
            .where('stripeCustomerId', '==', customerId).limit(1).get();
          if (!users.empty && (sub.status === 'active' || sub.status === 'trialing')) {
            const uid = users.docs[0].id;
            await markUserPro(uid, sub);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          await markUserBasicByCustomerId(sub.customer);
          break;
        }

        default:
          // ignore other events
      }

      return res.status(200).send('ok');
    } catch (err) {
      console.error('stripeWebhook error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });
