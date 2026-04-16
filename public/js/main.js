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

// 파일 상단에 추가
const FIRESTORE_COLLECTIONS = {
    COMPLAINTS: "complaints",
    COMPLETIONS: "completions",
    GUESTBOOK: "guestbook",
    COMMON: "common"
};
const FIRESTORE_DOCUMENTS = {
    MAIN_DATA: "main-data"
};

// Firebase 초기화
try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);

    // 기존 코드에서 window.firebase를 사용하므로, 필요한 모듈들을 전역으로 노출합니다.
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

async function signInAnonymouslyIfNeeded() {
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

// 상태 키
const USER_INFO_KEY = 'maegyo_user_info';
const COMPLAINT_STATUS_KEY = 'complaint_status';
const COMPLAINTS_DATA_KEY = 'complaints_data_cache';

let TOTAL_COMPLAINTS = 0; // 동적으로 설정될 값

// DOM 요소
const onboardingScreen = document.getElementById('onboarding-screen');
const mainApp = document.getElementById('main-app');
const drawerOverlay = document.getElementById('drawer-overlay');
const drawerMenu = document.getElementById('drawer-menu');
const menuBtn = document.getElementById('menu-btn');
const displayApt = document.getElementById('display-apt');
const displayNickname = document.getElementById('display-nickname');
const pageTitle = document.getElementById('page-title');

// 페이지 관리
const pages = {
    complaint: document.getElementById('complaint-page'),
    stats: document.getElementById('stats-page'),
    guestbook: document.getElementById('guestbook-page')
};

// 앱 초기화
async function initApp() {
    const userInfo = localStorage.getItem(USER_INFO_KEY);
    if (!userInfo) {
        onboardingScreen.style.display = 'flex';
        mainApp.style.display = 'none';
    } else {
        try {
            const parsedInfo = JSON.parse(userInfo);
            applyUserInfo(parsedInfo.apartment, parsedInfo.nickname);
            onboardingScreen.style.display = 'none';
            mainApp.style.display = 'block';
            await signInAnonymouslyIfNeeded();
                await syncServerCompletionState();
                await checkNewAnnouncements();
            await syncServerCompletionState();
            await loadAndRenderComplaints();
            await initComplaintApp();
        } catch (e) {
            console.error("앱 초기화 실패:", e);
            alert("앱을 초기화하는 데 실패했습니다. 네트워크 연결을 확인하거나 잠시 후 다시 시도해 주세요.");
            localStorage.removeItem(USER_INFO_KEY);
            location.reload();
        }
    }
}

// 사용자 정보 적용
function applyUserInfo(apt, nickname) {
    if (displayApt) displayApt.innerText = apt;
    if (displayNickname) displayNickname.innerText = nickname;
}

// 온보딩 폼 제출
const startBtn = document.getElementById('start-btn');
if (startBtn) {
    startBtn.addEventListener('click', async () => {
        const aptSelect = document.getElementById('apt-select');
        const nicknameInput = document.getElementById('nickname-input');

        const apt = aptSelect.value;
        const nickname = nicknameInput.value.trim();

        if (!apt) {
            alert('거주하시는 아파트를 선택해 주세요.');
            return;
        }
        if (!nickname) {
            alert('사용하실 닉네임을 입력해 주세요.');
            return;
        }

        const userInfo = { apartment: apt, nickname: nickname };
        localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));

        applyUserInfo(apt, nickname);

        try {
            console.log('\'시작하기\' 버튼 클릭. 데이터 로딩을 시작합니다...');
            await signInAnonymouslyIfNeeded();
            await syncServerCompletionState();
            await checkNewAnnouncements();
            await syncServerCompletionState();
            // 시작하기 버튼 클릭 시 데이터 로딩 시도
            await loadAndRenderComplaints();
            console.log('데이터 로딩 완료. UI를 업데이트합니다.');
            onboardingScreen.style.display = 'none';
            mainApp.style.display = 'block';
            await initComplaintApp();
            console.log('앱 초기화 완료.');
        } catch (e) {
            console.error('데이터 로딩 또는 앱 초기화 중 오류 발생:', e);
            alert('네트워크 문제로 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
    });
}

// 드로어 메뉴 토글
if (menuBtn) {
    menuBtn.addEventListener('click', () => {
        drawerMenu.classList.add('open');
        drawerOverlay.classList.add('show');
    });
}

if (drawerOverlay) {
    drawerOverlay.addEventListener('click', () => {
        drawerMenu.classList.remove('open');
        drawerOverlay.classList.remove('show');
    });
}

// 페이지 전환 네비게이션
document.querySelectorAll('.drawer-nav li').forEach(navItem => {
    navItem.addEventListener('click', async function () {
        document.querySelectorAll('.drawer-nav li').forEach(li => li.classList.remove('active'));
        this.classList.add('active');
        pageTitle.innerText = this.innerText.trim();
        const targetPage = this.dataset.page;
        Object.values(pages).forEach(page => {
            if (page) page.style.display = 'none';
        });
        // 모든 페이지 전환 시, '모두 완료' 화면을 기본적으로 숨깁니다.
        const allCompletedScreen = document.getElementById('all-completed-screen');
        if (allCompletedScreen) allCompletedScreen.style.display = 'none';

        if (pages[targetPage]) {
            pages[targetPage].style.display = 'block';
            if (targetPage === 'stats') {
                await loadStats();
            } else if (targetPage === 'complaint') {
                await initComplaintApp();
            } else if (targetPage === 'guestbook') {
                await loadGuestbook();
            }
        }
        drawerMenu.classList.remove('open');
        drawerOverlay.classList.remove('show');
    });

    // 알림 팝오버 관련
    const notificationBtn = document.getElementById('notification-btn');
    const notificationPopover = document.getElementById('notification-popover');
    const notificationDot = document.getElementById('notification-dot');

    if (notificationBtn) {
        notificationBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const isShown = notificationPopover.classList.toggle('show');
            if (isShown) {
                loadAnnouncements();
                notificationDot.style.display = 'none';
            }
        });
    }

    // 팝오버 외부 클릭 시 닫기
    document.addEventListener('click', (event) => {
        if (notificationPopover && notificationPopover.classList.contains('show')) {
            if (!notificationPopover.contains(event.target) && !notificationBtn.contains(event.target)) {
                notificationPopover.classList.remove('show');
            }
        }
    });
});

