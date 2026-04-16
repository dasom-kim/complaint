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