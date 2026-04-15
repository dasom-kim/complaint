const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// 뷰 엔진 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 정적 파일 제공 설정 (CSS, JS 등)
app.use(express.static(path.join(__dirname, 'public')));

// 기본 라우트
app.get('/', (req, res) => {
    res.render('index'); // views/index.ejs 렌더링. 여기서 browserify로 번들링된 /js/bundle.js를 로드합니다.
});

// 서버 시작
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});