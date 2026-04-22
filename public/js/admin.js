import { FIRESTORE_COLLECTIONS, FIRESTORE_DOCUMENTS } from './firebase.js';
import { showAlert, showToast, showConfirm, COMPLAINTS_DATA_KEY } from './utils.js';

let isInitialized = false;
let adminNotices = [];
let adminComplaints = [];

export async function initAdminPage() {
    if (isInitialized) return;

    const user = window.firebase?.auth?.currentUser;
    if (!user) {
        showAlert("관리자 로그인이 필요합니다.");
        return;
    }

    try {
        const { db, doc, getDoc } = window.firebase;
        const userDocRef = doc(db, FIRESTORE_COLLECTIONS.USERS, user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists() || userDocSnap.data().level !== 'admin') {
            showAlert("관리자 권한이 없습니다.");
            const adminMenuItem = document.getElementById('admin-menu-item');
            if (adminMenuItem) adminMenuItem.style.display = 'none';
            return;
        }

        renderAdminUI();
        await loadAdminAnnouncements();
        await loadAdminComplaints();
        isInitialized = true;

    } catch (e) {
        console.error("관리자 인증 확인 중 오류:", e);
        showAlert("관리자 권한을 확인할 수 없습니다.");
    }
}

function renderAdminUI() {
    const adminPage = document.getElementById('admin-page');
    if (!adminPage) return;

    adminPage.innerHTML = `
        <div class="admin-section card">
            <div class="admin-section-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px;">
                <h3 style="margin: 0; font-size: 1.2rem;">📢 공지사항 관리</h3>
                <button class="btn-action" id="admin-add-notice-btn">+ 새 공지 작성</button>
            </div>

            <div id="admin-notice-form-container" style="display: none; margin-bottom: 20px; background: #f8fafc; padding: 20px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <input type="hidden" id="admin-notice-id">
                <div class="form-group">
                    <label>제목</label>
                    <input type="text" id="admin-notice-title" placeholder="공지사항 제목">
                </div>
                <div class="form-group">
                    <label>내용 (Markdown 지원)</label>
                    <textarea id="admin-notice-content" placeholder="공지사항 내용" style="min-height: 150px;"></textarea>
                </div>
                <div class="admin-form-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn-action" id="admin-notice-cancel-btn">취소</button>
                    <button class="btn-large" id="admin-notice-save-btn" style="width: auto; padding: 10px 20px;">저장</button>
                </div>
            </div>

            <div id="admin-notice-list">
                <div class="loading-spinner"></div>
            </div>
        </div>

        <div class="admin-section card">
            <div class="admin-section-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; margin-bottom: 20px;">
                <h3 style="margin: 0; font-size: 1.2rem;">📝 민원 정보 관리</h3>
                <div class="admin-header-actions" style="display: flex; gap: 10px;">
                    <select id="admin-complaint-category-filter" class="filter-select" style="min-width: 120px;">
                        <option value="all">전체 카테고리</option>
                    </select>
                    <button class="btn-action" id="admin-add-complaint-btn">+ 새 민원 추가</button>
                </div>
            </div>

            <div id="admin-complaint-form-container" style="display: none; margin-bottom: 20px; background: #f8fafc; padding: 20px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <input type="hidden" id="admin-complaint-id">
                <div class="form-group">
                    <label>카테고리</label>
                    <input type="text" id="admin-complaint-category" placeholder="예: 교통, 환경, 시설 등">
                </div>
                <div class="form-group">
                    <label>민원 제목</label>
                    <input type="text" id="admin-complaint-title" placeholder="민원 제목">
                </div>
                <div class="form-group">
                    <label>민원 내용</label>
                    <textarea id="admin-complaint-content" placeholder="민원 상세 내용" style="min-height: 150px;"></textarea>
                </div>
                <div class="admin-form-actions" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button class="btn-action" id="admin-complaint-cancel-btn">취소</button>
                    <button class="btn-large" id="admin-complaint-save-btn" style="width: auto; padding: 10px 20px;">저장</button>
                </div>
            </div>

            <div id="admin-complaint-list">
                <div class="loading-spinner"></div>
            </div>
        </div>
    `;

    attachAdminEventListeners();
}

