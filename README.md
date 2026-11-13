# P45ang

보안·개발 학습 기록 블로그. 코드를 몰라도 **GitHub 이슈 양식**으로 글과 보안뉴스를 올릴 수 있습니다.

## 가장 쉬운 방법: 이슈 양식

저장소의 **Issues → New issue** 에서 양식을 고릅니다. (모바일 GitHub 앱도 가능)

- **새 글**: 제목, 분야, 요약, 태그, 본문을 채우고 **Submit new issue**. 본문 칸에 이미지를 끌어다 놓으면 글 안에 들어가고, 첫 이미지가 썸네일이 됩니다.
- **보안뉴스 스크랩**: 기사(또는 X 게시글) 주소, 제목, 한 줄 메모를 채우고 Submit.

1~2분 뒤 이슈에 `✅ 올렸습니다` 댓글이 달리고 이슈가 닫히며 사이트에 반영됩니다. 실패하면 `❌` 댓글에 이유가 적히고 사이트는 바뀌지 않습니다.

- **저장소 소유자와 협업자(Collaborator)가 연 이슈만** 반영됩니다. 같이 쓰는 사람은 Settings → Collaborators 에 추가하세요.
- 이슈 제목 칸은 무시되고, 양식의 `제목` 칸이 사용됩니다.
- 올린 글을 고치거나 지우려면 아래 "파일로 직접 관리"를 보세요.

## 파일로 직접 관리

이슈 양식은 아래 파일을 자동으로 만들어 주는 것뿐입니다. 파일을 직접 고쳐도 됩니다.

- 글: `content/posts/<영문-폴더>/index.md` (+ 같은 폴더의 이미지). 시작은 `content/_template/index.md` 복사.
- 보안뉴스: `content/news/<이름>.json` 한 파일에 한 건. 지우려면 그 파일을 삭제.
- 글을 지우려면 `content/posts/<폴더>` 를 삭제하면 다음 빌드에서 페이지도 사라집니다.

### 글 머리말 항목

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
파일 이름에 띄어쓰기가 있는 이미지는 `![설명](<화면 캡처.png>)` 처럼 `<>` 로 감싸세요.

### 뉴스 파일 형식

```json
{
  "date": "2026-11-13",
  "title": "기사 제목",
  "source": "X",
  "url": "https://x.com/...",
  "note": "한 줄 메모",
  "tag": "공급망",
  "publishedDate": "2026-11-12"
}
```

`tag`, `publishedDate` 는 선택입니다.

### 예시 글·뉴스

`content/posts/preview-*` 3개와 `content/news/example-*.json` 은 예시(`example: true`)입니다. 실제 내용이 쌓이면 삭제하세요.

## 자동 빌드

- `.github/workflows/publish-issue.yml` : 이슈 양식 → `content/` 파일 → 사이트 생성 → 커밋.
- `.github/workflows/build.yml` : `content/` 나 사이트 파일을 직접 올렸을 때 `node tools/build.mjs` 로 생성.

`tools/build.mjs` 는 `posts/`, `categories/`, `archive/`, 홈 목록, `assets/search-index.js`, `assets/security-news.js`, `sitemap.xml`, `feed.xml` 을 만듭니다.
오류가 하나라도 있으면 아무것도 바꾸지 않고 실패하며, Actions 로그에 어떤 파일의 무엇이 문제인지 적힙니다.
위 생성물과 `index.html` 의 `<!--build:...-->` 사이는 자동 생성 영역이니 직접 고치지 마세요.

두 워크플로 모두 필요한 권한을 파일 안에 적어 두었습니다. 그래도 커밋 단계에서 권한 오류가 나면
Settings → Actions → General → Workflow permissions 를 **Read and write permissions** 로 바꿔 보세요.

내 컴퓨터에서 미리 확인하려면 Node 18+ 에서 `node tools/build.mjs` 후 `python -m http.server`.
