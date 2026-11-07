const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const FIRST_DAY = Date.UTC(2026, 10, 6) / DAY_MS;

function seoulDay(date = new Date()) {
  return Math.floor((date.getTime() + SEOUL_OFFSET_MS) / DAY_MS);
}

function landscapeIndex(date, count) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('사진 목록이 비어 있습니다.');
  const elapsed = seoulDay(date) - FIRST_DAY;
  return ((elapsed % count) + count) % count;
}

function nextLandscapeChange(date = new Date()) {
  return (seoulDay(date) + 1) * DAY_MS - SEOUL_OFFSET_MS;
}
