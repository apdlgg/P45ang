const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const FIRST_DAY = Date.UTC(2026, 10, 6) / DAY_MS;

export function seoulDay(date = new Date()) {
  return Math.floor((date.getTime() + SEOUL_OFFSET_MS) / DAY_MS);
}

export function landscapeIndex(date, count) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('사진 목록이 비어 있습니다.');
  const elapsed = seoulDay(date) - FIRST_DAY;
  return ((elapsed % count) + count) % count;
}

export function nextLandscapeChange(date = new Date()) {
  return (seoulDay(date) + 1) * DAY_MS - SEOUL_OFFSET_MS;
}

export function initDailyLandscape(doc = document, win = window) {
  const cover = doc.querySelector('[data-daily-landscape]');
  const data = doc.querySelector('#landscape-data');
  if (!cover || !data) return;
  const photos = JSON.parse(data.textContent);
  if (!photos.length) return;
  const image = cover.querySelector('img');
  const credit = cover.querySelector('a');
  let timer;
  let generation = 0;
  let activeDay;
  const failed = new Set();

  const refresh = () => {
    const now = new Date();
    const day = seoulDay(now);
    if (activeDay !== day) {
      activeDay = day;
      failed.clear();
    }
    const index = landscapeIndex(now, photos.length);
    const candidates = [photos[index], photos[(index + 1) % photos.length], photos[0]];
    const photo = candidates.find(candidate => !failed.has(candidate.src));
    if (!photo) { cover.hidden = true; return; }
    const apply = () => {
      image.alt = photo.title;
      image.width = photo.width;
      image.height = photo.height;
      image.style.objectPosition = photo.position;
      image.src = photo.src;
      credit.href = photo.sourceUrl;
      credit.textContent = `${photo.author} · ${photo.provider}`;
      credit.setAttribute('aria-label', `사진 출처: ${photo.author} · ${photo.provider} (새 탭)`);
      credit.title = `${photo.title} — ${photo.author} · ${photo.provider}`;
      cover.dataset.photoId = String(photo.id);
      cover.hidden = false;
    };
    if (image.getAttribute('src') === photo.src && image.complete && image.naturalWidth > 0) {
      apply();
      return;
    }
    const request = ++generation;
    const next = new win.Image();
    next.onload = () => {
      if (request === generation && seoulDay(new Date()) === day) apply();
    };
    next.onerror = () => {
      if (request !== generation) return;
      failed.add(photo.src);
      refresh();
    };
    next.src = photo.src;
  };

  const update = () => {
    win.clearTimeout(timer);
    refresh();
    // Schedule the next Korean midnight locally; no polling or API request.
    timer = win.setTimeout(update, Math.max(1000, nextLandscapeChange() - Date.now() + 100));
  };
  image.addEventListener('error', () => {
    failed.add(image.getAttribute('src'));
    refresh();
  });
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) update(); });
  win.addEventListener('pageshow', update);
  win.addEventListener('pagehide', () => {
    win.clearTimeout(timer);
    generation++;
  });
  update();
}

if (typeof document !== 'undefined') initDailyLandscape();
