import { FIRESTORE_COLLECTIONS } from './firebase.js';
import { showAlert } from './utils.js';

let allAnnouncements = [];
let currentAnnouncementPage = 1;
const announcementsPerPage = 3;

window.changeAnnouncementPage = (event, page) => {
    event.stopPropagation();
    const totalPages = Math.ceil(allAnnouncements.length / announcementsPerPage);
    if (page < 1 || page > totalPages) {
        return;
    }
    currentAnnouncementPage = page;
    renderAnnouncements();
};

window.toggleAnnouncement = (headerElement) => {
    headerElement.parentElement.classList.toggle('collapsed');
};

window.toggleLike = async (event, announcementId) => {
    event.stopPropagation();
    const user = window.firebase?.auth?.currentUser;
    if (!user) {
        showAlert("좋아요를 누르려면 로그인이 필요합니다.");
        return;
    }

    const { db, doc, runTransaction } = window.firebase;
    const likeDocRef = doc(db, FIRESTORE_COLLECTIONS.NOTICE_LIKES, announcementId);
    const userIdentifier = user.isAnonymous ? user.uid : user.email;

    // 1. Optimistic UI Update
    const localItem = allAnnouncements.find(item => String(item.id) === announcementId);
    if (!localItem) return;

    const originalLikeCount = localItem.likeCount || 0;
    const originalLikedBy = [...(localItem.likedBy || [])];

    const userIndex = originalLikedBy.indexOf(userIdentifier);

    if (userIndex === -1) {
        // Like
        localItem.likeCount = originalLikeCount + 1;
        localItem.likedBy = [...originalLikedBy, userIdentifier];
    } else {
        // Unlike
        localItem.likeCount = Math.max(0, originalLikeCount - 1);
        localItem.likedBy.splice(userIndex, 1);
    }
    renderAnnouncements(); // Re-render with optimistic update

    // 2. Sync with Firestore in the background
    try {
        await runTransaction(db, async (transaction) => {
            const likeDoc = await transaction.get(likeDocRef);

            let serverLikedBy = [];
            let serverLikeCount = 0;

            if (likeDoc.exists()) {
                serverLikedBy = likeDoc.data().likedBy || [];
                serverLikeCount = likeDoc.data().likeCount || 0;
            }

            const serverUserIndex = serverLikedBy.indexOf(userIdentifier);

            if (serverUserIndex === -1) {
                serverLikedBy.push(userIdentifier);
                serverLikeCount++;
            } else {
                serverLikedBy.splice(serverUserIndex, 1);
                serverLikeCount = Math.max(0, serverLikeCount - 1);
            }

            if (likeDoc.exists()) {
                transaction.update(likeDocRef, { likedBy: serverLikedBy, likeCount: serverLikeCount });
            } else {
                transaction.set(likeDocRef, { likedBy: serverLikedBy, likeCount: serverLikeCount });
            }
        });
    } catch (e) {
        console.error("Transaction failed: ", e);
        showAlert("좋아요 처리 중 오류가 발생했습니다. 다시 시도해주세요.");

        // Rollback optimistic update on failure
        const failedItem = allAnnouncements.find(item => String(item.id) === announcementId);
        if (failedItem) {
            failedItem.likeCount = originalLikeCount;
            failedItem.likedBy = originalLikedBy;
        }
        renderAnnouncements();
    }
};


