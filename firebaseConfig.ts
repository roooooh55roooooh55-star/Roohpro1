
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
export const db = getFirestore(app);
