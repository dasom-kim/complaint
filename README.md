# 매교역 교통 민원 도우미

이 프로젝트는 매교역 인근 주민들의 인프라 개선을 위한 민원 접수를 돕는 웹 애플리케이션입니다.
Node.js와 Express를 기반으로 작성되었습니다.

## 설치 및 실행 방법

1. Node.js 가 설치되어 있는지 확인합니다.
2. 터미널을 열고 프로젝트 폴더로 이동합니다.
3. 다음 명령어를 입력하여 의존성 패키지를 설치합니다.
   ```bash
   npm install
   ```
4. 다음 명령어로 서버를 실행합니다.
   ```bash
   npm start
   ```
5. 브라우저를 열고 `http://localhost:3000` 에 접속합니다.

## 구조
* `app.js`: Express 서버 설정 파일
* `package.json`: 프로젝트 메타데이터 및 의존성 관리
* `public/`: 정적 파일 (CSS, JS)
  * `css/style.css`: 전체 스타일 시트
  * `js/main.js`: 클라이언트 사이드 자바스크립트 로직
* `views/`: 템플릿 파일
  * `index.ejs`: 메인 HTML 뷰 파일