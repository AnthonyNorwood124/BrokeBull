/* firebase.js */
// 1) Your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyC9Hyz2elP8APMTXJsG0_LGW7mRY5Q4FUU",
  authDomain: "brokebull-2ed34.firebaseapp.com",
  projectId: "brokebull-2ed34",
  storageBucket: "brokebull-2ed34.firebasestorage.app",
  messagingSenderId: "228477100804",
  appId: "1:228477100804:web:19c7d99dafda20822be651"
};
  // Optional but recommended if you use Storage / Messaging / etc:
  // storageBucket: "YOUR_STORAGE_BUCKET",
  // messagingSenderId: "YOUR_MSG_SENDER_ID",
  appId:         "YOUR_APP_ID",
};
// 2) Init
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
// Helper to show messages
function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? '#ff6b6b' : '#ffdf6e';
}
// 3) Redirect if already signed in
auth.onAuthStateChanged((user) => {
  if (user) {
    // already logged in → go to dashboard
    window.location.href = 'dashboard.html';
  }
});
// 4) Wire up UI after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');
  const signInBtn  = document.getElementById('signInBtn');
  const createBtn  = document.getElementById('createBtn');
  const resetLink  = document.getElementById('resetLink');
 // Sign in
  signInBtn?.addEventListener('click', async () => {
    try {
      setStatus('Signing in…');
      const email = emailEl.value.trim();
      const pass  = passEl.value;
      if (!email || !pass) throw new Error('Enter email and password.');
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await auth.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged will redirect
    } catch (err) {
      console.error(err);
      setStatus(err.message, true);
    }
  });
/* --- firebase.js: Create Account handler (replace your old one) --- */
createBtn?.addEventListener('click', async () => {
  const email = emailEl.value.trim();
  const pass  = passEl.value;
 try {
    setStatus('Creating account…');
    if (!email || !pass) throw new Error('Enter email and password.');
    // Persist session across tabs/browser restarts
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    // Create the user
    const { user } = await auth.createUserWithEmailAndPassword(email, pass);
    // Kick off Firestore write IN THE BACKGROUND (do not block redirect)
    db.collection('users').doc(user.uid).set({
      email,
      role: 'basic',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => {
      console.warn('Firestore profile write failed (non-blocking):', err);
    });
    // Force redirect immediately to dashboard
    setStatus('Account created! Redirecting…');
    // Use replace() so back button doesn't return to the form
    window.location.replace('./dashboard.html');
  } catch (err) {
    console.error(err);
    // Nice messages for common auth errors
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
/* 
Exported functions for dashboard.html (if you kept those there)
You may already have these in your dashboard code; if not, they can live here.
*/
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
    // Not signed in → go to login
    window.location.href = 'login.html';
    return;
  }
  try {
    // Get role
    const snap = await db.collection('users').doc(user.uid).get();
    const role = snap.exists ? (snap.data().role || 'basic') : 'basic';
 // Toggle sections
    const pro = document.getElementById('proContent');
    const basic = document.getElementById('basicContent');
    if (role === 'pro') {
      if (pro) pro.style.display = 'block';
      if (basic) basic.style.display = 'none';
    } else {
      if (pro) pro.style.display = 'none';
      if (basic) basic.style.display = 'block';
    }
  } catch (err) {
    console.error(err);
    // Optional status UI on dashboard
  }
};
window.upgradePro = function upgradePro() {
  // Swap for your real Stripe link
  window.location.href = 'https://buy.stripe.com/test_1234567890';
};

