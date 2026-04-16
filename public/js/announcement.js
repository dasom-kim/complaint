import { FIRESTORE_COLLECTIONS } from './firebase.js';

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

export function renderAnnouncements() {
    const contentEl = document.getElementById('notification-content');

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

        announcementsHtml += `
            <div class="announcement-item ${isCollapsed ? 'collapsed' : ''}">
                <div class="announcement-header" onclick="window.toggleAnnouncement(this)">
                    <div class="announcement-header-text">
                        <div class="title">${item.title}</div>
                        <div class="date">${dateString}</div>
                    </div>
                    <div class="toggle-icon"></div>
                </div>
                <div class="content" ${!window.marked ? 'style="white-space: pre-wrap;"' : ''}>${contentHtml}</div>
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
        const { db, doc, getDoc } = window.firebase;
        const docRef = doc(db, FIRESTORE_COLLECTIONS.COMMON, 'notice');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists() && docSnap.data().items && docSnap.data().items.length > 0) {
            allAnnouncements = (docSnap.data().items || []).sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
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
    if (!window.firebase || !window.firebase.auth.currentUser) return;

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
                if (latestId && String(latestId) !== lastCheckId) {
                    notificationDot.style.display = 'block';
                } else {
                    notificationDot.style.display = 'none';
                }
            } else {
                notificationDot.style.display = 'none';
            }
        } else {
            notificationDot.style.display = 'none';
        }
    } catch (e) {
        console.error("새 공지사항 확인 중 오류:", e);
        notificationDot.style.display = 'none';
    }
}