function attachAdminEventListeners() {
    document.getElementById('admin-add-notice-btn').addEventListener('click', () => openNoticeForm());
    document.getElementById('admin-notice-cancel-btn').addEventListener('click', closeNoticeForm);
    document.getElementById('admin-notice-save-btn').addEventListener('click', saveNotice);

    document.getElementById('admin-add-complaint-btn').addEventListener('click', () => {
        const categoryFilter = document.getElementById('admin-complaint-category-filter');
        const selectedCategory = categoryFilter.value === 'all' ? '' : categoryFilter.value;
        openComplaintForm(null, selectedCategory);
    });
    document.getElementById('admin-complaint-cancel-btn').addEventListener('click', closeComplaintForm);
    document.getElementById('admin-complaint-save-btn').addEventListener('click', saveComplaint);

    document.getElementById('admin-complaint-category-filter').addEventListener('change', (e) => {
        renderAdminComplaintsList(e.target.value);
    });
}

// --- 공지사항 관리 ---

async function loadAdminAnnouncements() {
    const listEl = document.getElementById('admin-notice-list');
    try {
        const { db, doc, getDoc } = window.firebase;
        const noticeRef = doc(db, FIRESTORE_COLLECTIONS.COMMON, 'notice');
        const noticeSnap = await getDoc(noticeRef);

        adminNotices = (noticeSnap.exists() && noticeSnap.data().items)
            ? noticeSnap.data().items.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds)
            : [];
        renderAdminNoticesList();
    } catch (e) {
        console.error("공지사항 로드 실패:", e);
        listEl.innerHTML = '<p style="color:red;">데이터를 불러오는 데 실패했습니다.</p>';
    }
}

function renderAdminNoticesList() {
    const listEl = document.getElementById('admin-notice-list');
    if (adminNotices.length === 0) {
        listEl.innerHTML = '<p class="empty-history">등록된 공지사항이 없습니다.</p>';
        return;
    }

    listEl.innerHTML = `<ul class="history-list" style="margin-top: 0;">${adminNotices.map(notice => {
        const date = new Date(notice.timestamp.seconds * 1000);
        const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
        return `
            <li class="history-item">
                <div class="history-item-content">
                    <div class="history-item-title">${notice.title}</div>
                    <div class="history-item-date">${dateString}</div>
                </div>
                <div class="admin-item-actions" style="display: flex; gap: 8px; white-space: nowrap;">
                    <button class="btn-action" onclick="window.editAdminNotice('${notice.id}')" style="padding: 4px 8px; font-size: 0.8rem;">수정</button>
                    <button class="btn-action" onclick="window.deleteAdminNotice('${notice.id}')" style="padding: 4px 8px; font-size: 0.8rem; color: #ef4444; border-color: #fca5a5; background: #fef2f2;">삭제</button>
                </div>
            </li>`;
    }).join('')}</ul>`;
}

function openNoticeForm(noticeId = null) {
    const formContainer = document.getElementById('admin-notice-form-container');
    const idInput = document.getElementById('admin-notice-id');
    const titleInput = document.getElementById('admin-notice-title');
    const contentInput = document.getElementById('admin-notice-content');

    if (noticeId) {
        const notice = adminNotices.find(n => String(n.id) === String(noticeId));
        if (notice) {
            idInput.value = notice.id;
            titleInput.value = notice.title;
            contentInput.value = notice.content;
        }
    } else {
        idInput.value = '';
        titleInput.value = '';
        contentInput.value = '';
    }

    formContainer.style.display = 'block';
    titleInput.focus();
}

function closeNoticeForm() {
    document.getElementById('admin-notice-form-container').style.display = 'none';
}

