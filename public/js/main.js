import { signInAnonymouslyIfNeeded, auth } from "./firebase.js";
import { USER_INFO_KEY, COMPLAINT_STATUS_KEY, COMPLAINT_HISTORY_KEY, COMPLAINTS_DATA_KEY, showToast } from "./utils.js";
import { initComplaintApp, loadAndRenderComplaints, setLastCompletedStep, getCompletionStatus, goToStep, updateComplaintCard, attachComplaintListeners } from "./complaint.js";
import { loadStats } from "./stats.js";
import { loadGuestbook, attachGuestbookListeners } from "./guestbook.js";
import { loadAnnouncements, checkNewAnnouncements } from "./announcement.js";

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
            await checkNewAnnouncements(); // 공지사항 확인
            await loadAndRenderComplaints(); // 민원 목록 로드 및 렌더링
            await initComplaintApp(); // 민원 앱 초기화
            attachComplaintListeners();
            attachGuestbookListeners();
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
        const onboardingLoader = document.getElementById('onboarding-loader');

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

        startBtn.style.display = 'none';
        if (onboardingLoader) onboardingLoader.style.display = 'block';

        const userInfo = { apartment: apt, nickname: nickname };
        localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));

        applyUserInfo(apt, nickname);

        try {
            console.log('\'시작하기\' 버튼 클릭. 데이터 로딩을 시작합니다...');
            await signInAnonymouslyIfNeeded();
            await checkNewAnnouncements();
            await loadAndRenderComplaints();
            console.log('데이터 로딩 완료. UI를 업데이트합니다.');
            onboardingScreen.style.display = 'none';
            mainApp.style.display = 'block';
            await initComplaintApp();
            attachComplaintListeners();
            attachGuestbookListeners();
            console.log('앱 초기화 완료.');
        } catch (e) {
            console.error('데이터 로딩 또는 앱 초기화 중 오류 발생:', e);
            alert('네트워크 문제로 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
            startBtn.style.display = 'block';
            if (onboardingLoader) onboardingLoader.style.display = 'none';
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

// 로그아웃 버튼 이벤트 리스너
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm('로그아웃하시겠습니까? 저장된 모든 진행 상황이 초기화됩니다.')) {
            localStorage.removeItem(USER_INFO_KEY);
            localStorage.removeItem(COMPLAINT_STATUS_KEY);
            localStorage.removeItem(COMPLAINT_HISTORY_KEY);
            sessionStorage.removeItem(COMPLAINTS_DATA_KEY);

            if (window.firebase && auth) {
                await auth.signOut();
                console.log("Firebase signed out.");
            }

            showToast('로그아웃되었습니다. 다시 시작해주세요.');

            setTimeout(() => {
                location.reload();
            }, 1000);
        }
    });
}

// 문서 로드 시 초기화 실행
document.addEventListener('DOMContentLoaded', initApp);