export function renderAnnouncements() {
    const contentEl = document.getElementById('notification-content');
    const user = window.firebase?.auth?.currentUser;
    const userIdentifier = user ? (user.isAnonymous ? user.uid : user.email) : null;

    if (!allAnnouncements || allAnnouncements.length === 0) {
        contentEl.innerHTML = '<div class="announcement-empty">새로운 공지사항이 없습니다.</div>';
        return;
    }

    const startIndex = (currentAnnouncementPage - 1) * announcementsPerPage;
    const endIndex = startIndex + announcementsPerPage;
    const pageItems = allAnnouncements.slice(startIndex, endIndex);

    let announcementsHtml = '';
    pageItems.forEach((item, index) => {
        const date = item.timestamp.toDate();
        const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        const contentHtml = window.marked ? window.marked.parse(item.content || '') : item.content;
        const isCollapsed = index > 0;

        const likeCount = item.likeCount || 0;
        const isLiked = userIdentifier && item.likedBy && item.likedBy.includes(userIdentifier);

        announcementsHtml += `
            <div class="announcement-item ${isCollapsed ? 'collapsed' : ''}">
                <div class="announcement-header" onclick="window.toggleAnnouncement(this)">
                    <div class="announcement-header-text">
                        <div class="title">${item.title}</div>
                        <div class="announcement-meta">
                            <span class="date">${dateString}</span>
                            <div class="announcement-actions">
                                <button class="like-btn ${isLiked ? 'active' : ''}" onclick="window.toggleLike(event, '${item.id}')">
                                    <svg class="icon-heart" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                                    <span class="like-count">${likeCount}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <svg class="toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="content" ${!window.marked ? 'style="white-space: pre-wrap;"' : ''}>
                    ${contentHtml}
                </div>
            </div>
        `;
    });

    const totalPages = Math.ceil(allAnnouncements.length / announcementsPerPage);
    if (totalPages > 1) {
        let paginationHtml = '<div class="pagination-controls">';

        const prevDisabled = currentAnnouncementPage === 1 ? 'disabled' : '';
        paginationHtml += `<button class="page-btn" onclick="window.changeAnnouncementPage(event, ${currentAnnouncementPage - 1})" ${prevDisabled}>이전</button>`;

        paginationHtml += `<span class="page-info">${currentAnnouncementPage} / ${totalPages}</span>`;

        const nextDisabled = currentAnnouncementPage === totalPages ? 'disabled' : '';
        paginationHtml += `<button class="page-btn" onclick="window.changeAnnouncementPage(event, ${currentAnnouncementPage + 1})" ${nextDisabled}>다음</button>`;

        paginationHtml += '</div>';
        announcementsHtml += paginationHtml;
    }

    contentEl.innerHTML = announcementsHtml;
}

export async function loadAnnouncements() {
    if (!window.firebase) return;

    const contentEl = document.getElementById('notification-content');
    contentEl.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';

    try {
        const { db, doc, getDoc, collection, getDocs } = window.firebase;
        const noticeRef = doc(db, FIRESTORE_COLLECTIONS.COMMON, 'notice');
        const noticeSnap = await getDoc(noticeRef);

        if (noticeSnap.exists() && noticeSnap.data().items && noticeSnap.data().items.length > 0) {
            allAnnouncements = (noticeSnap.data().items || []).sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);

            // 좋아요 데이터 가져와서 병합
            const likesSnapshot = await getDocs(collection(db, FIRESTORE_COLLECTIONS.NOTICE_LIKES));
            const likesData = {};
            likesSnapshot.forEach(doc => {
                likesData[doc.id] = doc.data();
            });

            allAnnouncements.forEach(item => {
                const likeInfo = likesData[String(item.id)]; // ID를 문자열로 변환하여 조회
                if (likeInfo) {
                    item.likeCount = likeInfo.likeCount;
                    item.likedBy = likeInfo.likedBy;
                } else {
                    item.likeCount = 0;
                    item.likedBy = [];
                }
            });

        } else {
            allAnnouncements = [];
        }

        currentAnnouncementPage = 1;
        renderAnnouncements();

        if (allAnnouncements.length > 0) {
            localStorage.setItem('maegyo_last_announcement_id', allAnnouncements[0].id);
        }

    } catch (e) {
        console.error("공지사항 로드 중 오류:", e);
        contentEl.innerHTML = '<div class="announcement-empty">공지사항을 불러오는 중 오류가 발생했습니다.</div>';
        allAnnouncements = [];
    }
}

export async function checkNewAnnouncements() {
    if (!window.firebase || !window.firebase.auth.currentUser) return false;

    const notificationDot = document.getElementById('notification-dot');
    const lastCheckId = localStorage.getItem('maegyo_last_announcement_id');

    try {
        const { db, doc, getDoc } = window.firebase;
        const docRef = doc(db, FIRESTORE_COLLECTIONS.COMMON, 'notice');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const items = (data.items || []).sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);

            if (items.length > 0) {
                const latestId = items[0].id;

                // 최초 접속자이거나, 마지막으로 확인한 ID와 최신 ID가 다른 경우
                if (!lastCheckId || (latestId && String(latestId) !== lastCheckId)) {
                    notificationDot.style.display = 'block';
                    return true; // 새 공지 있음
                }
            }
        }

        notificationDot.style.display = 'none';
        return false; // 새 공지 없음

    } catch (e) {
        console.error("새 공지사항 확인 중 오류:", e);
        notificationDot.style.display = 'none';
        return false;
    }
}