let allAnnouncements = [];
let currentAnnouncementPage = 1;
const announcementsPerPage = 1;

window.changeAnnouncementPage = (event, page) => {
    event.stopPropagation();
    const totalPages = Math.ceil(allAnnouncements.length / announcementsPerPage);
    if (page < 1 || page > totalPages) {
        return;
    }
    currentAnnouncementPage = page;
    renderAnnouncements();
};

function renderAnnouncements() {
    const contentEl = document.getElementById('notification-content');

    if (!allAnnouncements || allAnnouncements.length === 0) {
        contentEl.innerHTML = '<div class="announcement-empty">새로운 공지사항이 없습니다.</div>';
        return;
    }

    const startIndex = (currentAnnouncementPage - 1) * announcementsPerPage;
    const endIndex = startIndex + announcementsPerPage;
    const pageItems = allAnnouncements.slice(startIndex, endIndex);

    let announcementsHtml = '';
    pageItems.forEach(item => {
        const date = item.timestamp.toDate();
        const dateString = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        const contentHtml = window.marked ? window.marked.parse(item.content || '') : item.content;
        announcementsHtml += `
            <div class="announcement-item">
                <div class="date">${dateString}</div>
                <div class="title">${item.title}</div>
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

/**
 * 개발자에게 문의 이메일 링크 클릭을 처리합니다.
 * 이메일 주소를 클립보드에 복사하고, mailto 링크를 엽니다.
 * @param {MouseEvent} event - 클릭 이벤트 객체
 */
function handleContactClick(event) {
    event.preventDefault();
    const email = 'maegyo.jjuny@gmail.com';

    // 클립보드 API를 지원하는지 확인합니다.
    if (!navigator.clipboard) {
        // 지원하지 않으면 mailto 링크만 실행합니다.
        window.location.href = `mailto:${email}`;
        return;
    }

    // 이메일을 클립보드에 복사합니다.
    navigator.clipboard.writeText(email).then(() => {
        // 복사 성공 시 토스트 메시지를 보여줍니다.
        showToast('문의 이메일이 복사되었습니다.');
        // mailto 링크를 실행하여 메일 클라이언트를 엽니다.
        window.location.href = `mailto:${email}`;
    }).catch(err => {
        console.error('이메일 복사에 실패했습니다:', err);
        // 복사에 실패해도 mailto 링크를 실행합니다.
        window.location.href = `mailto:${email}`;
    });
}
// onclick 핸들러에서 전역적으로 접근할 수 있도록 window 객체에 할당합니다.
window.handleContactClick = handleContactClick;


async function loadAnnouncements() {
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

async function checkNewAnnouncements() {
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


// --- Firebase 데이터 로직 ---

async function getComplaintsData() {
    const cachedData = sessionStorage.getItem(COMPLAINTS_DATA_KEY);
    if (cachedData) {
        console.log("캐시에서 민원 목록 로드");
        return JSON.parse(cachedData);
    }

    if (!window.firebase) throw new Error("Firebase not initialized");

    console.log("Firestore에서 민원 목록 로드");
    const { db, doc, getDoc } = window.firebase;
    const docRef = doc(db, FIRESTORE_COLLECTIONS.COMPLAINTS, FIRESTORE_DOCUMENTS.MAIN_DATA);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const complaints = docSnap.data().items || [];
        sessionStorage.setItem(COMPLAINTS_DATA_KEY, JSON.stringify(complaints));
        return complaints;
    } else {
        console.log("Firestore에 'main-data' 문서가 없습니다.");
        // 문서가 없는 경우 빈 배열을 반환하여 앱이 중단되지 않고 빈 목록을 렌더링하도록 처리
        return [];
    }
}



async function loadStats() {
    if (!window.firebase) return;

    const totalEl = document.getElementById('total-participants');
    const rankingEl = document.getElementById('ranking-container');
    const rankingByCountEl = document.getElementById('ranking-by-count-container');

    totalEl.innerHTML = '<div class="loading-spinner"></div>';
    rankingEl.innerHTML = '<div class="loading-spinner"></div>';
    if(rankingByCountEl) rankingByCountEl.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const { db, collection, getDocs, query, where } = window.firebase;
        const today = getToday();

        const q = query(collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS), where("date", "==", today));
        const querySnapshot = await getDocs(q);

        // 1. Update total participants count
        totalEl.innerHTML = querySnapshot.size + '명';

        const emptyRankingHtml = `
            <ul class="ranking-list">
                <li class="ranking-item empty"><div class="rank rank-1">1</div><div class="user-info"><div class="nickname">없음</div></div></li>
                <li class="ranking-item empty"><div class="rank rank-2">2</div><div class="user-info"><div class="nickname">없음</div></div></li>
                <li class="ranking-item empty"><div class="rank rank-3">3</div><div class="user-info"><div class="nickname">없음</div></div></li>
            </ul>`;

        if (querySnapshot.empty) {
            rankingEl.innerHTML = emptyRankingHtml;
            if(rankingByCountEl) rankingByCountEl.innerHTML = emptyRankingHtml;
            return;
        }

        const allDocs = [...querySnapshot.docs];

        // 2. Process Ranking by Speed (Fastest)
        const sortedBySpeed = allDocs.sort((docA, docB) => {
            const tsA = docA.data().timestamp?.seconds || 0;
            const tsB = docB.data().timestamp?.seconds || 0;
            return tsA - tsB;
        });
        const top3BySpeed = sortedBySpeed.slice(0, 3);
        let speedRankingHtml = '<ul class="ranking-list">';
        top3BySpeed.forEach((docSnap, index) => {
            const data = docSnap.data();
            let timeStr = "";
            if (data.timestamp) {
                const dateObj = new Date(data.timestamp.seconds * 1000);
                timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            }
            speedRankingHtml += `
                <li class="ranking-item">
                    <div class="rank rank-${index + 1}">${index + 1}</div>
                    <div class="user-info">
                        <div class="nickname">${data.nickname}</div>
                        <div class="apt-name">${data.apartment}</div>
                    </div>
                    <div class="timestamp">${timeStr}</div>
                </li>`;
        });
        speedRankingHtml += '</ul>';
        rankingEl.innerHTML = speedRankingHtml;

        // 3. Process Ranking by Count (Most Active)
        if (rankingByCountEl) {
            const sortedByCount = allDocs.sort((docA, docB) => (docB.data().totalCount || 0) - (docA.data().totalCount || 0));
            const top3ByCount = sortedByCount.slice(0, 3);
            let countRankingHtml = '<ul class="ranking-list">';
            top3ByCount.forEach((docSnap, index) => {
                const data = docSnap.data();
                countRankingHtml += `
                    <li class="ranking-item">
                        <div class="rank rank-${index + 1}">${index + 1}</div>
                        <div class="user-info">
                            <div class="nickname">${data.nickname}</div>
                            <div class="apt-name">${data.apartment}</div>
                        </div>
                        <div class="ranking-count">${data.totalCount || 0}건</div>
                    </li>`;
            });
            countRankingHtml += '</ul>';
            rankingByCountEl.innerHTML = countRankingHtml;
        }

    } catch (e) {
        console.error("통계 로드 중 오류:", e);
        totalEl.innerHTML = "오류";
        rankingEl.innerHTML = "통계를 불러올 수 없습니다.";
        if(rankingByCountEl) rankingByCountEl.innerHTML = "통계를 불러올 수 없습니다.";
    }
}


// --- 민원 접수 로직 ---
function getToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getCompletionStatus() {
    const status = localStorage.getItem(COMPLAINT_STATUS_KEY);
    if (!status) return { date: getToday(), lastCompletedStep: 0, completed: [] };
    try {
        const parsed = JSON.parse(status);
        if (parsed.date !== getToday()) {
            localStorage.removeItem(COMPLAINT_STATUS_KEY);
            return { date: getToday(), lastCompletedStep: 0, completed: [] };
        }
        return parsed;
    } catch (e) {
        return { date: getToday(), lastCompletedStep: 0, completed: [] };
    }
}

function setLastCompletedStep(step) {
    const status = getCompletionStatus();
    if (status.lastCompletedStep < step) {
        status.lastCompletedStep = step;
        localStorage.setItem(COMPLAINT_STATUS_KEY, JSON.stringify(status));
    }
}

const COMPLAINT_HISTORY_KEY = 'maegyo_complaint_history';
const SERVER_COMPLETION_STATE_KEY = 'maegyo_server_completion_state';


function getServerCompletionState() {
    const state = localStorage.getItem(SERVER_COMPLETION_STATE_KEY);
    if (!state) return { date: getToday(), totalCount: 0, complaints: {} };
    try {
        const parsed = JSON.parse(state);
        // If the stored state is not for today, reset it.
        if (parsed.date !== getToday()) {
            const newState = { date: getToday(), totalCount: 0, complaints: {} };
            localStorage.setItem(SERVER_COMPLETION_STATE_KEY, JSON.stringify(newState));
            return newState;
        }
        return parsed;
    } catch (e) {
        return { date: getToday(), totalCount: 0, complaints: {} };
    }
}

async function syncServerCompletionState() {
    if (!window.firebase || !window.firebase.auth.currentUser) {
        console.log("Cannot sync server state, user not logged in.");
        // Set a default empty state for today
        const state = { date: getToday(), totalCount: 0, complaints: {} };
        localStorage.setItem(SERVER_COMPLETION_STATE_KEY, JSON.stringify(state));
        return;
    }

    const { db, collection, query, where, getDocs } = window.firebase;
    const uid = window.firebase.auth.currentUser.uid;
    const today = getToday();

    try {
        const q = query(collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS), where("uid", "==", uid), where("date", "==", today));
        const querySnapshot = await getDocs(q);

        let serverState;
        if (querySnapshot.empty) {
            serverState = { date: today, totalCount: 0, complaints: {} };
        } else {
            const data = querySnapshot.docs[0].data();
            serverState = {
                date: today,
                totalCount: data.totalCount || 0,
                complaints: data.complaints || {}
            };
        }
        localStorage.setItem(SERVER_COMPLETION_STATE_KEY, JSON.stringify(serverState));
        console.log("Server completion state synced to localStorage:", serverState);
    } catch (e) {
        console.error("Error syncing server completion state:", e);
        // On error, assume no submission
        const serverState = { date: today, totalCount: 0, complaints: {} };
        localStorage.setItem(SERVER_COMPLETION_STATE_KEY, JSON.stringify(serverState));
    }
}

function getCompletionHistory() {
    return JSON.parse(localStorage.getItem(COMPLAINT_HISTORY_KEY) || '{}');
}

function recordLocalComplaintCompletion(complaintId) {
    const history = getCompletionHistory();
    const today = getToday();
    if (!history[today]) {
        history[today] = {};
    }
    history[today][complaintId] = (history[today][complaintId] || 0) + 1;
    localStorage.setItem(COMPLAINT_HISTORY_KEY, JSON.stringify(history));
}

function setComplaintCompleted(complaintId) {
    recordLocalComplaintCompletion(complaintId);

    // 각 액션에 대한 세션 스토리지 플래그를 재설정하여 동일한 민원을 다시 완료할 수 있도록 합니다.
    sessionStorage.removeItem(`complaint_${complaintId}_제목_clicked`);
    sessionStorage.removeItem(`complaint_${complaintId}_내용_clicked`);
    sessionStorage.removeItem(`complaint_${complaintId}_submit_clicked`);

    // UI 업데이트
    updateComplaintCard(complaintId.toString());
    showToast(`${complaintId}번 민원이 추가 완료되었습니다.`);

    // 완료된 카드 접기
    const card = document.getElementById(`complaint-${complaintId}`);
    if (card) {
        const title = card.querySelector('.card-title');
        const wrapper = title.nextElementSibling;
        if (title && wrapper && !title.classList.contains('collapsed')) {
            title.classList.add('collapsed');
            wrapper.classList.add('collapsed');
        }
    }

    // `checkAllCompleted`는 더 이상 사용되지 않으므로 관련 로직을 제거합니다.
}

async function checkAllCompleted() {
    const status = getCompletionStatus();
    const allCompletedScreen = document.getElementById('all-completed-screen');
    const complaintPage = document.getElementById('complaint-page');

    if (TOTAL_COMPLAINTS === 0) {
        const complaintsData = await getComplaintsData();
        TOTAL_COMPLAINTS = complaintsData.length;
    }

    if (status.completed.length >= TOTAL_COMPLAINTS && TOTAL_COMPLAINTS > 0) {
        complaintPage.style.display = 'none';
        if (allCompletedScreen) {
            allCompletedScreen.style.display = 'block';
            if (allCompletedScreen.parentNode !== complaintPage.parentNode) {
                complaintPage.parentNode.appendChild(allCompletedScreen);
            }
        }

        const completedDate = document.getElementById('completed-date');
        if (completedDate) completedDate.innerText = `${status.date} 완료`;

    } else {
        if (allCompletedScreen) allCompletedScreen.style.display = 'none';
        complaintPage.style.display = 'block';
    }
}

async function renderHistory(category = 'all') {
    const container = document.getElementById('history-container');
    if (!container) return;

    const isInitialLoad = !document.getElementById('history-category-filter')?.options.length;
    if (isInitialLoad) {
        container.innerHTML = '<div class="loading-spinner"></div>';
    }

    try {
        const masterComplaints = await getComplaintsData();

        const selectEl = document.getElementById('history-category-filter');
        if (selectEl && isInitialLoad) {
            const categories = ['all', ...new Set(masterComplaints.map(c => c.category))];
            selectEl.innerHTML = categories.map(cat => `<option value="${cat}">${cat === 'all' ? '전체' : cat}</option>`).join('');

            if (!selectEl.dataset.listenerAttached) {
                selectEl.addEventListener('change', (e) => {
                    renderHistory(e.target.value);
                });
                selectEl.dataset.listenerAttached = 'true';
            }
        }

        const history = getCompletionHistory();
        const today = getToday();
        const todaysCompletions = history[today] || {};

        if (!masterComplaints || masterComplaints.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: var(--text-muted);">현재 등록된 민원이 없습니다.</p>`;
            return;
        }

        const complaintsToRender = category === 'all'
            ? masterComplaints
            : masterComplaints.filter(c => c.category === category);

        let html;
        if (complaintsToRender.length === 0) {
            html = `<p style="text-align: center; color: var(--text-muted); padding: 20px 0;">해당 카테고리의 민원이 없습니다.</p>`;
        } else {
            html = '<ul class="history-list">';
            complaintsToRender.forEach(complaint => {
                const count = todaysCompletions[complaint.id] || 0;
                html += `
                    <li class="history-item">
                         <div class="history-item-content">
                            <div class="history-item-title">
                               <span class="complaint-category">${complaint.category}</span>
                               ${complaint.title}
                            </div>
                        </div>
                        <span class="history-count">${count}건 완료</span>
                    </li>
                `;
            });
            html += '</ul>';
        }
        container.innerHTML = html;
    } catch (e) {
        console.error("민원 내역 렌더링 중 오류 발생:", e);
        container.innerHTML = `<p>내역을 불러오는 중 오류가 발생했습니다.</p>`;
    }
}

    window.goToStep = async function(step) {
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    const stepEl = document.getElementById(`step-${step}`);
    if (stepEl) stepEl.classList.add('active');

    const progressBar = document.querySelector('.progress-bar');
    const step1 = document.getElementById('progress-step-1');
    const step2 = document.getElementById('progress-step-2');
    const step3 = document.getElementById('progress-step-3');

    if (step1) step1.classList.remove('active', 'completed');
    if (step2) step2.classList.remove('active', 'completed');
    if (step3) step3.classList.remove('active', 'completed');

    if (step === 1) {
        if (progressBar) progressBar.style.width = '0%';
        if (step1) step1.classList.add('active');
    } else if (step === 2) {
        if (progressBar) progressBar.style.width = '50%';
        if (step1) step1.classList.add('completed');
        if (step2) step2.classList.add('active');
        await openFirstUncompletedCard();
    } else if (step === 3) {
        if (progressBar) progressBar.style.width = '100%';
        if (step1) step1.classList.add('completed');
        if (step2) step2.classList.add('completed');
        if (step3) step3.classList.add('active');

        // 로컬 기록을 먼저 확인하여 버튼 표시 여부 결정
        const uploadButton = document.getElementById('upload-summary-btn');
        const history = getCompletionHistory();
        const today = getToday();
        const todaysCompletions = history[today] || {};
        const totalCount = Object.values(todaysCompletions).reduce((sum, count) => sum + count, 0);

        if (totalCount === 0) {
            if(uploadButton) uploadButton.style.display = 'none';
        } else {
            if(uploadButton) uploadButton.style.display = 'block';
        }

        // 함수들을 순차적으로 실행
        await renderHistory();
        await updateRankingButtonState();
    }
}

