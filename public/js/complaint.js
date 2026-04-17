import { FIRESTORE_COLLECTIONS, FIRESTORE_DOCUMENTS } from './firebase.js';
import { COMPLAINTS_DATA_KEY, COMPLAINT_STATUS_KEY, COMPLAINT_HISTORY_KEY, SERVER_COMPLETION_STATE_KEY, getToday, showToast, USER_INFO_KEY, showAlert } from './utils.js';

let TOTAL_COMPLAINTS = 0;
let complaintListenersAttached = false;

export async function getComplaintsData() {
    const cachedData = sessionStorage.getItem(COMPLAINTS_DATA_KEY);
    if (cachedData) {
        // console.log("캐시에서 민원 목록 로드");
        return JSON.parse(cachedData);
    }

    if (!window.firebase) throw new Error("Firebase not initialized");

    // console.log("Firestore에서 민원 목록 로드");
    const { db, doc, getDoc } = window.firebase;
    const docRef = doc(db, FIRESTORE_COLLECTIONS.COMPLAINTS, FIRESTORE_DOCUMENTS.MAIN_DATA);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const complaints = docSnap.data().items || [];
        sessionStorage.setItem(COMPLAINTS_DATA_KEY, JSON.stringify(complaints));
        return complaints;
    } else {
        // console.log("Firestore에 'main-data' 문서가 없습니다.");
        return [];
    }
}

export function getCompletionStatus() {
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

export function setLastCompletedStep(step) {
    const status = getCompletionStatus();
    if (status.lastCompletedStep < step) {
        status.lastCompletedStep = step;
        localStorage.setItem(COMPLAINT_STATUS_KEY, JSON.stringify(status));
    }
}

export function getServerCompletionState() {
    const state = localStorage.getItem(SERVER_COMPLETION_STATE_KEY);
    if (!state) return { date: getToday(), totalCount: 0, complaints: {} };
    try {
        const parsed = JSON.parse(state);
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

export async function syncComplaintStateFromServer() {
    const user = window.firebase?.auth?.currentUser;
    if (!user) {
        // console.log("Cannot sync server state, user not logged in.");
        return;
    }

    const { db, collection, query, where, getDocs } = window.firebase;
    const today = getToday();

    try {
        let q;
        if (user.isAnonymous) {
            q = query(collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS), where("uid", "==", user.uid), where("date", "==", today));
        } else {
            q = query(collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS), where("email", "==", user.email), where("date", "==", today));
        }

        const querySnapshot = await getDocs(q);

        let serverComplaints = {};
        let serverTotalCount = 0;

        if (!querySnapshot.empty) {
            const data = querySnapshot.docs[0].data();
            serverComplaints = data.complaints || {};
            serverTotalCount = data.totalCount || 0;
        }

        const serverState = { date: today, totalCount: serverTotalCount, complaints: serverComplaints };
        localStorage.setItem(SERVER_COMPLETION_STATE_KEY, JSON.stringify(serverState));

        const history = getCompletionHistory();
        history[today] = serverComplaints;
        localStorage.setItem(COMPLAINT_HISTORY_KEY, JSON.stringify(history));

        // console.log("서버 데이터와 로컬 상태 동기화 완료:", serverComplaints);

    } catch (e) {
        // console.error("Error syncing server completion state:", e);
        showAlert("서버에서 민원 내역을 가져오는 중 오류가 발생했습니다.");
    }
}


export function getCompletionHistory() {
    return JSON.parse(localStorage.getItem(COMPLAINT_HISTORY_KEY) || '{}');
}

export function recordLocalComplaintCompletion(complaintId) {
    const history = getCompletionHistory();
    const today = getToday();
    if (!history[today]) {
        history[today] = {};
    }
    history[today][complaintId] = (history[today][complaintId] || 0) + 1;
    localStorage.setItem(COMPLAINT_HISTORY_KEY, JSON.stringify(history));
}

export function setComplaintCompleted(complaintId) {
    recordLocalComplaintCompletion(complaintId);

    sessionStorage.removeItem(`complaint_${complaintId}_제목_clicked`);
    sessionStorage.removeItem(`complaint_${complaintId}_내용_clicked`);
    sessionStorage.removeItem(`complaint_${complaintId}_submit_clicked`);

    updateComplaintCard(complaintId.toString());
    showToast(`${complaintId}번 민원이 추가 완료되었습니다.`);

    const card = document.getElementById(`complaint-${complaintId}`);
    if (card) {
        const title = card.querySelector('.card-title');
        const wrapper = title.nextElementSibling;
        if (title && wrapper && !title.classList.contains('collapsed')) {
            title.classList.add('collapsed');
            wrapper.classList.add('collapsed');
        }
    }
}

export async function renderHistory(category = 'all') {
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
        // console.error("민원 내역 렌더링 중 오류 발생:", e);
        container.innerHTML = `<p>내역을 불러오는 중 오류가 발생했습니다.</p>`;
    }
}


