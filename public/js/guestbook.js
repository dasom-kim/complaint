import { signInAnonymouslyIfNeeded, FIRESTORE_COLLECTIONS } from './firebase.js';
import { getToday, showToast, USER_INFO_KEY } from './utils.js';

export async function loadGuestbook() {
    if (!window.firebase) return;

    const entriesContainer = document.getElementById('guestbook-entries-container');
    const formContainer = document.getElementById('guestbook-form-container');
    const limitMsg = document.getElementById('guestbook-limit-msg');

    entriesContainer.innerHTML = '<div class="loading-spinner"></div>';

    const { db, collection, getDocs, query, where, orderBy } = window.firebase;
    const { auth } = window.firebase;

    const today = getToday();
    let hasPostedToday = false;

    if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        const qUser = query(collection(db, FIRESTORE_COLLECTIONS.GUESTBOOK), where("uid", "==", uid), where("date", "==", today));
        const userSnapshot = await getDocs(qUser);
        if (!userSnapshot.empty) {
            hasPostedToday = true;
        }
    }

    if (hasPostedToday) {
        formContainer.style.display = 'none';
        limitMsg.style.display = 'block';
    } else {
        formContainer.style.display = 'block';
        limitMsg.style.display = 'none';
    }

    try {
        const qEntries = query(collection(db, FIRESTORE_COLLECTIONS.GUESTBOOK), orderBy("timestamp", "desc"));
        const entriesSnapshot = await getDocs(qEntries);

        if (entriesSnapshot.empty) {
            entriesContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0;">아직 등록된 응원이 없습니다. 첫 번째 응원을 남겨주세요!</p>`;
            return;
        }

        let html = '';
        entriesSnapshot.forEach(doc => {
            const entry = doc.data();
            const date = entry.timestamp ? new Date(entry.timestamp.seconds * 1000).toLocaleDateString() : '';
            html += `
                <div class="guestbook-entry">
                    <div class="guestbook-entry-header">
                        <span class="guestbook-entry-user">
                            ${entry.nickname}
                            <span class="apt-name">${entry.apartment}</span>
                        </span>
                        <span class="guestbook-entry-date">${date}</span>
                    </div>
                    <p class="guestbook-entry-message">${entry.message}</p>
                </div>
            `;
        });
        entriesContainer.innerHTML = html;
    } catch (e) {
        console.error("방명록 로딩 중 오류:", e);
        entriesContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted);">방명록을 불러오는 중 오류가 발생했습니다.</p>`;
    }
}

export function attachGuestbookListeners() {
    const guestbookSubmitBtn = document.getElementById('guestbook-submit-btn');
    if (guestbookSubmitBtn) {
        guestbookSubmitBtn.addEventListener('click', async () => {
            if (!window.firebase) return;

            const { db, collection, addDoc, serverTimestamp } = window.firebase;
            const { auth } = window.firebase;

            if (!auth.currentUser) {
                await signInAnonymouslyIfNeeded();
                if(!auth.currentUser) {
                    showToast("로그인이 필요합니다.");
                    return;
                }
            }

            const input = document.getElementById('guestbook-input');
            const message = input.value.trim();

            if (!message) {
                showToast("메시지를 입력해주세요.");
                return;
            }

            guestbookSubmitBtn.disabled = true;
            guestbookSubmitBtn.innerText = "등록 중...";

            try {
                const userInfo = JSON.parse(localStorage.getItem(USER_INFO_KEY));

                const guestbookData = {
                    uid: auth.currentUser.uid,
                    date: getToday(),
                    timestamp: serverTimestamp(),
                    nickname: userInfo.nickname,
                    apartment: userInfo.apartment,
                    message: message,
                };

                await addDoc(collection(db, FIRESTORE_COLLECTIONS.GUESTBOOK), guestbookData);

                showToast("응원의 메시지가 등록되었습니다! 감사합니다.");
                input.value = '';
                await loadGuestbook();

            } catch(e) {
                console.error("방명록 등록 중 오류:", e);
                showToast("오류가 발생했습니다. 다시 시도해주세요.");
            } finally {
                guestbookSubmitBtn.disabled = false;
                guestbookSubmitBtn.innerText = "응원 남기기";
            }
        });
    }
}