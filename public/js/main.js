import { auth, onAuthStateChanged, signInWithGoogle, getUserProfile, saveUserProfile, signInAnonymouslyIfNeeded } from "./firebase.js";
import { USER_INFO_KEY, COMPLAINT_STATUS_KEY, COMPLAINT_HISTORY_KEY, COMPLAINTS_DATA_KEY, showToast, showAlert, showConfirm, showLegalModal } from "./utils.js";
import { initComplaintApp, loadAndRenderComplaints, syncComplaintStateFromServer, attachComplaintListeners } from "./complaint.js";
import { loadStats } from "./stats.js";
import { loadGuestbook, attachGuestbookListeners } from "./guestbook.js";
import { loadAnnouncements, checkNewAnnouncements } from "./announcement.js";
import { initAdminPage } from "./admin.js";

// DOM 요소
const appLoader = document.getElementById('app-loader');
const onboardingModal = document.getElementById('onboarding-modal');
const profileSetupModal = document.getElementById('profile-setup-modal');
const mainApp = document.getElementById('main-app');
const drawerOverlay = document.getElementById('drawer-overlay');
const drawerMenu = document.getElementById('drawer-menu');
const menuBtn = document.getElementById('menu-btn');
const displayApt = document.getElementById('display-apt');
const displayNickname = document.getElementById('display-nickname');
const pageTitle = document.getElementById('page-title');
const adminMenuItem = document.getElementById('admin-menu-item');
const notificationBtn = document.getElementById('notification-btn');
const notificationPopover = document.getElementById('notification-popover');
const notificationDot = document.getElementById('notification-dot');

// 페이지 관리
const pages = {
    complaint: document.getElementById('complaint-page'),
    stats: document.getElementById('stats-page'),
    guestbook: document.getElementById('guestbook-page'),
    admin: document.getElementById('admin-page'),
};

// 익명 로그인 처리를 위한 플래그
let isAnonymousLoginAttempt = false;
let authStateResolved = false;

// 인앱 브라우저 감지 및 경고 표시
function handleInAppBrowser() {
    const userAgent = navigator.userAgent.toLowerCase();
    // 카카오톡 인앱 브라우저 감지
    if (userAgent.includes('kakaotalk')) {
        const banner = document.getElementById('inapp-browser-warning');
        if (banner) {
            banner.style.display = 'block';
        }
    }
}

// 앱 초기화 및 인증 상태 관찰
function initApp() {
    handleInAppBrowser(); // 앱 시작 시 인앱 브라우저 체크

    onAuthStateChanged(auth, async (user) => {
        authStateResolved = true;
        let userProfile = null;

        if (user) {
            // 로그인 된 상태
            await syncComplaintStateFromServer(); // 서버와 로컬 상태 동기화

            if (user.isAnonymous) {
                 const localUserInfo = localStorage.getItem(USER_INFO_KEY);
                 if (localUserInfo) {
                     try {
                         userProfile = JSON.parse(localUserInfo);
                         applyUserInfo(userProfile.apartment, userProfile.nickname);
                         await showMainApp(false, false);
                     } catch (e) {
                         await auth.signOut();
                         await showMainApp(true, false);
                     }
                 } else {
                     await auth.signOut();
                     await showMainApp(true, false);
                 }
            } else {
                // 구글 로그인
                userProfile = await getUserProfile(user.uid);
                if (userProfile && userProfile.apartment && userProfile.nickname) {
                    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userProfile));
                    applyUserInfo(userProfile.apartment, userProfile.nickname);
                    await showMainApp(false, false);
                } else {
                    await showMainApp(false, true);
                }
            }
        } else {
            // 로그아웃 상태
            const localUserInfo = localStorage.getItem(USER_INFO_KEY);
            if (localUserInfo && !isAnonymousLoginAttempt) {
                 signInAnonymouslyIfNeeded();
            } else {
                await showMainApp(true, false);
            }
        }

        // 관리자 메뉴 노출 여부 결정
        if (userProfile && userProfile.level === 'admin') {
            if (adminMenuItem) adminMenuItem.style.display = 'flex';
        } else {
            if (adminMenuItem) adminMenuItem.style.display = 'none';
        }
    });

    // Firebase 인증이 너무 오래 걸릴 경우 대비
    setTimeout(async () => {
        if (!authStateResolved) {
            console.warn("Firebase 인증 시간이 초과되었습니다. 오프라인 모드로 표시합니다.");
            await showMainApp(true, false);
        }
    }, 3000);
}

async function showMainApp(showOnboarding, showProfile) {
    if(appLoader) appLoader.style.display = 'none';
    if(mainApp) mainApp.style.display = 'block';

    if (showOnboarding) {
        if(onboardingModal) onboardingModal.style.display = 'flex';
        if(profileSetupModal) profileSetupModal.style.display = 'none';
    } else if (showProfile) {
        if(onboardingModal) onboardingModal.style.display = 'none';
        if(profileSetupModal) profileSetupModal.style.display = 'flex';
    } else {
        if(onboardingModal) onboardingModal.style.display = 'none';
        if(profileSetupModal) profileSetupModal.style.display = 'none';
    }

    try {
        const hasNew = await checkNewAnnouncements();
        if (hasNew) {
            notificationPopover.classList.add('show');
            await loadAnnouncements();
        }

        await loadAndRenderComplaints();
        await initComplaintApp();
        attachComplaintListeners();
        attachGuestbookListeners();
        attachFooterLinks();
    } catch (e) {
        console.error("앱 데이터 로드 실패:", e);
        showAlert("데이터를 불러오는 데 실패했습니다.");
    }
}

