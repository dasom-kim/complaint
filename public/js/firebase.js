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
    getCountFromServer,
    runTransaction
} from "firebase/firestore";
import {
    getAuth,
    signOut,
    signInAnonymously,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged
} from "firebase/auth";
import firebaseConfig from './firebase-config.js';
import { showAlert } from './utils.js';

export const FIRESTORE_COLLECTIONS = {
    USERS: "users",
    COMPLAINTS: "complaints",
    COMPLETIONS: "completions",
    GUESTBOOK: "guestbook",
    COMMON: "common",
    NOTICE_LIKES: "noticeLikes"
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
        signOut,
        signInAnonymously,
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
        runTransaction, // 트랜잭션 추가
    };
} catch (e) {
    // console.error("Firebase 초기화에 실패했습니다. Firebase 설정을 확인해주세요.", e);
    showAlert("Firebase 연동에 실패했습니다. 앱이 정상적으로 동작하지 않을 수 있습니다.");
}

export { db, auth, onAuthStateChanged };

export async function signInAnonymouslyIfNeeded() {
    if (auth.currentUser) {
        // console.log("이미 로그인되어 있습니다.", auth.currentUser.uid);
        return auth.currentUser;
    }
    try {
        const userCredential = await signInAnonymously(auth);
        // console.log("익명으로 로그인 성공.", userCredential.user.uid);
        return userCredential.user;
    } catch (e) {
        // console.error("익명 로그인 중 오류 발생:", e);
        showAlert("서버에 연결하는 중 문제가 발생했습니다. 새로고침 후 다시 시도해주세요.");
        return null;
    }
}

// Google 로그인 함수
export async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        // console.error("Google 로그인 중 오류 발생:", error);
        showAlert("Google 로그인에 실패했습니다. 팝업 차단을 해제했는지 확인해주세요.");
        return null;
    }
}

// Firestore에서 사용자 정보 가져오기
export async function getUserProfile(userId) {
    if (!db) return null;
    const userDocRef = doc(db, FIRESTORE_COLLECTIONS.USERS, userId);
    const userDocSnap = await getDoc(userDocRef);
    return userDocSnap.exists() ? userDocSnap.data() : null;
}

// Firestore에 사용자 정보 저장하기
export async function saveUserProfile(userId, profileData) {
    if (!db) return;
    const userDocRef = doc(db, FIRESTORE_COLLECTIONS.USERS, userId);
    await setDoc(userDocRef, profileData, { merge: true });
}
