import { FIRESTORE_COLLECTIONS } from './firebase.js';
import { getToday } from './utils.js';

export async function loadStats() {
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