// 사용자 정보 적용
function applyUserInfo(apt, nickname) {
    if (displayApt) displayApt.innerText = apt;
    if (displayNickname) displayNickname.innerText = nickname;
}

// 구글 로그인 버튼 이벤트
const googleLoginBtn = document.getElementById('google-login-btn');
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        const googleLoader = document.getElementById('google-loader');
        googleLoginBtn.style.display = 'none';
        if (googleLoader) googleLoader.style.display = 'block';

        const user = await signInWithGoogle();

        if (!user) {
             googleLoginBtn.style.display = 'block';
             if (googleLoader) googleLoader.style.display = 'none';
        }
    });
}

// 익명 로그인(그냥 시작하기) 버튼 이벤트
const startAnonymousBtn = document.getElementById('start-anonymous-btn');
if (startAnonymousBtn) {
    startAnonymousBtn.addEventListener('click', async () => {
        const aptSelect = document.getElementById('apt-select');
        const nicknameInput = document.getElementById('nickname-input');
        const anonymousLoader = document.getElementById('anonymous-loader');

        const apt = aptSelect.value;
        const nickname = nicknameInput.value.trim();

        if (!apt) {
            showAlert('거주하시는 아파트를 선택해 주세요.');
            return;
        }
        if (!nickname) {
            showAlert('사용하실 닉네임을 입력해 주세요.');
            return;
        }

        startAnonymousBtn.style.display = 'none';
        if (anonymousLoader) anonymousLoader.style.display = 'block';

        isAnonymousLoginAttempt = true;

        const userInfo = { apartment: apt, nickname: nickname, level: 'guest' }; // level 추가
        localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));

        try {
            await signInAnonymouslyIfNeeded();
        } catch (e) {
            console.error('익명 로그인 실패:', e);
            showAlert('서버에 연결하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
            startAnonymousBtn.style.display = 'block';
            if (anonymousLoader) anonymousLoader.style.display = 'none';
        } finally {
             isAnonymousLoginAttempt = false;
        }
    });
}

// 프로필 저장 버튼 이벤트 (모달 내부)
const saveProfileBtn = document.getElementById('save-profile-btn');
if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user || user.isAnonymous) {
            showToast("Google 로그인이 필요합니다.");
            return;
        }

        const aptSelect = document.getElementById('apt-select-setup');
        const nicknameInput = document.getElementById('nickname-input-setup');
        const loader = document.getElementById('profile-setup-loader');

        const apt = aptSelect.value;
        const nickname = nicknameInput.value.trim();

        if (!apt) {
            showAlert('거주하시는 아파트를 선택해 주세요.');
            return;
        }
        if (!nickname) {
            showAlert('사용하실 닉네임을 입력해 주세요.');
            return;
        }

        saveProfileBtn.style.display = 'none';
        if (loader) loader.style.display = 'block';

        const profileData = {
            apartment: apt,
            nickname: nickname,
            email: user.email,
            level: 'guest' // level 필드 추가
        };

        try {
            await saveUserProfile(user.uid, profileData);
            localStorage.setItem(USER_INFO_KEY, JSON.stringify(profileData));
            applyUserInfo(apt, nickname);
            if(profileSetupModal) profileSetupModal.style.display = 'none'; // 모달 닫기
        } catch (e) {
            console.error("프로필 저장 오류:", e);
            showAlert("정보 저장에 실패했습니다. 다시 시도해주세요.");
        } finally {
            saveProfileBtn.style.display = 'block';
            if (loader) loader.style.display = 'none';
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
            } else if (targetPage === 'admin') {
                await initAdminPage();
            }
        }
        drawerMenu.classList.remove('open');
        drawerOverlay.classList.remove('show');
    });
});

// 알림 팝오버 관련
if (notificationBtn) {
    notificationBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isShown = notificationPopover.classList.toggle('show');
        if (isShown) {
            // 팝업이 열릴 때 컨텐츠가 비어있으면 로드
            if (document.getElementById('notification-content').innerHTML.trim() === '') {
                loadAnnouncements();
            }
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
        const confirmed = await showConfirm('로그아웃하시겠습니까? 저장된 모든 진행 상황이 초기화됩니다.');
        if (confirmed) {
            localStorage.removeItem(USER_INFO_KEY);
            localStorage.removeItem(COMPLAINT_STATUS_KEY);
            localStorage.removeItem(COMPLAINT_HISTORY_KEY);
            sessionStorage.removeItem(COMPLAINTS_DATA_KEY);

            if (auth) {
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

function attachFooterLinks() {
    const termsLink = document.getElementById('terms-link');
    const privacyLink = document.getElementById('privacy-link');

    if (termsLink) {
        termsLink.addEventListener('click', (e) => showLegalModal(e, 'terms'));
    }
    if (privacyLink) {
        privacyLink.addEventListener('click', (e) => showLegalModal(e, 'privacy'));
    }
}


// 문서 로드 시 초기화 실행
document.addEventListener('DOMContentLoaded', initApp);