async function openFirstUncompletedCard() {
    const status = getCompletionStatus();
    let opened = false;
    const complaintsData = await getComplaintsData();

    complaintsData.forEach(complaint => {
        const card = document.getElementById(`complaint-${complaint.id}`);
        if (!card) return;

        const title = card.querySelector('.card-title');
        const wrapper = title.nextElementSibling;

        if (status.completed.includes(complaint.id)) {
            title.classList.add('collapsed');
            wrapper.classList.add('collapsed');
        } else if (!opened) {
            title.classList.remove('collapsed');
            wrapper.classList.remove('collapsed');
            opened = true;
        } else {
            title.classList.add('collapsed');
            wrapper.classList.add('collapsed');
        }
    });
}

function checkCompletion(complaintId) {
    const titleClicked = sessionStorage.getItem(`complaint_${complaintId}_제목_clicked`) === 'true';
    const contentClicked = sessionStorage.getItem(`complaint_${complaintId}_내용_clicked`) === 'true';
    const submitClicked = sessionStorage.getItem(`complaint_${complaintId}_submit_clicked`) === 'true';

    if (titleClicked && contentClicked && submitClicked) {
        setComplaintCompleted(parseInt(complaintId));
    }
}

window.copyInput = function (elementId, typeLabel, complaintId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    navigator.clipboard.writeText(element.value).then(() => {
        showToast(`✅ ${typeLabel}이(가) 복사되었습니다.`);
        sessionStorage.setItem(`complaint_${complaintId}_${typeLabel}_clicked`, 'true');
        checkCompletion(complaintId);
    }).catch(err => {
        alert('복사에 실패했습니다. 수동으로 복사해 주세요.');
    });
}

