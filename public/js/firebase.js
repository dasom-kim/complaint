import { initializeApp } from "firebase/app";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    collection,
    serverTimestamp,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    getCountFromServer
} from "firebase/firestore";
import { getAuth, signInAnonymously, signOut } from "firebase/auth";
import firebaseConfig from './firebase-config.js';

export const FIRESTORE_COLLECTIONS = {
    COMPLAINTS: "complaints",
    COMPLETIONS: "completions",
    GUESTBOOK: "guestbook",
    COMMON: "common"
};
export const FIRESTORE_DOCUMENTS = {
    MAIN_DATA: "main-data"
};

let db, auth;

try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);

    window.firebase = {
        db,
        auth,
        signInAnonymously,
        signOut,
        doc,
        getDoc,
        setDoc,
        addDoc,
        updateDoc,
        collection,
        serverTimestamp,
        getDocs,
        query,
        where,
        orderBy,
        limit,
        getCountFromServer,
    };
} catch (e) {
    console.error("Firebase 초기화에 실패했습니다. Firebase 설정을 확인해주세요.", e);
    alert("Firebase 연동에 실패했습니다. 앱이 정상적으로 동작하지 않을 수 있습니다.");
}

export { db, auth };

export async function signInAnonymouslyIfNeeded() {
    if (!window.firebase) return;
    const { auth, signInAnonymously } = window.firebase;
    if (auth.currentUser) {
        console.log("이미 익명으로 로그인되어 있습니다.", auth.currentUser.uid);
        return;
    }
    try {
        await signInAnonymously(auth);
        console.log("익명으로 로그인 성공.", auth.currentUser.uid);
    } catch (e) {
        console.error("익명 로그인 중 오류 발생:", e);
        alert("서버에 연결하는 중 문제가 발생했습니다. 새로고침 후 다시 시도해주세요.");
    }
}