export async function goToStep(step) {
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

        await renderHistory();
        await updateRankingButtonState();
    }
}
window.goToStep = goToStep;


export async function openFirstUncompletedCard() {
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

export function checkCompletion(complaintId) {
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
        showAlert('복사에 실패했습니다. 수동으로 복사해 주세요.');
    });
}

window.handleFormSubmit = function (element, event) {
    event.stopPropagation();
    const complaintId = element.dataset.complaintId;
    sessionStorage.setItem(`complaint_${complaintId}_submit_clicked`, 'true');
    checkCompletion(complaintId);
}

export function renderComplaints(complaintsData, category = 'all') {
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

export function renderCategoryFilter(complaintsData) {
    const categories = ['all', ...new Set(complaintsData.map(c => c.category))];
    const selectEl = document.getElementById('category-filter');
    if (!selectEl) return;

    selectEl.innerHTML = categories.map(cat => `<option value="${cat}">${cat === 'all' ? '전체' : cat}</option>`).join('');

    selectEl.addEventListener('change', (e) => {
        renderComplaints(complaintsData, e.target.value);
    });
}

export function initComplaintCards() {
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

        const complaintId = card.id.split('-')[1];
        if (complaintId) {
            updateComplaintCard(complaintId);
        }
    });
}

export async function initComplaintApp() {
    // 민원별 복사/제출 상태를 초기화합니다.
    sessionStorage.removeItem('pending_complaint');
    [1, 2, 3, 4, 5].forEach(id => {
        sessionStorage.removeItem(`complaint_${id}_제목_clicked`);
        sessionStorage.removeItem(`complaint_${id}_내용_clicked`);
        sessionStorage.removeItem(`complaint_${id}_submit_clicked`);
    });

    // '모두 완료' 화면을 숨기고 민원 접수 페이지를 표시합니다.
    const allCompletedScreen = document.getElementById('all-completed-screen');
    if (allCompletedScreen) allCompletedScreen.style.display = 'none';

    const complaintPage = document.getElementById('complaint-page');
    if (complaintPage) complaintPage.style.display = 'block';

    // 오늘 이미 민원을 접수한 내역이 있는지 확인합니다.
    const history = getCompletionHistory();
    const today = getToday();
    const todaysCompletions = history[today] || {};
    const hasHistoryToday = Object.values(todaysCompletions).reduce((sum, count) => sum + count, 0) > 0;

    // 오늘 접수한 내역이 있으면 3단계(내역) 페이지로, 없으면 1단계(로그인) 페이지로 이동합니다.
    if (hasHistoryToday) {
        // console.log("오늘 접수한 민원 내역이 있어 3단계로 바로 이동합니다.");
        await goToStep(3);
    } else {
        // console.log("오늘 접수한 민원 내역이 없어 1단계부터 시작합니다.");
        await goToStep(1);
    }
}

export async function loadAndRenderComplaints() {
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
        // console.error("민원 목록 렌더링 실패:", e);
        if (container) container.innerHTML = `<p style="text-align:center; color: var(--text-muted); padding: 20px 0;">민원 목록을 불러오는 데 실패했습니다.</p>`;
        throw e;
    }
}