window.handleFormSubmit = function (element, event) {
    event.stopPropagation();
    const complaintId = element.dataset.complaintId;
    sessionStorage.setItem(`complaint_${complaintId}_submit_clicked`, 'true');
    checkCompletion(complaintId);
}

const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        setLastCompletedStep(1);
        goToStep(2);
    });
}

const pStep1 = document.getElementById('progress-step-1');
if (pStep1) pStep1.addEventListener('click', () => goToStep(1));

const pStep2 = document.getElementById('progress-step-2');
if (pStep2) {
    pStep2.addEventListener('click', () => {
        const status = getCompletionStatus();
        if (status.lastCompletedStep >= 1) {
            goToStep(2);
        } else {
            showToast('1단계를 먼저 완료해주세요.');
        }
    });
}

const pStep3 = document.getElementById('progress-step-3');
if (pStep3) {
    pStep3.addEventListener('click', () => {
        const status = getCompletionStatus();
        if (status.lastCompletedStep >= 1) {
            goToStep(3);
        } else {
            showToast('1단계를 먼저 완료해주세요.');
        }
    });
}

const restartBtn = document.getElementById('restart-btn');
if (restartBtn) {
    restartBtn.addEventListener('click', async () => {
        localStorage.removeItem(COMPLAINT_STATUS_KEY);

        const allCompletedScreen = document.getElementById('all-completed-screen');
        if (allCompletedScreen) allCompletedScreen.style.display = 'none';

        document.getElementById('complaint-page').style.display = 'block';

        setLastCompletedStep(1);

        await loadAndRenderComplaints();
        goToStep(2);
    });
}