async function saveNotice() {
    const id = document.getElementById('admin-notice-id').value;
    const title = document.getElementById('admin-notice-title').value.trim();
    const content = document.getElementById('admin-notice-content').value.trim();

    if (!title || !content) {
        showAlert("제목과 내용을 모두 입력해주세요.");
        return;
    }

    const { db, doc, updateDoc, setDoc } = window.firebase;
    const noticeRef = doc(db, FIRESTORE_COLLECTIONS.COMMON, 'notice');

    try {
        let updatedItems = [...adminNotices];
        if (id) {
            const index = updatedItems.findIndex(n => String(n.id) === String(id));
            if (index !== -1) {
                updatedItems[index] = { ...updatedItems[index], title, content };
            }
        } else {
            const newId = 'notice_' + Date.now();
            updatedItems.unshift({ id: newId, title, content, timestamp: new Date() });
            const likeDocRef = doc(db, FIRESTORE_COLLECTIONS.NOTICE_LIKES, newId);
            await setDoc(likeDocRef, { likedBy: [], likeCount: 0 });
        }

        await updateDoc(noticeRef, { items: updatedItems });
        showToast(id ? "공지사항이 수정되었습니다." : "새 공지사항이 등록되었습니다.");
        closeNoticeForm();
        await loadAdminAnnouncements();
    } catch (e) {
        console.error("공지사항 저장 실패:", e);
        showAlert("저장 중 오류가 발생했습니다.");
    }
}

window.editAdminNotice = openNoticeForm;

window.deleteAdminNotice = async (noticeId) => {
    if (!await showConfirm("정말 이 공지사항을 삭제하시겠습니까?")) return;

    const { db, doc, updateDoc, deleteDoc } = window.firebase;
    try {
        const updatedItems = adminNotices.filter(n => String(n.id) !== String(noticeId));
        await updateDoc(doc(db, FIRESTORE_COLLECTIONS.COMMON, 'notice'), { items: updatedItems });
        await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.NOTICE_LIKES, noticeId));
        showToast("공지사항이 삭제되었습니다.");
        await loadAdminAnnouncements();
    } catch (e) {
        console.error("공지사항 삭제 실패:", e);
        showAlert("삭제 중 오류가 발생했습니다.");
    }
};

// --- 민원 정보 관리 ---

async function loadAdminComplaints() {
    const listEl = document.getElementById('admin-complaint-list');
    const categorySelect = document.getElementById('admin-complaint-category-filter');
    try {
        const { db, doc, getDoc } = window.firebase;
        const docRef = doc(db, FIRESTORE_COLLECTIONS.COMPLAINTS, FIRESTORE_DOCUMENTS.MAIN_DATA);
        const docSnap = await getDoc(docRef);

        adminComplaints = (docSnap.exists() && docSnap.data().items) ? docSnap.data().items : [];

        const categories = [...new Set(adminComplaints.map(c => c.category))];
        categorySelect.innerHTML = `<option value="all">전체 카테고리</option>${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}`;

        renderAdminComplaintsList('all');
    } catch (e) {
        console.error("민원 목록 로드 실패:", e);
        listEl.innerHTML = '<p style="color:red;">데이터를 불러오는 데 실패했습니다.</p>';
    }
}

function renderAdminComplaintsList(filterCategory) {
    const listEl = document.getElementById('admin-complaint-list');
    const filtered = filterCategory === 'all' ? adminComplaints : adminComplaints.filter(c => c.category === filterCategory);

    if (filtered.length === 0) {
        listEl.innerHTML = '<p class="empty-history">해당하는 민원이 없습니다.</p>';
        return;
    }

    listEl.innerHTML = `<ul class="history-list" style="margin-top: 0;">${filtered.map(c => `
        <li class="history-item">
            <div class="history-item-content">
                <div class="history-item-title">
                    <span class="complaint-category">${c.category}</span>
                    ${c.title}
                </div>
            </div>
            <div class="admin-item-actions" style="display: flex; gap: 8px; white-space: nowrap;">
                <button class="btn-action" onclick="window.editAdminComplaint(${c.id})" style="padding: 4px 8px; font-size: 0.8rem;">수정</button>
                <button class="btn-action" onclick="window.deleteAdminComplaint(${c.id})" style="padding: 4px 8px; font-size: 0.8rem; color: #ef4444; border-color: #fca5a5; background: #fef2f2;">삭제</button>
            </div>
        </li>`).join('')}</ul>`;
}