export function updateComplaintCard(complaintId) {
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
}

export async function updateRankingButtonState() {
    const uploadSummaryBtn = document.getElementById('upload-summary-btn');
    if (!uploadSummaryBtn) return;

    uploadSummaryBtn.disabled = false;

    const serverState = getServerCompletionState();
    const totalCountA = serverState.totalCount;

    if (totalCountA > 0) {
        uploadSummaryBtn.innerText = '접수 건수 업데이트하기 🏆';
    } else {
        uploadSummaryBtn.innerText = '민원 접수 건수 저장하기 🏆';
    }
}

export function attachComplaintListeners() {
    if (complaintListenersAttached) return;

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
    if (pStep2) pStep2.addEventListener('click', () => goToStep(2));

    const pStep3 = document.getElementById('progress-step-3');
    if (pStep3) pStep3.addEventListener('click', () => goToStep(3));

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

    const uploadSummaryBtn = document.getElementById('upload-summary-btn');
    if (uploadSummaryBtn) {
        // 기존 리스너 모두 제거
        const newUploadSummaryBtn = uploadSummaryBtn.cloneNode(true);
        uploadSummaryBtn.parentNode.replaceChild(newUploadSummaryBtn, uploadSummaryBtn);

        newUploadSummaryBtn.addEventListener('click', async () => {
            const user = window.firebase?.auth?.currentUser;
            if (!user) {
                showAlert('로그인이 필요합니다.');
                return;
            }

            const { db, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs } = window.firebase;

            const history = getCompletionHistory();
            const today = getToday();
            const todaysCompletions = history[today] || {};
            const localTotalCount = Object.values(todaysCompletions).reduce((sum, count) => sum + count, 0);

            if (localTotalCount === 0) {
                showAlert('접수한 민원 내역이 없습니다. 민원 접수 후 참여해주세요.');
                return;
            }

            const serverState = getServerCompletionState();
            if (localTotalCount <= serverState.totalCount) {
                showToast('이미 최신 민원 건수가 서버에 저장되어 있습니다.');
                return;
            }

            newUploadSummaryBtn.disabled = true;
            newUploadSummaryBtn.innerText = '업로드 중...';

            try {
                const completionsCollection = collection(db, FIRESTORE_COLLECTIONS.COMPLETIONS);

                let q;
                if (user.isAnonymous) {
                    q = query(completionsCollection, where("uid", "==", user.uid), where("date", "==", today));
                } else {
                    q = query(completionsCollection, where("email", "==", user.email), where("date", "==", today));
                }

                const querySnapshot = await getDocs(q);
                const userInfo = JSON.parse(localStorage.getItem(USER_INFO_KEY));

                if (querySnapshot.empty) {
                    // Create new document
                    const submissionData = {
                        uid: user.uid,
                        date: today,
                        createdDate: serverTimestamp(),
                        modifiedDate: serverTimestamp(),
                        nickname: userInfo.nickname,
                        apartment: userInfo.apartment,
                        complaints: todaysCompletions,
                        totalCount: localTotalCount,
                    };
                    if (!user.isAnonymous) {
                        submissionData.email = user.email;
                    }
                    await addDoc(completionsCollection, submissionData);
                    showToast('🏆 랭킹 참여가 완료되었습니다!');
                } else {
                    // Update existing document
                    const docToUpdate = querySnapshot.docs[0];
                    const updateData = {
                        complaints: todaysCompletions,
                        totalCount: localTotalCount,
                        modifiedDate: serverTimestamp(),
                        nickname: userInfo.nickname,
                        apartment: userInfo.apartment,
                    };
                    await updateDoc(docToUpdate.ref, updateData);
                    showToast('🏆 랭킹이 성공적으로 갱신되었습니다!');
                }

                await syncComplaintStateFromServer();

            } catch (e) {
                // console.error('랭킹 참여 중 오류 발생:', e);
                showAlert('오류가 발생했습니다. 다시 시도해주세요.');
            } finally {
                newUploadSummaryBtn.disabled = false;
                await goToStep(3);
            }
        });
    }
    complaintListenersAttached = true;
}
