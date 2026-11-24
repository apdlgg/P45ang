# P45ang

개발·보안 학습 기록 블로그 — https://apdlgg.github.io/P45ang/

## 구조 한눈에

저장소에는 **원본만** 있습니다. 사이트 페이지는 GitHub Actions(`build-site`)가 올릴 때마다 새로 만들어 바로 배포하고, 저장소에는 저장하지 않습니다.

| 하고 싶은 일 | 고치는 곳 |
|---|---|
| 글 쓰기·고치기·지우기 | `content/posts/<주소>/index.md` (이미지는 같은 폴더) 또는 이슈 "새 글" |
| 보안뉴스 | `content/news/<날짜>-<번호>.json` 또는 이슈 "보안뉴스 스크랩" |
| 자기소개(홈의 정보 화면 + 정보 페이지) | `content/profile.json` |
| 홈 화면 구성 | `tools/templates/home.html` |
| 상단바·하단(모든 페이지 공통) | `tools/templates/top.html`, `bottom.html` |
| 404 페이지 | `tools/templates/not-found.html` |
| 디자인 | `assets/site.css` (스타일 파일은 이것 하나) |
| 분야(카테고리) 목록 | `tools/lib/site.mjs` |

## 글 올리기

- **이슈로**: Issues → New issue → "새 글" 또는 "보안뉴스 스크랩". 올린 뒤 **이슈를 수정하면 블로그 글도 같이 바뀝니다.** (주소와 날짜는 처음 그대로)
- **파일로**: `content/_template/index.md`를 복사해 `content/posts/<주소>/index.md`로 올립니다. 주소는 영어 소문자·숫자·하이픈.
- **삭제**: `content/posts/<주소>` 폴더를 지우면 사이트에서도 사라집니다. (이슈를 닫아도 글은 지워지지 않습니다)
- 분야는 최대 3개: `category: [ctf-wargame, writing]` (첫 번째가 대표)
- 옵시디언 등에서 서식째 붙여넣은 HTML 본문은 자동으로 마크다운으로 바꿔 보여 줍니다.
- 저장소에서 직접 고친 글은 이슈 수정으로 덮어쓰지 않습니다. 덮어쓰려면 Actions → publish-from-issue → Run workflow (apply, force).

## 사이트 반영

1. `content/`, `tools/`, `assets/`가 바뀌면 `build-site`가 테스트 → 빌드 → 배포합니다(1~2분).
2. 빌드는 글 하나라도 형식이 틀리면 **배포하지 않고** 멈춥니다. 무엇이 틀렸는지는 Actions 탭의 실패 기록에 나옵니다. 사이트는 이전 상태 그대로입니다.
3. GitHub 설정: Settings → Pages → Source = **GitHub Actions**.

## 내 컴퓨터에서 미리 보기

```bash
node tools/build.mjs            # 결과는 _site/ 폴더 (저장소에 올라가지 않음)
cd _site && python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
node --test tools/test.mjs      # 테스트
```

## 워크플로

| 파일 | 하는 일 |
|---|---|
| `build-site` (`build.yml`) | 빌드하고 GitHub Pages에 배포 |
| `publish-from-issue` | 이슈 → `content/` 저장 후 배포 시작. 수동 실행 시 지난 이슈 다시 반영 |
| `cleanup-old-pages` | 예전 방식에서 저장소에 남은 생성 페이지를 한 번 정리 (수동) |