function openComplaintForm(complaintId = null, defaultCategory = '') {
    const form = document.getElementById('admin-complaint-form-container');
    const idInput = document.getElementById('admin-complaint-id');
    const categoryInput = document.getElementById('admin-complaint-category');
    const titleInput = document.getElementById('admin-complaint-title');
    const contentInput = document.getElementById('admin-complaint-content');

    if (complaintId !== null) {
        const complaint = adminComplaints.find(c => String(c.id) === String(complaintId));
        if (complaint) {
            idInput.value = complaint.id;
            categoryInput.value = complaint.category;
            titleInput.value = complaint.title;
            contentInput.value = complaint.content;
        }
    } else {
        idInput.value = '';
        categoryInput.value = defaultCategory;
        titleInput.value = '';
        contentInput.value = '';
    }
    form.style.display = 'block';
    categoryInput.focus();
}

function closeComplaintForm() {
    document.getElementById('admin-complaint-form-container').style.display = 'none';
}

async function saveComplaint() {
    const id = document.getElementById('admin-complaint-id').value;
    const category = document.getElementById('admin-complaint-category').value.trim();
    const title = document.getElementById('admin-complaint-title').value.trim();
    const content = document.getElementById('admin-complaint-content').value.trim();

    if (!category || !title || !content) {
        showAlert("카테고리, 제목, 내용을 모두 입력해주세요.");
        return;
    }

    const { db, doc, setDoc } = window.firebase;
    const docRef = doc(db, FIRESTORE_COLLECTIONS.COMPLAINTS, FIRESTORE_DOCUMENTS.MAIN_DATA);

    try {
        let updatedItems = [...adminComplaints];
        if (id) {
            const index = updatedItems.findIndex(c => String(c.id) === String(id));
            if (index !== -1) updatedItems[index] = { id: parseInt(id, 10), category, title, content };
        } else {
            const newId = updatedItems.reduce((max, c) => Math.max(max, parseInt(c.id, 10)), 0) + 1;
            updatedItems.push({ id: newId, category, title, content });
        }

        await setDoc(docRef, { items: updatedItems });
        sessionStorage.removeItem(COMPLAINTS_DATA_KEY);
        showToast(id ? "민원이 수정되었습니다." : "새 민원이 추가되었습니다.");
        closeComplaintForm();
        await loadAdminComplaints();

        if (await showConfirm("변경 사항이 메인 화면에 반영되려면 새로고침이 필요합니다. 새로고침 하시겠습니까?")) {
            location.reload();
        }
    } catch (e) {
        console.error("민원 저장 실패:", e);
        showAlert("저장 중 오류가 발생했습니다.");
    }
}

window.editAdminComplaint = openComplaintForm;

window.deleteAdminComplaint = async (complaintId) => {
    if (!await showConfirm("정말 이 민원을 삭제하시겠습니까? (이미 완료된 내역이 있는 경우 문제가 발생할 수 있습니다.)")) return;

    const { db, doc, setDoc } = window.firebase;
    const docRef = doc(db, FIRESTORE_COLLECTIONS.COMPLAINTS, FIRESTORE_DOCUMENTS.MAIN_DATA);

    try {
        const updatedItems = adminComplaints.filter(c => String(c.id) !== String(complaintId));

        await setDoc(docRef, { items: updatedItems });

        sessionStorage.removeItem(COMPLAINTS_DATA_KEY);
        showToast("민원이 삭제되었습니다.");

        await loadAdminComplaints();

        // 카테고리 필터가 현재 삭제된 카테고리를 가리키고 있다면 전체로 변경
        const filterEl = document.getElementById('admin-complaint-category-filter');
        if (filterEl && filterEl.value !== 'all' && !updatedItems.find(c=>c.category === filterEl.value)) {
            filterEl.value = 'all';
            renderAdminComplaintsList('all');
        }

    } catch (e) {
        console.error("민원 삭제 실패:", e);
        showAlert("삭제 중 오류가 발생했습니다.");
    }
};
