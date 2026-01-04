
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, User } from "firebase/auth";

// بيانات مشروع روح 1 (Rooh1) الرسمية المقدمة من المستخدم
const firebaseConfig = {
  apiKey: "AIzaSyCjuQxanRlM3Ef6-vGWtMZowz805DmU0D4",
  authDomain: "rooh1-b80e6.firebaseapp.com",
  projectId: "rooh1-b80e6",
  storageBucket: "rooh1-b80e6.firebasestorage.app",
  messagingSenderId: "798624809478",
  appId: "1:798624809478:web:472d3a3149a7e1c24ff987"
};

const app = initializeApp(firebaseConfig);

// 1. بدلاً من getFirestore(app) استخدم initializeFirestore
// هذا التكوين يحل مشاكل تعدد التبويبات (Multiple Tabs) ومشاكل الاتصال (Long Polling)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, 
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const auth = getAuth(app);

// Helper function to ensure the user is authenticated before performing actions
// This wraps the auth logic in a Promise to guarantee a user object is available
export const ensureAuth = (): Promise<User> => {
  return new Promise((resolve, reject) => {
    // 1. If a user is already signed in, resolve immediately.
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    // 2. Set up a one-time listener for the authentication state change.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsubscribe(); // Detach listener once we have a user
        resolve(user);
      }
    }, (error) => {
      console.error("Auth Listener Error:", error);
      reject(error);
    });

    // 3. Trigger anonymous sign-in. 
    // If we are already signing in, this call returns the existing promise/task.
    signInAnonymously(auth).catch((error) => {
      console.warn("Anonymous Sign-in Error:", error);
      // We don't necessarily reject here because the listener might still pick up a user 
      // if there was a race condition or if the error is recoverable/ignorable (e.g. already in progress).
    });
  });
};