window.showToast = function (message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => {
        toast.className = toast.className.replace("show", "");
    }, 2500);
}

function renderComplaints(complaintsData, category = 'all') {
    const container = document.getElementById('complaint-list-container');
    if (!container) return;

    let html = '';
    const complaintsToRender = category === 'all'
        ? complaintsData
        : complaintsData.filter(c => c.category === category);

    if (complaintsToRender.length === 0 && category !== 'all') {
        html = `<p style="text-align:center; color: var(--text-muted); padding: 20px 0;">해당 카테고리의 민원이 없습니다.</p>`;
    } else if (complaintsToRender.length === 0) {
        html = `<p style="text-align:center; color: var(--text-muted); padding: 20px 0;">현재 등록된 민원이 없습니다. 관리자에게 문의하세요.</p>`;
    } else {
        complaintsToRender.forEach(c => {
            html += `
                <div class="card complaint-card" id="complaint-${c.id}" data-category="${c.category}">
                    <h2 class="card-title" data-complaint-id="${c.id}">
                        <span>
                            <span class="badge-completed" style="display:none;">완료</span>
                            <span class="complaint-category">${c.category}</span>
                            ${c.title}
                        </span>
                        <span class="toggle-icon">▲</span>
                    </h2>
                    <div class="card-content-wrapper">
                        <div class="section" onclick="event.stopPropagation()">
                            <div class="section-header">📌 제목</div>
                            <input type="text" id="title${c.id}" aria-label="${c.id}번 민원 제목" value="${c.title}">
                        </div>
                        <div class="section" onclick="event.stopPropagation()">
                            <div class="section-header">📝 내용</div>
                            <textarea id="content${c.id}" aria-label="${c.id}번 민원 내용">${c.content}</textarea>
                        </div>
                        <div class="button-group" onclick="event.stopPropagation()">
                            <button class="btn-copy" onclick="copyInput('title${c.id}', '제목', ${c.id})">
                                <svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                제목 복사
                            </button>
                            <button class="btn-copy" onclick="copyInput('content${c.id}', '내용', ${c.id})">
                                <svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                내용 복사
                            </button>
                        </div>
                        <a href="https://www.epeople.go.kr/nep/pttn/gnrlPttn/PttnRqstWrtnInfo.paid" target="_blank" class="btn-submit" data-complaint-id="${c.id}" onclick="handleFormSubmit(this, event)">
                            <svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            <span>${c.id}번 민원 신청하러 가기</span>
                        </a>
                    </div>
                </div>
            `;
        });
    }
    container.innerHTML = html;
    initComplaintCards();
}

