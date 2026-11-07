globalThis.p45angSearchIndex = [
  {
    "title": "HTTP 요청 헤더 비교",
    "summary": "같은 요청에서 Accept 헤더를 바꾸기 전후의 응답 비교",
    "category": "개발",
    "tags": [
      "HTTP",
      "실습"
    ],
    "text": "\n## 요청 조건\n\n같은 실습 경로에 요청을 보내고 비교할 헤더를 하나로 제한한 예시.\n\n### 헤더 변경 전후\n\n요청 헤더 변경 전후 · 예시변경 전변경 후GET /lab HTTP/1.1Accept: */*GET /lab HTTP/1.1Accept: application/json\n\n## 요청과 응답\n\n브라우저가 보낸 요청과 서버의 응답을 한 쌍으로 묶어 기록.\n\n요청에서 응답까지 · 흐름 도식요청서버응답HTTP / LAB\n\n## 비교 기준\n\n응답의 상태 코드, Content-Type, 본문 형식을 차례대로 확인.\n",
    "url": "posts/preview-http-headers/index.html",
    "date": "2026-11-05"
  },
  {
    "title": "리눅스 파일 권한 실습",
    "summary": "읽기·쓰기·실행 권한과 소유권 확인",
    "category": "개발",
    "tags": [
      "Linux",
      "실습"
    ],
    "text": "\n## 실습 파일\n\n임시 파일의 사용자·그룹·기타 사용자 권한 확인.\n\n### 권한 표시\n\n-rw-r-----  lab-user  lab-group  notes.txt\n\n## 변경 전후\n\n권한을 한 항목씩 조정하고 변경된 문자 기록.\n\n## 확인 항목\n\n소유권과 권한 비트를 구분해 정리.\n",
    "url": "posts/preview-file-permissions/index.html",
    "date": "2026-10-24"
  },
  {
    "title": "CTF 첫 풀이와 오답",
    "summary": "첫 시도에서 막힌 지점과 다시 확인한 단서",
    "category": "CTF/Wargame",
    "tags": [
      "CTF",
      "오답"
    ],
    "text": "\n## 첫 가설\n\n처음 선택한 단서와 판단 근거 기록.\n\n## 검증 순서\n\n막힌 지점부터 확인하고 작은 가설로 나눠 재검토.\n\n## 오답 정리\n\n다음 문제에서 확인할 순서와 남은 질문 정리.\n",
    "url": "posts/preview-first-ctf/index.html",
    "date": "2026-09-18"
  }
];
