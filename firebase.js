// firebase.js

// 1) Your Firebase project config — replace with your actual keys
const firebaseConfig = {
  apiKey: "AIzaSyC9Hyz2elP8APMTXJsG0_LGW7mRY5Q4FUU",
  authDomain: "brokebull-2ed34.firebaseapp.com",
  projectId: "brokebull-2ed34",
  storageBucket: "brokebull-2ed34.firebasestorage.app",
  messagingSenderId: "228477100804",
  appId: "1:228477100804:web:19c7d99dafda20822be651"
};
 // (optional) storageBucket, messagingSenderId, appId if you use them
};
 // 2) Init Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
// 3) Helpers
function showMessage(text) {
  const el = document.getElementById('message');
  if (el) el.textContent = text || '';
}
function getCreds() {
  const email = (document.getElementById('email')?.value || '').trim();
  const password = document.getElementById('password')?.value || '';
  return { email, password };
}
// 4) Auth actions (attach to window so onclick works)
window.signIn = async function signIn() {
  showMessage('');
  const { email, password } = getCreds();
  if (!email || !password) return showMessage('Enter email and password.');
  try {
    await auth.signInWithEmailAndPassword(email, password);
    window.location.href = 'dashboard.html';
  } catch (err) {
    showMessage(err.message);
    console.error(err);
  }
};
window.createAccount = async function createAccount() {
  showMessage('');
  const { email, password } = getCreds();
  if (!email || !password) return showMessage('Enter email and password (min 6 chars).');
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
 // Create/merge user profile in Firestore with default role
    await db.collection('users').doc(cred.user.uid).set({
      email,
      role: 'basic',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
 window.location.href = 'dashboard.html';
  } catch (err) {
    showMessage(err.message);
    console.error(err);
  }
};
window.resetPassword = async function resetPassword() {
  showMessage('');
  const { email } = getCreds();
  if (!email) return showMessage('Enter your email first.');
 try {
    await auth.sendPasswordResetEmail(email);
    showMessage('Password reset email sent. Check your inbox.');
  } catch (err) {
    showMessage(err.message);
    console.error(err);
  }
};
// Optional: protect dashboard by redirecting if logged out.
// Put this guard in dashboard.html or here and call it there:
// window.requireAuth = function() {
//   auth.onAuthStateChanged(user => {
//     if (!user) window.location.href = 'login.html';
//   });
// };