function renderCategoryFilter(complaintsData) {
    const categories = ['all', ...new Set(complaintsData.map(c => c.category))];
    const selectEl = document.getElementById('category-filter');
    if (!selectEl) return;

    selectEl.innerHTML = categories.map(cat => `<option value="${cat}">${cat === 'all' ? '전체' : cat}</option>`).join('');

    selectEl.addEventListener('change', (e) => {
        renderComplaints(complaintsData, e.target.value);
    });
}

function initComplaintCards() {
    document.querySelectorAll('.complaint-card').forEach(card => {
        const title = card.querySelector('.card-title');
        if (title && !title.dataset.listenerAttached) {
            card.addEventListener('click', function (e) {
                const contentWrapper = title.nextElementSibling;
                title.classList.toggle('collapsed');
                contentWrapper.classList.toggle('collapsed');
            });
            title.dataset.listenerAttached = true;
        }

        // localStorage 기록을 기반으로 각 카드의 UI 상태를 업데이트합니다.
        const complaintId = card.id.split('-')[1];
        if (complaintId) {
            updateComplaintCard(complaintId);
        }
    });
}

async function initComplaintApp() {
    sessionStorage.removeItem('pending_complaint');
    [1, 2, 3, 4, 5].forEach(id => {
        sessionStorage.removeItem(`complaint_${id}_제목_clicked`);
        sessionStorage.removeItem(`complaint_${id}_내용_clicked`);
        sessionStorage.removeItem(`complaint_${id}_submit_clicked`);
    });

    const history = getCompletionHistory();
    const today = getToday();
    const todaysCompletions = history[today] || {};

    const hasHistoryToday = Object.values(todaysCompletions).reduce((sum, count) => sum + count, 0) > 0;

    // '모두 완료' 화면은 숨기고, 민원 접수 페이지는 보이게 처리합니다.
    const allCompletedScreen = document.getElementById('all-completed-screen');
    if (allCompletedScreen) allCompletedScreen.style.display = 'none';

    const complaintPage = document.getElementById('complaint-page');
    if (complaintPage) {
        complaintPage.style.display = 'block';
    }

    if (hasHistoryToday) {
        await goToStep(3);
    } else {
        await goToStep(1);
    }
}

