export const USER_INFO_KEY = 'maegyo_user_info';
export const COMPLAINT_STATUS_KEY = 'complaint_status';
export const COMPLAINTS_DATA_KEY = 'complaints_data_cache';
export const COMPLAINT_HISTORY_KEY = 'maegyo_complaint_history';
export const SERVER_COMPLETION_STATE_KEY = 'maegyo_server_completion_state';

export function getToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => {
        toast.className = toast.className.replace("show", "");
    }, 2500);
}
window.showToast = showToast;

export function showAlert(message) {
    const modal = document.getElementById('custom-alert-modal');
    const messageEl = document.getElementById('custom-alert-message');
    const closeBtn = document.getElementById('custom-alert-close-btn');

    if (!modal || !messageEl || !closeBtn) return;

    messageEl.innerText = message;
    modal.style.display = 'flex';

    const close = () => {
        modal.style.display = 'none';
        closeBtn.removeEventListener('click', close);
    };

    closeBtn.addEventListener('click', close);
}
window.showAlert = showAlert;

export function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const messageEl = document.getElementById('custom-confirm-message');
        const okBtn = document.getElementById('custom-confirm-ok-btn');
        const cancelBtn = document.getElementById('custom-confirm-cancel-btn');

        if (!modal || !messageEl || !okBtn || !cancelBtn) {
            resolve(false); // 모달 요소가 없으면 false 반환
            return;
        }

        messageEl.innerText = message;
        modal.style.display = 'flex';

        const cleanup = () => {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        const handleOk = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
    });
}
window.showConfirm = showConfirm;


export function handleContactClick(event) {
    event.preventDefault();
    const email = 'maegyo.jjuny@gmail.com';

    if (!navigator.clipboard) {
        window.location.href = `mailto:${email}`;
        return;
    }

    navigator.clipboard.writeText(email).then(() => {
        showToast('문의 이메일이 복사되었습니다.');
        window.location.href = `mailto:${email}`;
    }).catch(err => {
        console.error('이메일 복사에 실패했습니다:', err);
        window.location.href = `mailto:${email}`;
    });
}
window.handleContactClick = handleContactClick;

// 법적 고지 텍스트
const legalTexts = {
    terms: `
        <h3 style="margin-top: 0;">제1조 (목적)</h3>
        <p>본 약관은 "살기 좋은 매교 만들기" 서비스(이하 "서비스")의 이용과 관련하여 서비스 제공자와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>

        <h3>제2조 (이용자의 의무)</h3>
        <p>1. 이용자는 서비스를 이용함에 있어 불법적이거나 부당한 행위를 해서는 안 됩니다.</p>
        <p>2. 타인의 권리를 침해하거나 명예를 훼손하는 내용을 게시해서는 안 됩니다.</p>

        <h3>제3조 (서비스의 변경 및 중단)</h3>
        <p>서비스 제공자는 운영상, 기술상의 필요에 따라 제공하고 있는 전부 또는 일부 서비스를 변경하거나 중단할 수 있습니다.</p>

        <h3>제4조 (면책 조항)</h3>
        <p>서비스 제공자는 무료로 제공되는 서비스 이용과 관련하여 이용자에게 발생한 어떠한 손해에 대해서도 책임을 지지 않습니다.</p>
    `,
    privacy: `
        <h3 style="margin-top: 0;">1. 수집하는 개인정보의 항목</h3>
        <p>서비스는 회원가입, 원활한 고객상담, 각종 서비스의 제공을 위해 아래와 같은 개인정보를 수집하고 있습니다.</p>
        <ul>
            <li>수집항목: 이메일 주소, 닉네임, 거주 아파트 정보</li>
            <li>수집방법: Google 로그인 연동 및 사용자 직접 입력</li>
        </ul>

        <h3>2. 개인정보의 수집 및 이용 목적</h3>
        <p>회사는 수집한 개인정보를 다음의 목적을 위해 활용합니다.</p>
        <ul>
            <li>서비스 제공에 관한 계약 이행: 콘텐츠 제공, 특정 맞춤 서비스 제공</li>
            <li>회원 관리: 회원제 서비스 이용에 따른 본인확인, 개인 식별, 불량회원의 부정 이용 방지와 비인가 사용 방지, 가입 의사 확인</li>
            <li>통계 및 명예의 전당 기능: 익명화된 데이터 통계 및 랭킹 시스템 운영</li>
        </ul>

        <h3>3. 개인정보의 보유 및 이용기간</h3>
        <p>원칙적으로, 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 관계법령의 규정에 의하여 보존할 필요가 있는 경우 회사는 아래와 같이 관계법령에서 정한 일정한 기간 동안 회원정보를 보관합니다.</p>
        <p>- 보존 항목: 이메일, 닉네임, 거주 아파트 정보<br>
        - 보존 근거: 사용자의 서비스 탈퇴 시까지</p>

        <h3>4. 개인정보 파기절차 및 방법</h3>
        <p>사용자가 로그아웃 시 로컬에 저장된 모든 정보는 파기되며, 서버에 저장된 정보 파기를 원하실 경우 문의 이메일로 요청해 주시기 바랍니다.</p>
    `
};

export function showLegalModal(event, type) {
    event.preventDefault();
    const modal = document.getElementById('legal-modal');
    const titleEl = document.getElementById('legal-title');
    const contentEl = document.getElementById('legal-content');
    const closeBtn = document.getElementById('legal-close-btn');

    if (!modal || !titleEl || !contentEl || !closeBtn) return;

    if (type === 'terms') {
        titleEl.innerText = '이용약관';
        contentEl.innerHTML = legalTexts.terms;
    } else if (type === 'privacy') {
        titleEl.innerText = '개인정보 처리방침';
        contentEl.innerHTML = legalTexts.privacy;
    }

    modal.style.display = 'flex';

    const close = () => {
        modal.style.display = 'none';
        closeBtn.removeEventListener('click', close);
    };

    closeBtn.addEventListener('click', close);
}
window.showLegalModal = showLegalModal;
