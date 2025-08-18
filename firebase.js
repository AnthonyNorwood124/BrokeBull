/* firebase.js */

/* 1) Firebase project config */
const firebaseConfig = {
  apiKey: "AIzaSyC9Hyz2elP8APMTXJsG0_LGW7mRY5Q4FUU",
  authDomain: "brokebull-2ed34.firebaseapp.com",
  projectId: "brokebull-2ed34",
  storageBucket: "brokebull-2ed34.appspot.com",
  messagingSenderId: "228477100804",
  appId: "1:228477100804:web:19c7d99dafda20822be651"
};

/* 2) Init (avoid double-init) */
if (!firebase.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* ===== Helpers ===== */
function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? '#ff6b6b' : '#ffdf6e';
}

/* Only allow local relative redirects; default to dashboard.html */
function getNextUrl(def = 'dashboard.html') {
  try {
    const url = new URL(window.location.href);
    const nxt = url.searchParams.get('next');
    if (nxt && !/^https?:/i.test(nxt)) {
      // normalize: strip leading slashes
      return nxt.replace(/^\/*/, '') || def;
    }
  } catch (_) {}
  return def;
}

/* 3) If already signed in and we're on login.html → go to next/dashboard */
auth.onAuthStateChanged((user) => {
  if (user && /\/login\.html$/i.test(location.pathname)) {
    window.location.replace(getNextUrl());
  }
});

/* 4) Wire up login page UI (if present) */
document.addEventListener('DOMContentLoaded', () => {
  const emailEl   = document.getElementById('email');
  const passEl    = document.getElementById('password');
  const signInBtn = document.getElementById('signInBtn');
  const createBtn = document.getElementById('createBtn');
  const resetLink = document.getElementById('resetLink');

  // Sign in
  signInBtn?.addEventListener('click', async () => {
    try {
      setStatus('Signing in…');
      const email = emailEl?.value.trim();
      const pass  = passEl?.value;
      if (!email || !pass) throw new Error('Enter email and password.');
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await auth.signInWithEmailAndPassword(email, pass);
      // Proactively navigate; don't wait for the auth observer
      window.location.replace(getNextUrl());
    } catch (err) {
      console.error(err);
      setStatus(err.message, true);
    }
  });

  // Create Account
  createBtn?.addEventListener('click', async () => {
    try {
      setStatus('Creating account…');
      const email = emailEl?.value.trim();
      const pass  = passEl?.value;
      if (!email || !pass) throw new Error('Enter email and password.');

      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const { user } = await auth.createUserWithEmailAndPassword(email, pass);

      // Non-blocking user profile write (role = basic by default)
      db.collection('users').doc(user.uid).set({
        email,
        role: 'basic',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => {
        console.warn('Firestore profile write failed (non-blocking):', err);
      });

      window.location.replace(getNextUrl()); // immediate redirect
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setStatus('That email is already in use. Try Sign In.', true);
      } else if (err.code === 'auth/weak-password') {
        setStatus('Password should be at least 6 characters.', true);
      } else if (err.code === 'auth/invalid-email') {
        setStatus('Please enter a valid email address.', true);
      } else {
        setStatus(err.message || 'Sign up failed.', true);
      }
    }
  });

  // Password reset
  resetLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const email = emailEl?.value.trim();
      if (!email) throw new Error('Enter your email first.');
      await auth.sendPasswordResetEmail(email);
      setStatus('Reset email sent. Check your inbox.');
    } catch (err) {
      console.error(err);
      setStatus(err.message, true);
    }
  });
});

/* 5) Shared helpers for dashboard.html */
window.logout = async function logout() {
  try {
    await auth.signOut();
    window.location.href = 'login.html';
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
};

/* Role-gated render (prevents flash and cleans up loader) */
window.renderDashboard = async function renderDashboard() {
  const pro    = document.getElementById('proContent');
  const basic  = document.getElementById('basicContent');
  const loader = document.getElementById('loading');

  // Hide both initially to prevent any flash
  if (basic) basic.style.display = 'none';
  if (pro)   pro.style.display   = 'none';

  const user = auth.currentUser;
  if (!user) {
    window.location.href = 'login.html?next=dashboard.html';
    return;
  }

  try {
    const snap = await db.collection('users').doc(user.uid).get();
    const role = snap.exists ? (snap.data().role || 'basic') : 'basic';

    if (role === 'pro') {
      if (pro)   pro.style.display   = 'block';
    } else {
      if (basic) basic.style.display = 'block';
    }
  } catch (err) {
    console.error('renderDashboard error:', err);
    // Fallback to basic if anything odd happens
    if (basic) basic.style.display = 'block';
  } finally {
    if (loader) loader.style.display = 'none';
  }
};

/* 6) Upgrade to Pro via Stripe Checkout (Firestore → extension) */
window.upgradePro = async function upgradePro() {
  try {
    const user = auth.currentUser;
    if (!user) {
      // Not logged in → go sign in first, then come back
      window.location.href = 'login.html?next=dashboard.html';
      return;
    }

    // (Optional) Ensure parent doc exists (not required, but helpful)
    await db.collection('customers').doc(user.uid).set(
      { lastCheckoutAttempt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // Create a checkout session doc; the Stripe extension will process it
    const sessionRef = await db
      .collection('customers')
      .doc(user.uid)
      .collection('checkout_sessions')
      .add({
        price: 'price_1RwNgQ0PKkpPJFZAkXlbhB31', // your Price ID
        mode: 'subscription',
        success_url: 'https://www.brokebullinvestments.com/dashboard.html?upgrade=success',
        cancel_url:  'https://www.brokebullinvestments.com/dashboard.html?upgrade=cancel',
        allow_promotion_codes: true
      });

    // Listen for the extension to write back the URL / sessionId
    sessionRef.onSnapshot(async (snap) => {
      const data = snap.data();
      if (!data) return;

      if (data.error) {
        alert('Stripe error: ' + (data.error.message || 'Checkout failed.'));
        console.error('Stripe Checkout error:', data.error);
        return;
      }

      // Preferred: extension returns a direct URL to redirect to
      if (data.url) {
        window.location.assign(data.url);
        return;
      }

      // Fallback: some versions return sessionId; needs Stripe.js on the page
      if (data.sessionId) {
        if (typeof Stripe === 'undefined') {
          alert('Stripe.js not loaded. Add <script src="https://js.stripe.com/v3"></script> to this page.');
          return;
        }
        const stripe = Stripe('pk_test_51RwNeh0PKkpPJFZAV0rAShHtE7uNKQ36xc064JloSlVUgCdpiliIynyFfwxm65sdEgftcp0dv9gh8OotZXxrpid000QSP9SqZk');
        const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
        if (error) {
          alert(error.message || 'Stripe redirect failed');
          console.error(error);
        }
      }
    });
  } catch (err) {
    console.error('upgradePro failed:', err);
    alert(err.message || 'Upgrade failed. Check Firebase Functions logs for the Stripe extension.');
  }
};








