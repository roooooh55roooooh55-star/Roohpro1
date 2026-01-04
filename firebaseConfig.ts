
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import "firebase/compat/auth";

// بيانات مشروع روح 1 (Rooh1) الرسمية المقدمة من المستخدم
const firebaseConfig = {
  apiKey: "AIzaSyCEF21AZXTjtbPH1MMrflmmwjyM_BHoLco",
  authDomain: "rooh1-b80e6.firebaseapp.com",
  projectId: "rooh1-b80e6",
  storageBucket: "rooh1-b80e6.firebasestorage.app",
  messagingSenderId: "798624809478",
  appId: "1:798624809478:web:472d3a3149a7e1c24ff987"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const dbInstance = firebase.firestore();

// Attempt to enable persistence
try {
    dbInstance.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        console.warn("Persistence error", err);
    });
} catch (e) {
    console.warn("Persistence not supported", e);
}

export const db = dbInstance;
export const auth = firebase.auth();

// Helper function to ensure the user is authenticated
export const ensureAuth = (): Promise<firebase.User> => {
  return new Promise((resolve, reject) => {
    // 1. If already signed in, resolve immediately.
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    // 2. Listener for auth state
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        unsubscribe();
        resolve(user);
      }
    }, (error) => {
       console.warn("Auth state change error:", error);
    });

    // 3. Try Anonymous Sign-in
    auth.signInAnonymously().catch((error) => {
      if (error.code === 'auth/identity-toolkit-api-has-not-been-used-in-project' || 
          error.message.includes('identity-toolkit-api')) {
         console.warn("Firebase Auth Notice: Anonymous auth is not enabled in console. App running in restricted mode.");
      } else {
         console.error("Anonymous Sign-in Error:", error);
      }
    });
  });
};
