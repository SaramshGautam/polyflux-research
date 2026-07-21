import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // Fails loudly at build/boot time instead of Firebase throwing a cryptic
  // error later -- almost always means the REACT_APP_FIREBASE_* env vars
  // aren't set (missing .env.local locally, or not set in Vercel).
  console.error(
    "[firebaseConfig] Missing REACT_APP_FIREBASE_* environment variables. " +
      "Copy .env.example to .env.local for local dev, or set them in your Vercel project settings."
  );
}

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore (Database)
const db = getFirestore(app);

// Initialize Firebase Authentication
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider(); // For Google Sign-In

// Initialize Firebase Storage
const storage = getStorage(app);

// Export for use in other parts of the app
export { app, db, auth, googleProvider, storage };
