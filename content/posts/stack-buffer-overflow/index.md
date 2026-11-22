---
title: "Stack Buffer Overflow"
date: 2026-11-22
category: writing
tags: ["포너블", "메모리 취약점"]
---

## 개념

스택에 잡힌 버퍼(배열)에 그 크기를 넘는 데이터를 쓰는 것.
버퍼 범위를 넘어선 값이 옆에 있는 다른 데이터를 덮어쓴다.

## 왜 생기나

x86-64 리눅스에서 함수 스택은 대략 이렇게 구성된다.

```
높은 주소
  return address
  SFP (저장된 RBP)
  버퍼
낮은 주소
```

스택은 높은 주소에서 낮은 주소로 자라지만, **배열에 값을 쓸 때는 낮은 주소 → 높은 주소** 방향으로 채워진다.
그래서 버퍼를 넘겨 쓰면 SFP, return address 순으로 위쪽 데이터를 침범한다.

## 예제

```c
#include <stdio.h>

int main(void) {
    char buf[16];
    gets(buf);          // 길이 검사 없이 입력을 받는다
    return 0;
}
```

`buf`는 16바이트인데 `gets`는 길이를 확인하지 않는다.
16바이트를 넘겨 입력하면 SFP와 return address까지 덮인다.
(스택 카나리 같은 보호기법이 꺼져 있다고 가정한 구조다. 카나리가 켜져 있으면 버퍼와 SFP 사이에 카나리가 끼어 있다.)

## 영향

- return address가 쓰레기 값으로 덮이면 복귀할 때 잘못된 주소로 점프 → 보통 크래시(Segmentation fault).
- return address를 의도한 주소로 정확히 덮으면 `ret` 실행 시 그 주소로 흐름이 넘어간다. 실행 흐름 탈취.
- SFP를 함부로 변조하면 이전 함수 프레임으로 복귀하는 과정이 꼬인다.

## 정리

| 항목 | 내용 |
|---|---|
| 원인 | 길이 검사 없는 입력 함수(`gets`, `scanf("%s")` 등) |
| 결과 | 인접 데이터·return address 덮어쓰기 |
| 핵심 | `ret`이 꺼내는 return address를 바꾸면 실행 흐름을 바꿀 수 있음 |
