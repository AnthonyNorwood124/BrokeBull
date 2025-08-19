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
function getNextUrl(def = 'dashboard.html') {
  try {
    const url = new URL(window.location.href);
    const nxt = url.searchParams.get('next');
    if (nxt && !/^https?:/i.test(nxt)) return nxt.replace(/^\/*/, '') || def;
  } catch (_) {}
  return def;
}
const isLoginPage = /\/login\.html$/i.test(location.pathname);

/* 3) Redirect policy
   - NO auto-redirect on login.html (prevents loops/flicker)
   - Dashboard enforces auth and role
*/
document.addEventListener('DOMContentLoaded', () => {
  const emailEl   = document.getElementById('email');
  const passEl    = document.getElementById('password');
  const signInBtn = document.getElementById('signInBtn');
  const createBtn = document.getElementById('createBtn');
  const resetLink = document.getElementById('resetLink');

  // Sign in → explicit redirect
  signInBtn?.addEventListener('click', async () => {
    try {
      setStatus('Signing in…');
      const email = emailEl?.value.trim();
      const pass  = passEl?.value;
      if (!email || !pass) throw new Error('Enter email and password.');
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await auth.signInWithEmailAndPassword(email, pass);
      window.location.replace(getNextUrl());
    } catch (err) {
      console.error(err);
      setStatus(err.message, true);
    }
  });

  // Create Account → explicit redirect
  createBtn?.addEventListener('click', async () => {
    try {
      setStatus('Creating account…');
      const email = emailEl?.value.trim();
      const pass  = passEl?.value;
      if (!email || !pass) throw new Error('Enter email and password.');

      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const { user } = await auth.createUserWithEmailAndPassword(email, pass);

      // Non-blocking profile write
      db.collection('users').doc(user.uid).set({
        email,
        role: 'basic',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(e => console.warn('Profile write (non-blocking):', e));

      window.location.replace(getNextUrl());
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

/* 4) Dashboard gating (only place we auto-redirect) */
window.renderDashboard = async function renderDashboard() {
  const pro    = document.getElementById('proContent');
  const basic  = document.getElementById('basicContent');
  const loader = document.getElementById('loading');

  // Hide both initially
  if (basic) basic.style.display = 'none';
  if (pro)   pro.style.display   = 'none';

  // Wait for auth state once, then decide
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.replace('login.html?next=dashboard.html');
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
      if (basic) basic.style.display = 'block';
    } finally {
      if (loader) loader.style.display = 'none';
    }
  });
};

/* 5) Logout */
window.logout = async function logout() {
  try {
    await auth.signOut();
    window.location.href = 'login.html';
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
};

/* 6) TEMP: Upgrade to Pro (no Stripe) */
window.upgradePro = async function upgradePro() {
  try {
    const user = auth.currentUser;
    if (!user) {
      window.location.href = 'login.html?next=dashboard.html';
      return;
    }
    await db.collection('users').doc(user.uid).set(
      { role: 'pro', proSince: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    window.location.replace('dashboard.html');
  } catch (err) {
    console.error('upgradePro failed:', err);
    alert(err.message || 'Upgrade failed.');
  }
};








