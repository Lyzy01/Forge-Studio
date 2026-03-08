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
  apiKey: "AIzaSyDYgH2UiJmhXx57yB4gK1sY0YvZepivuRI",
  authDomain: "dj-forge-studio.firebaseapp.com",
  projectId: "dj-forge-studio",
  storageBucket: "dj-forge-studio.firebasestorage.app",
  messagingSenderId: "259829427736",
  appId: "1:259829427736:web:fd9cef0f1c4feb3e2e9d6d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