async function loadAndRenderComplaints() {
    const container = document.getElementById('complaint-list-container');
    if (container) {
        container.innerHTML = '<div class="loading-spinner"></div>';
    }

    try {
        const complaintsData = await getComplaintsData();
        TOTAL_COMPLAINTS = complaintsData.length;
        renderComplaints(complaintsData);
        renderCategoryFilter(complaintsData);
        const status = getCompletionStatus();
        status.completed.forEach(id => updateComplaintCard(id.toString()));
    } catch (e) {
        console.error("민원 목록 렌더링 실패:", e);
        if (container) container.innerHTML = `<p style="text-align:center; color: var(--text-muted); padding: 20px 0;">민원 목록을 불러오는 데 실패했습니다.</p>`;
        throw e;
    }
}

function updateComplaintCard(complaintId) {
    const card = document.getElementById(`complaint-${complaintId}`);
    if (!card) return;

    const badge = card.querySelector('.badge-completed');
    if (!badge) return;

    const history = getCompletionHistory();
    const today = getToday();
    const count = history[today]?.[complaintId] || 0;

    if (count > 0) {
        badge.textContent = `${count}건 완료`;
        badge.style.display = 'inline-block';
        card.classList.add('completed');
    } else {
        badge.style.display = 'none';
        card.classList.remove('completed');
    }

    // 요구사항에 따라 '민원 신청하러 가기' 버튼의 텍스트와 스타일은 변경하지 않습니다.
}

async function updateRankingButtonState() {
    const uploadSummaryBtn = document.getElementById('upload-summary-btn');
    if (!uploadSummaryBtn) return;

    // 기본 상태로 리셋
    uploadSummaryBtn.disabled = false;

    // 로컬에 저장된 서버 상태(A)를 기반으로 버튼 텍스트 설정
    const serverState = getServerCompletionState();
    const totalCountA = serverState.totalCount;

    if (totalCountA > 0) {
        uploadSummaryBtn.innerText = '접수 건수 업데이트하기 🏆';
    } else {
        uploadSummaryBtn.innerText = '민원 접수 건수 저장하기 🏆';
    }
}

