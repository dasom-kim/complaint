import { initializeApp } from "firebase/app";
import {
    getFirestore,
    doc,
    getDoc,
    collection,
    addDoc,
    serverTimestamp,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    getCountFromServer
} from "firebase/firestore";
import firebaseConfig from './firebase-config.js';

// 파일 상단에 추가
const FIRESTORE_COLLECTIONS = {
    COMPLAINTS: "complaints",
    COMPLETIONS: "completions"
};
const FIRESTORE_DOCUMENTS = {
    MAIN_DATA: "main-data"
};

// Firebase 초기화
try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // 기존 코드에서 window.firebase를 사용하므로, 필요한 모듈들을 전역으로 노출합니다.
    window.firebase = {
        db,
        doc,
        getDoc,
        collection,
        addDoc,
        serverTimestamp,
        getDocs,
        query,
        where,
        orderBy,
        limit,
        getCountFromServer
    };
} catch (e) {
    console.error("Firebase 초기화에 실패했습니다. Firebase 설정을 확인해주세요.", e);
    alert("Firebase 연동에 실패했습니다. 앱이 정상적으로 동작하지 않을 수 있습니다.");
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
    stats: document.getElementById('stats-page')
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

        if (pages[targetPage]) {
            pages[targetPage].style.display = 'block';
            if (targetPage === 'stats') {
                await loadStats();
            } else if (targetPage === 'complaint') {
                await initComplaintApp();
            }
        }
        drawerMenu.classList.remove('open');
        drawerOverlay.classList.remove('show');
    });
});


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


async function recordCompletion() {
    const userInfo = JSON.parse(localStorage.getItem(USER_INFO_KEY));
    if (!userInfo || !window.firebase) return;

    try {
        const { db, collection, addDoc, serverTimestamp } = window.firebase;
        await addDoc(collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS), {
            apartment: userInfo.apartment,
            nickname: userInfo.nickname,
            date: getToday(),
            timestamp: serverTimestamp()
        });
        console.log("통계 기록 완료!");
    } catch (e) {
        console.error("통계 기록 중 오류 발생:", e);
    }
}

async function loadStats() {
    if (!window.firebase) return;

    const totalEl = document.getElementById('total-participants');
    const rankingEl = document.getElementById('ranking-container');

    totalEl.innerHTML = '<div class="loading-spinner"></div>';
    rankingEl.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const { db, collection, getDocs, query, where, orderBy, limit, getCountFromServer } = window.firebase;
        const today = getToday();

        const qTotal = query(collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS), where("date", "==", today));
        const countSnapshot = await getCountFromServer(qTotal);
        totalEl.innerHTML = countSnapshot.data().count + '명';

        const qRanking = query(collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS), where("date", "==", today), orderBy("timestamp", "asc"), limit(3));
        const rankingSnapshot = await getDocs(qRanking);

        if (rankingSnapshot.empty) {
            rankingEl.innerHTML = `
                <ul class="ranking-list">
                    <li class="ranking-item empty">
                        <div class="rank rank-1">1</div>
                        <div class="user-info"><div class="nickname">없음</div></div>
                    </li>
                    <li class="ranking-item empty">
                        <div class="rank rank-2">2</div>
                        <div class="user-info"><div class="nickname">없음</div></div>
                    </li>
                    <li class="ranking-item empty">
                        <div class="rank rank-3">3</div>
                        <div class="user-info"><div class="nickname">없음</div></div>
                    </li>
                </ul>
            `;
            return;
        }

        let rankingHtml = '<ul class="ranking-list">';
        rankingSnapshot.forEach((docSnap, index) => {
            const data = docSnap.data();
            let timeStr = "";
            if (data.timestamp) {
                const dateObj = new Date(data.timestamp.seconds * 1000);
                timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            }

            rankingHtml += `
                <li class="ranking-item">
                    <div class="rank rank-${index + 1}">${index + 1}</div>
                    <div class="user-info">
                        <div class="nickname">${data.nickname}</div>
                        <div class="apt-name">${data.apartment}</div>
                    </div>
                    <div class="timestamp">${timeStr}</div>
                </li>
            `;
        });
        rankingHtml += '</ul>';
        rankingEl.innerHTML = rankingHtml;

    } catch (e) {
        console.error("통계 로드 중 오류:", e);
        totalEl.innerHTML = "오류";
        rankingEl.innerHTML = "통계를 불러올 수 없습니다.";
    }
}


