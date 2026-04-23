import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB70UjTr_WOYq4OlYmgAJVfCf1oQkEEaeM",
  authDomain: "happy-rider-crew.firebaseapp.com",
  projectId: "happy-rider-crew",
  storageBucket: "happy-rider-crew.firebasestorage.app",
  messagingSenderId: "403395081239",
  appId: "1:403395081239:web:9ee0af1fce47cb28969852",
  measurementId: "G-PN2TZ0P91N"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);