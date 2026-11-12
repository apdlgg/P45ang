# P45ang

보안·개발 학습 기록 블로그. 글은 마크다운(`.md`) 파일로 쓰면 자동으로 페이지가 만들어집니다.

## 새 글 올리는 법

1. GitHub 저장소에서 `content/posts/` 로 들어갑니다.
2. **Add file → Create new file** 에서 파일 이름 칸에 `글-폴더-이름/index.md` 를 입력합니다.
   - 폴더 이름은 영어 소문자·숫자·하이픈만 (예: `http-headers-compare`). 주소가 됩니다.
   - 파일 이름은 반드시 `index.md`.
3. 내용은 `content/_template/index.md` 를 복사해서 시작합니다. 맨 위 `---` 사이가 머리말입니다.
4. 이미지는 **같은 폴더**에 올리고(`Add file → Upload files`, 폴더 `content/posts/글-폴더-이름/`) 본문에 `![설명](사진.png)` 로 넣습니다.
   - 본문의 **첫 이미지**가 목록·아카이브 썸네일이 됩니다. 이미지가 없으면 태그 이름이 적힌 기본 썸네일이 나옵니다.
   - 파일 이름에 띄어쓰기가 있으면 `![설명](<화면 캡처.png>)` 처럼 `<>` 로 감싸거나 이름을 바꾸세요.
5. `Commit changes` 를 누르면 1~2분 뒤 사이트에 반영됩니다. (Actions 탭의 `build-site` 가 초록색이면 성공)

### 머리말 항목

| 항목 | 필수 | 설명 |
|---|---|---|
| `title` | O | 제목 |
| `date` | O | `2026-11-12` 형식 |
| `category` | O | `development` `ctf-wargame` `bug-bounty` `writing` `research` `challenges` |
| `summary` | | 목록·검색에 보이는 요약 (없으면 본문 앞부분) |
| `tags` | | `[HTTP, 실습]` |
| `thumbnail` | | 썸네일로 쓸 같은 폴더의 이미지, 또는 `none` |
| `draft` | | `true` 이면 공개하지 않음 |
| `readingTime` | | 읽는 시간(분). 없으면 글자 수로 계산 |

본문에서는 `##`(큰 제목)과 `###`(작은 제목)이 목차에 들어갑니다. 코드 블록, 표, 링크, 이미지를 쓸 수 있습니다.
보안 글에 코드를 적어도 안전하도록 **본문에 쓴 HTML 태그는 실행되지 않고 글자 그대로** 보입니다.

### 예시 글

`content/posts/preview-*` 3개는 예시입니다(`example: true`). 실제 글이 쌓이면 이 폴더들을 삭제하세요. 다음 빌드 때 페이지도 함께 사라집니다.

## 자동 빌드

`content/` 가 바뀌어 올라오면 GitHub Actions(`.github/workflows/build.yml`)가 `node tools/build.mjs` 를 실행해
`posts/`, `categories/`, `archive/`, 홈 목록, 검색 색인, `sitemap.xml`, `feed.xml` 을 만들어 커밋합니다.
글에 오류가 있으면 아무것도 바꾸지 않고 실패하며, Actions 로그에 어떤 파일의 무엇이 문제인지 적힙니다.

처음 한 번: 저장소 **Settings → Actions → General → Workflow permissions** 를 **Read and write permissions** 로 바꿔야 합니다.

내 컴퓨터에서 미리 확인하려면 Node 18+ 에서 `node tools/build.mjs` 후 `python -m http.server`.

`posts/`, `categories/`, `archive/` 와 `index.html` 의 `<!--build:...-->` 사이는 자동 생성 영역이니 직접 고치지 마세요.