// --- 민원 접수 로직 ---
function getToday() { return new Date().toISOString().slice(0, 10); }

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

function setComplaintCompleted(complaintId) {
    const status = getCompletionStatus();
    if (status.completed.includes(complaintId)) return;

    status.completed.push(complaintId);
    localStorage.setItem(COMPLAINT_STATUS_KEY, JSON.stringify(status));

    updateComplaintCard(complaintId.toString());
    showToast(`${complaintId}번 민원이 완료 처리되었습니다.`);

    const card = document.getElementById(`complaint-${complaintId}`);
    if (card) {
        const title = card.querySelector('.card-title');
        const wrapper = title.nextElementSibling;
        if (!title.classList.contains('collapsed')) {
            title.classList.add('collapsed');
            wrapper.classList.add('collapsed');
        }
    }

    checkAllCompleted();

    if (getCompletionStatus().completed.length < TOTAL_COMPLAINTS) {
        setTimeout(openFirstUncompletedCard, 400);
    }
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

        if (sessionStorage.getItem('firebase_recorded') !== 'true') {
            recordCompletion();
            sessionStorage.setItem('firebase_recorded', 'true');
        }
    } else {
        if (allCompletedScreen) allCompletedScreen.style.display = 'none';
        complaintPage.style.display = 'block';
    }
}

async function renderHistory() {
    const container = document.getElementById('history-container');
    if (!container) return;

    const status = getCompletionStatus();
    const complaintsData = await getComplaintsData();

    if (status.completed.length === 0) {
        container.innerHTML = `
            <div class="empty-history">
                <svg class="icon" style="width: 48px; height: 48px; margin-bottom: 10px; color: #cbd5e1;" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <p>아직 오늘 접수한 민원 내역이 없습니다.</p>
            </div>
        `;
        return;
    }

    let html = '<ul class="history-list">';
    status.completed.forEach(id => {
        const complaint = complaintsData.find(c => c.id === id);
        if (complaint) {
            html += `
                <li class="history-item">
                    <svg class="icon icon-check" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    <div class="history-item-content">
                        <div class="history-item-title">${complaint.title}</div>
                        <div class="history-item-date">접수일: ${status.date}</div>
                    </div>
                </li>
            `;
        }
    });
    html += '</ul>';
    container.innerHTML = html;
}

function goToStep(step) {
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
        openFirstUncompletedCard();
    } else if (step === 3) {
        if (progressBar) progressBar.style.width = '100%';
        if (step1) step1.classList.add('completed');
        if (step2) step2.classList.add('completed');
        if (step3) step3.classList.add('active');
        renderHistory();
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
    restartBtn.addEventListener('click', () => {
        const allCompletedScreen = document.getElementById('all-completed-screen');
        if (allCompletedScreen) allCompletedScreen.style.display = 'none';

        document.getElementById('complaint-page').style.display = 'block';
        goToStep(3);
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
    });
    const status = getCompletionStatus();
    status.completed.forEach(id => updateComplaintCard(id.toString()));
}

async function initComplaintApp() {
    sessionStorage.removeItem('pending_complaint');
    [1, 2, 3, 4, 5].forEach(id => {
        sessionStorage.removeItem(`complaint_${id}_제목_clicked`);
        sessionStorage.removeItem(`complaint_${id}_내용_clicked`);
        sessionStorage.removeItem(`complaint_${id}_submit_clicked`);
    });

    const status = getCompletionStatus();
    if (status.completed.length >= TOTAL_COMPLAINTS && TOTAL_COMPLAINTS > 0) {
        await checkAllCompleted();
    } else {
        const allCompletedScreen = document.getElementById('all-completed-screen');
        if (allCompletedScreen) allCompletedScreen.style.display = 'none';

        const complaintPage = document.getElementById('complaint-page');
        if (complaintPage) {
            complaintPage.style.display = 'block';
        }

        if (status.lastCompletedStep >= 1) {
            goToStep(2);
        } else {
            goToStep(1);
        }
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
    const submitBtn = card.querySelector('.btn-submit');
    const cardTitle = card.querySelector('.card-title');

    if (card && submitBtn) {
        card.classList.add('completed');
        submitBtn.classList.add('completed');
        submitBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg><span>완료됨 (다시 신청하기)</span>`;
        if (cardTitle) {
            const badge = cardTitle.querySelector('.badge-completed');
            if (badge) badge.style.display = 'inline-block';
        }
    }
}

// 문서 로드 시 초기화 실행
document.addEventListener('DOMContentLoaded', initApp);