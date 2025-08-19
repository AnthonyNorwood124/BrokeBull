/* firebase.js */

/* 1) Firebase project config */
const firebaseConfig = {
  apiKey: "AIzaSyC9Hyz2elP8APMTXJsG0_LGW7mRY5Q4FUU",
  authDomain: "brokebull-2ed34.firebaseapp.com",
  projectId: "brokebull-2ed34",
  storageBucket: "brokebull-2ed34.appspot.com", // <- correct bucket name
  messagingSenderId: "228477100804",
  appId: "1:228477100804:web:19c7d99dafda20822be651"
};

/* 2) Init (avoid double-init) */
if (!firebase.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

/* Helpers */
function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? '#ff6b6b' : '#ffdf6e';
}
function getNextUrl(def = 'dashboard.html') {
  try {
    const url = new URL(window.location.href);
    const nxt = url.searchParams.get('next');
    // Prevent open redirects: only allow local relative targets
    if (nxt && !/^https?:/i.test(nxt)) return nxt;
  } catch (_) {}
  return def;
}

/* 3) If already signed in and user is on login page → go to dashboard/next */
auth.onAuthStateChanged((user) => {
  if (user && /login\.html$/i.test(location.pathname)) {
    window.location.href = getNextUrl();
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
      const email = emailEl.value.trim();
      const pass  = passEl.value;
      if (!email || !pass) throw new Error('Enter email and password.');
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await auth.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged will redirect, but we can also proactively do it:
      window.location.href = getNextUrl();
    } catch (err) {
      console.error(err);
      setStatus(err.message, true);
    }
  });

  // Create Account
  createBtn?.addEventListener('click', async () => {
    try {
      setStatus('Creating account…');
      const email = emailEl.value.trim();
      const pass  = passEl.value;
      if (!email || !pass) throw new Error('Enter email and password.');

      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const { user } = await auth.createUserWithEmailAndPassword(email, pass);

      // Non-blocking user profile write
      db.collection('users').doc(user.uid).set({
        email,
        role: 'basic',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => {
        console.warn('Firestore profile write failed (non-blocking):', err);
      });

      setStatus('Account created! Redirecting…');
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

window.renderDashboard = async function renderDashboard() {
  const user = auth.currentUser;
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    const role = snap.exists ? (snap.data().role || 'basic') : 'basic';

    const pro   = document.getElementById('proContent');
    const basic = document.getElementById('basicContent');

    if (role === 'pro') {
      if (pro)   pro.style.display   = 'block';
      if (basic) basic.style.display = 'none';
    } else {
      if (pro)   pro.style.display   = 'none';
      if (basic) basic.style.display = 'block';
    }
  } catch (err) {
    console.error(err);
  }
};

/* 6) Dev path: “Upgrade” sets role=pro and redirects to dashboard
   Replace with Stripe flow later. */
// --- Join Pro via Stripe Checkout (Firestore flow) ---
window.upgradePro = async function upgradePro() {
  try {
    // 1) Must be signed in
    const user = auth.currentUser;
    if (!user) {
      // bounce to login and come back
      window.location.href = 'login.html?next=dashboard.html';
      return;
    }
    await db.collection('users')

    // 2) Create a checkout_sessions doc under this user
    const sessionRef = await db
      .collection('customers')
      .doc(user.uid)
      .set(
        {
          role: 'pro',
          proSince: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    window.location.href = 'dashboard.html';
      .collection('checkout_sessions')
      .add({
        mode: 'subscription',
        price: 'price_1RwNgQ0PKkpPJFZAkXlbhB31', // <-- your Stripe price ID
        success_url: window.location.origin + '/dashboard.html?pro=1',
        cancel_url:  window.location.origin + '/dashboard.html?canceled=1',
        allow_promotion_codes: true
      });

    // 3) Wait for the extension to write back { url } or { error }
    sessionRef.onSnapshot((snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.error) {
        console.error('Stripe Checkout error:', data.error);
        alert(data.error.message || 'Checkout failed.');
      }
      if (data.url) {
        // Redirect to Stripe-hosted Checkout
        window.location.assign(data.url);
      }
    });
  } catch (err) {
    console.error('upgradePro failed:', err);
    alert(err.message || 'Failed to upgrade. Check Firestore rules & console.');
    console.error('upgradePro() failed:', err);
    alert(err.message || 'Something went wrong starting Checkout.');
  }
};






