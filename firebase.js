/* firebase.js */

// 1) Firebase project config (fixed: no duplicate/stray properties)
const firebaseConfig = {
  apiKey: "AIzaSyC9Hyz2elP8APMTXJsG0_LGW7mRY5Q4FUU",
  authDomain: "brokebull-2ed34.firebaseapp.com",
  projectId: "brokebull-2ed34",
  storageBucket: "brokebull-2ed34.firebasestorage.app",
  messagingSenderId: "228477100804",
  appId: "1:228477100804:web:19c7d99dafda20822be651"
};

// 2) Init (avoid double-init if scripts are bundled elsewhere)
if (!firebase.apps?.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db   = firebase.firestore();

// Helper to show messages
function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isError ? '#ff6b6b' : '#ffdf6e';
}

// 3) Redirect if already signed in (acts as a safety net)
auth.onAuthStateChanged((user) => {
  if (user && /login\.html$/i.test(location.pathname)) {
    window.location.href = 'dashboard.html';
  }
});

// 4) Wire up UI after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const emailEl  = document.getElementById('email');
  const passEl   = document.getElementById('password');
  const signInBtn = document.getElementById('signInBtn');
  const createBtn = document.getElementById('createBtn');
  const resetLink = document.getElementById('resetLink');

  // --- Sign in ---
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

  // --- Create Account (redirect immediately on success) ---
  createBtn?.addEventListener('click', async () => {
    const email = emailEl.value.trim();
    const pass  = passEl.value;

    try {
      setStatus('Creating account…');
      if (!email || !pass) throw new Error('Enter email and password.');

      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const { user } = await auth.createUserWithEmailAndPassword(email, pass);

      // Firestore write (non-blocking)
      db.collection('users').doc(user.uid).set({
        email,
        role: 'basic',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => {
        console.warn('Firestore profile write failed (non-blocking):', err);
      });

      setStatus('Account created! Redirecting…');
      window.location.replace('./dashboard.html'); // immediate redirect

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

  // --- Password reset ---
  resetLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const email = emailEl.value.trim();
      if (!email) throw new Error('Enter your email first.');
      await auth.sendPasswordResetEmail(email);
      setStatus('Reset email sent. Check your inbox.');
    } catch (err) {
      console.error(err);
      setStatus(err.message, true);
    }
  });
}); // <-- important: close DOMContentLoaded

/* --- Shared helpers for dashboard.html --- */
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
      if (pro) pro.style.display = 'block';
      if (basic) basic.style.display = 'none';
    } else {
      if (pro) pro.style.display = 'none';
      if (basic) basic.style.display = 'block';
    }
  } catch (err) {
    console.error(err);
  }
};
// firebase.js
window.upgradePro = async function upgradePro() {
  try {
    const user = auth.currentUser;

    // If not signed in, send to login then back to dashboard
    if (!user) {
      window.location.href = 'login.html?next=dashboard.html';
      return;
    }

    // Set your role to PRO in Firestore
    await db.collection('users')
      .doc(user.uid)
      .set(
        {
          role: 'pro',
          proSince: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    // Go to dashboard; renderDashboard() will show Pro now
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error('upgradePro failed:', err);
    alert(err.message || 'Failed to upgrade. Check Firestore rules & console.');
  }
};




