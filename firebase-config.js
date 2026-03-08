// ============================================================
// BEATFORGE - Firebase Configuration
// ============================================================
// 1. Go to https://console.firebase.google.com
// 2. Create a project
// 3. Enable Google Authentication in Auth > Sign-in method
// 4. Create a Firestore database
// 5. Register a web app and paste your config below
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