const uploadSummaryBtn = document.getElementById('upload-summary-btn');
if (uploadSummaryBtn) {
    uploadSummaryBtn.addEventListener('click', async () => {
        if (!window.firebase) {
            showToast('오류: Firebase에 연결되지 않았습니다.');
            return;
        }

        const { db, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs } = window.firebase;
        const { auth } = window.firebase;

        if (!auth.currentUser) {
            await signInAnonymouslyIfNeeded();
            if (!auth.currentUser) {
                showToast('로그인이 필요합니다. 잠시 후 다시 시도해주세요.');
                return;
            }
        }
        const uid = auth.currentUser.uid;

        const history = getCompletionHistory();
        const today = getToday();
        const todaysCompletions = history[today];

        if (!todaysCompletions || Object.keys(todaysCompletions).length === 0) {
            showToast('접수한 민원 내역이 없습니다. 민원 접수 후 참여해주세요.');
            return;
        }

        uploadSummaryBtn.disabled = true;
        uploadSummaryBtn.innerText = '업로드 중...';

        try {
            const completionsCollection = collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS);
            const q = query(completionsCollection, where("uid", "==", uid), where("date", "==", today));
            const querySnapshot = await getDocs(q);
            const totalCount = Object.values(todaysCompletions).reduce((sum, count) => sum + count, 0);

            const updateLocalServerState = () => {
                const newState = { date: today, totalCount: totalCount, complaints: todaysCompletions };
                localStorage.setItem(SERVER_COMPLETION_STATE_KEY, JSON.stringify(newState));
            };

            if (querySnapshot.empty) {
                // Create a new submission
                const userInfo = JSON.parse(localStorage.getItem(USER_INFO_KEY));
                const submissionData = {
                    uid: uid,
                    date: today,
                    timestamp: serverTimestamp(),
                    nickname: userInfo.nickname,
                    apartment: userInfo.apartment,
                    complaints: todaysCompletions,
                    totalCount: totalCount,
                };
                await addDoc(completionsCollection, submissionData);
                showToast('🏆 랭킹 참여가 완료되었습니다!');
                updateLocalServerState();
            } else {
                // Update existing submission
                const docToUpdate = querySnapshot.docs[0];
                const existingTotalCount = docToUpdate.data().totalCount || 0;

                if (totalCount > existingTotalCount) {
                    const userInfo = JSON.parse(localStorage.getItem(USER_INFO_KEY));
                    await updateDoc(docToUpdate.ref, {
                        complaints: todaysCompletions,
                        totalCount: totalCount,
                        timestamp: serverTimestamp(),
                        nickname: userInfo.nickname,
                        apartment: userInfo.apartment,
                    });
                    showToast('🏆 랭킹이 성공적으로 갱신되었습니다!');
                    updateLocalServerState();
                } else {
                    showToast('이전 기록보다 민원 접수 건수가 적거나 같아 갱신되지 않았습니다.');
                }
            }
        } catch (e) {
            console.error('랭킹 참여 중 오류 발생:', e);
            showToast('오류가 발생했습니다. 다시 시도해주세요.');
        } finally {
            // Restore button state after operation
            uploadSummaryBtn.disabled = false;
            // 버튼 상태를 즉시 다시 평가
            await goToStep(3);
        }
    });
}

async function loadGuestbook() {
    if (!window.firebase) return;

    const entriesContainer = document.getElementById('guestbook-entries-container');
    const formContainer = document.getElementById('guestbook-form-container');
    const limitMsg = document.getElementById('guestbook-limit-msg');

    entriesContainer.innerHTML = '<div class="loading-spinner"></div>';

    const { db, collection, getDocs, query, where, orderBy } = window.firebase;
    const { auth } = window.firebase;

    const today = getToday();
    let hasPostedToday = false;

    // 1. Check if the current user has posted today
    if (auth.currentUser) {
        const uid = auth.currentUser.uid;
        const qUser = query(collection(db, FIRESTORE_COLLECTIONS.GUESTBOOK), where("uid", "==", uid), where("date", "==", today));
        const userSnapshot = await getDocs(qUser);
        if (!userSnapshot.empty) {
            hasPostedToday = true;
        }
    }

    // Toggle form visibility based on posting status
    if (hasPostedToday) {
        formContainer.style.display = 'none';
        limitMsg.style.display = 'block';
    } else {
        formContainer.style.display = 'block';
        limitMsg.style.display = 'none';
    }

    // 2. Load and render all guestbook entries
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

// Add event listener for guestbook submission
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
            await loadGuestbook(); // Refresh the view

        } catch(e) {
            console.error("방명록 등록 중 오류:", e);
            showToast("오류가 발생했습니다. 다시 시도해주세요.");
        } finally {
            // Restore button state
            guestbookSubmitBtn.disabled = false;
            guestbookSubmitBtn.innerText = "응원 남기기";
        }
    });
}

// Add event listener for logout button
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm('로그아웃하시겠습니까? 저장된 모든 진행 상황이 초기화됩니다.')) {
            localStorage.removeItem(USER_INFO_KEY);
            localStorage.removeItem(COMPLAINT_STATUS_KEY);
            localStorage.removeItem(COMPLAINT_HISTORY_KEY);
            sessionStorage.removeItem(COMPLAINTS_DATA_KEY);

            if (window.firebase && window.firebase.auth) {
                await window.firebase.signOut(window.firebase.auth);
                console.log("Firebase signed out.");
            }

            showToast('로그아웃되었습니다. 다시 시작해주세요.');

            setTimeout(() => {
                location.reload();
            }, 1000); // 1초 후 새로고침
        }
    });
}

// 문서 로드 시 초기화 실행
document.addEventListener('DOMContentLoaded', initApp);