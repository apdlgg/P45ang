---
title: HTTP 요청 헤더 비교
date: 2026-11-05
category: development
summary: 같은 요청에서 Accept 헤더를 바꾸기 전후의 응답 비교
tags: [HTTP, 실습]
readingTime: 4
example: true
---

## 요청 조건

같은 실습 경로에 요청을 보내고 비교할 헤더를 하나로 제한한 예시.

### 헤더 변경 전후

변경 전:

```http
GET /lab HTTP/1.1
Accept: */*
```

변경 후:

```http
GET /lab HTTP/1.1
Accept: application/json
```

## 요청과 응답

브라우저가 보낸 요청과 서버의 응답을 한 쌍으로 묶어 기록.

## 비교 기준

응답의 상태 코드, Content-Type, 본문 형식을 차례대로 확인.
