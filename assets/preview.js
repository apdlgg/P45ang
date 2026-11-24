(() => {
  const views = [...document.querySelectorAll('[data-preview-view]')];
  const nav = [...document.querySelectorAll('[data-preview-nav]')];
  const timeline = document.querySelector('.preview-timeline');
  const months = [...document.querySelectorAll('.preview-month')];
  const filters = [...document.querySelectorAll('[data-record-filter]')];
  const recordCards = [...document.querySelectorAll('[data-record-list] [data-record-category]')];
  const recordList = document.querySelector('[data-record-list]');
  const empty = document.querySelector('[data-records-empty]');
  const resultCount = document.querySelector('[data-records-count]');
  const photoOpener = document.querySelector('[data-preview-photo]');
  const photoDialog = document.getElementById('landscape-dialog');
  const canOpenPhoto = photoOpener && typeof photoDialog?.showModal === 'function';
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  let pending = false;
  let currentMonth;
  let currentView;

  function updateTimeline() {
    pending = false;
    if (!timeline.getClientRects().length) return;
    const center = innerHeight * .5;
    const frame = timeline.getBoundingClientRect();
    timeline.style.setProperty('--track-y', Math.max(0, Math.min(frame.height, center - frame.top)) + 'px');
    let nearest;
    let distance = Infinity;
    for (const month of months) {
      if (month.hidden) continue;
      const box = month.getBoundingClientRect();
      const gap = Math.abs((box.top + box.bottom) / 2 - center);
      if (gap < distance) {
        nearest = month;
        distance = gap;
      }
    }
    if (nearest !== currentMonth) {
      currentMonth?.classList.remove('is-current');
      currentMonth?.querySelector('time')?.removeAttribute('aria-current');
      currentMonth = nearest;
      currentMonth?.classList.add('is-current');
      currentMonth?.querySelector('time')?.setAttribute('aria-current', 'date');
    }
  }

  function scheduleTimelineUpdate() {
    if (!timeline || pending) return;
    pending = true;
    requestAnimationFrame(updateTimeline);
  }

  if (timeline) {
    addEventListener('scroll', scheduleTimelineUpdate, { passive: true });
    addEventListener('resize', scheduleTimelineUpdate);
    addEventListener('pageshow', scheduleTimelineUpdate);
    scheduleTimelineUpdate();
  }

  function filterRecords(value) {
    if (!recordList) return;
    const category = filters.some(filter => filter.dataset.recordFilter === value) ? value : 'all';
    let total = 0;
    for (const card of recordCards) {
      card.hidden = category !== 'all' && !card.dataset.recordCategory.split(' ').includes(category);
      if (!card.hidden) total++;
    }
    recordList.hidden = total === 0;
    if (empty) empty.hidden = total > 0;
    if (resultCount) resultCount.textContent = '게시글 ' + total + '개';
    for (const filter of filters) {
      if (filter.dataset.recordFilter === category) filter.setAttribute('aria-current', 'page');
      else filter.removeAttribute('aria-current');
    }
  }

  function showRoute(initial = false) {
    const [name, category] = location.hash.slice(1).split('/');
    const next = views.find(view => view.dataset.previewView === name) ?? views.find(view => view.dataset.previewView === 'home');
    if (next && currentView !== next) {
      const route = next.dataset.previewView;
      for (const view of views) {
        view.hidden = view !== next;
        view.classList.remove('is-entering');
      }
      currentView = next;
      if (canOpenPhoto) {
        photoOpener.hidden = route !== 'home';
        if (photoOpener.hidden && photoDialog.open) photoDialog.close();
      }
      for (const link of nav) {
        if (link.dataset.previewNav === route) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      const heading = next.querySelector('h1');
      const label = nav.find(link => link.dataset.previewNav === route)?.textContent.trim() || heading.textContent.trim();
      document.title = route === 'home' ? 'P45ang' : label + ' — P45ang';
      if (!initial) {
        scrollTo(0, 0);
        heading.focus({ preventScroll: true });
        next.classList.add('is-entering');
      }
    }
    filterRecords(name === 'records' ? category : 'all');
    scheduleTimelineUpdate();
  }

  if (views.length || filters.length) {
    addEventListener('hashchange', () => showRoute());
    showRoute(true);
  }
  if (views.length) {
    for (const link of nav) {
      link.addEventListener('click', () => {
        if (document.getElementById('main-nav')?.classList.contains('open')) document.querySelector('.mobile-toggle')?.click();
      });
    }
    document.querySelector('.skip-link')?.addEventListener('click', event => {
      event.preventDefault();
      currentView?.querySelector('h1')?.focus();
    });
  }
  if (canOpenPhoto) {
    photoOpener.addEventListener('click', () => { if (!photoDialog.open) photoDialog.showModal(); });
    photoDialog.addEventListener('close', () => { if (!photoOpener.hidden) photoOpener.focus({ preventScroll: true }); });
  }

  // 포인트 컬러: 사진의 대표색에서 색상을 뽑는다.
  // 어두운 사진은 저장된 포인트 컬러가 회색에 가까워서, 색상만 대표색을 따르고 밝기는 배경 대비 5:1에 맞춘다.
  // 사진 자체가 흑백에 가까우면 기본 연두(preview.css의 기본값과 같다)를 쓴다.
  const FALLBACK_ACCENT = { dark: '#a9bb96', light: '#526b3c' };
  const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const toRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  function toHsl(hex) {
    const [r, g, b] = toRgb(hex).map(v => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    let h = 0;
    if (d) {
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  }
  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
  }
  function luminance(hex) {
    const [r, g, b] = toRgb(hex).map(v => {
      v /= 255;
      return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    });
    return .2126 * r + .7152 * g + .0722 * b;
  }
  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + .05) / (lo + .05);
  }
  function accentsFor(photo) {
    if (!isHex(photo.dominant)) return { dark: photo.darkAccent, light: photo.lightAccent };
    const [h, s, l] = toHsl(photo.dominant);
    if (s < .18 || Math.max(...toRgb(photo.dominant)) < 24 || l > .95) return FALLBACK_ACCENT;
    const sat = Math.min(.6, Math.max(.35, s));
    let dark = .62;
    let light = .34;
    while (dark < .9 && contrast(fromHsl(h, sat, dark), '#161616') < 5) dark += .02;
    while (light > .1 && contrast(fromHsl(h, sat, light), '#fafafa') < 5) light -= .02;
    return { dark: fromHsl(h, sat, dark), light: fromHsl(h, sat, light) };
  }

  const photos = globalThis.p45angDailyPhotos;
  if (photos?.length && document.currentScript?.src && typeof landscapeIndex === 'function') {
    const root = new URL('../', document.currentScript.src);
    const credits = document.querySelectorAll('[data-photo-credit]');
    let photoId;
    let timer;
    function updatePhoto() {
      clearTimeout(timer);
      const now = new Date();
      const photo = photos[landscapeIndex(now, photos.length)];
      if (photo.id !== photoId) {
        photoId = photo.id;
        const url = new URL(photo.src, root).href;
        const style = document.documentElement.style;
        const accents = accentsFor(photo);
        style.setProperty('--preview-photo', 'url("' + url + '")');
        style.setProperty('--preview-photo-accent-dark', accents.dark);
        style.setProperty('--preview-photo-accent-light', accents.light);
        for (const credit of credits) {
          credit.href = photo.sourceUrl;
          credit.textContent = photo.author + ' · ' + photo.provider;
        }
        photoDialog?.setAttribute('aria-label', '풍경만 보기 · ' + photo.title);
      }
      timer = setTimeout(updatePhoto, Math.max(1000, nextLandscapeChange(now) - Date.now() + 100));
    }
    updatePhoto();
    addEventListener('pageshow', updatePhoto);
    addEventListener('pagehide', () => clearTimeout(timer));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updatePhoto(); });

  }

  // 스크롤하면 배경 사진이 최대 10px까지 흐려진다. 움직임 줄이기를 켠 환경에서는 쓰지 않는다.
  if (motion.matches) {
    const docEl = document.documentElement;
    let blur = -1;
    let queued = false;
    const applyBlur = () => {
      queued = false;
      const next = Math.round(Math.min(1, scrollY / Math.max(1, innerHeight * .8)) * 10);
      if (next === blur) return;
      blur = next;
      docEl.style.setProperty('--preview-blur', next + 'px');
    };
    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(applyBlur);
    }, { passive: true });
    addEventListener('resize', applyBlur);
    applyBlur();
  }

  // 글 카드·아카이브 썸네일은 tools/build.mjs가 HTML에 미리 넣어 둔다(본문 첫 이미지가 있을 때만).

  // 목차의 강조 항목과 진행선은 같은 읽기 위치를 기준으로 갱신한다.
  (() => {
    const nav = document.querySelector('.toc nav');
    const fill = nav?.querySelector('.toc-fill');
    const article = document.querySelector('#article-body');
    if (!nav || !fill || !article) return;
    const items = [...nav.querySelectorAll('a')].map(link => {
      let id = '';
      try { id = decodeURIComponent(link.hash.slice(1)); } catch { /* 건너뜀 */ }
      return { link, heading: id ? document.getElementById(id) : null };
    }).filter(item => item.heading);
    if (!items.length) return;
    let frame = 0;
    let active = -1;
    function draw() {
      frame = 0;
      if (!nav.offsetParent) return; // 모바일처럼 목차를 숨긴 화면
      const y = scrollY + innerHeight * 0.35;
      const top = element => element.getBoundingClientRect().top + scrollY;
      const center = item => item.link.offsetTop + item.link.offsetHeight / 2;
      const tops = items.map(item => top(item.heading));
      const end = top(article) + article.offsetHeight;
      let at = -1;
      tops.forEach((value, index) => { if (y >= value) at = index; });
      let height;
      const atEnd = scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      if (atEnd && end <= scrollY + innerHeight) {
        at = items.length - 1;
        height = nav.clientHeight;
      } else if (at < 0) {
        const start = top(article);
        height = tops[0] > start + 1 ? center(items[0]) * Math.min(1, Math.max(0, (y - start) / (tops[0] - start))) : 0;
      } else {
        const next = at + 1 < items.length ? tops[at + 1] : end;
        const ratio = Math.min(1, Math.max(0, (y - tops[at]) / Math.max(1, next - tops[at])));
        const from = center(items[at]);
        const to = at + 1 < items.length ? center(items[at + 1]) : nav.clientHeight;
        height = from + (to - from) * ratio;
      }
      nav.style.setProperty('--toc-fill', `${Math.round(height)}px`);
      const nextActive = Math.max(0, at);
      if (nextActive !== active) {
        const previous = items[active]?.link;
        previous?.classList.remove('active');
        previous?.removeAttribute('aria-current');
        const current = items[nextActive].link;
        current.classList.add('active');
        current.setAttribute('aria-current', 'location');
        active = nextActive;
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    addEventListener('load', schedule);
    addEventListener('pageshow', schedule);
    addEventListener('hashchange', schedule);
    article.addEventListener('load', schedule, true);
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(schedule); ro.observe(article); ro.observe(nav); }
    draw();
  })();

  for (const comparison of document.querySelectorAll('[data-preview-compare]')) {
    const buttons = [...comparison.querySelectorAll('[data-compare-option]')];
    const panels = [...comparison.querySelectorAll('[data-compare-panel]')];
    comparison.addEventListener('click', event => {
      const control = event.target.closest('[data-compare-option]');
      if (!buttons.includes(control)) return;
      const selected = control.dataset.compareOption;
      for (const button of buttons) button.setAttribute('aria-pressed', String(button === control));
      for (const panel of panels) panel.hidden = panel.dataset.comparePanel !== selected;
    });
  }

  // 글을 연 직후 상단바를 잠시 낮춘다. 처음 스크롤·휠·방향키, 또는 상단바에 마우스나 포커스가 가면 원래대로.
  // 동작 줄이기를 켰거나, 목차 링크(#)로 들어왔거나, 이미 스크롤된 채로 열렸으면 하지 않는다.
  const header = document.querySelector('.site-header');
  if (document.querySelector('.article-page') && header && motion.matches && !location.hash && scrollY < 8) {
    const root = document.documentElement;
    root.classList.add('is-reading-intro');
    const keys = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Tab']);
    const restore = () => {
      root.classList.remove('is-reading-intro');
      removeEventListener('scroll', onScroll);
      removeEventListener('wheel', restore);
      removeEventListener('touchmove', restore);
      removeEventListener('keydown', onKey);
      header.removeEventListener('pointermove', onPointer);
      header.removeEventListener('focusin', restore);
    };
    const onScroll = () => { if (scrollY > 8) restore(); };
    const onKey = event => { if (keys.has(event.key)) restore(); };
    // 페이지가 열릴 때 마우스가 원래 상단바 위에 있던 경우는 무시하고, 실제로 움직였을 때만 되돌린다.
    const onPointer = event => { if (event.movementX || event.movementY) restore(); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('wheel', restore, { passive: true });
    addEventListener('touchmove', restore, { passive: true });
    addEventListener('keydown', onKey);
    header.addEventListener('pointermove', onPointer);
    header.addEventListener('focusin', restore);
  }
})();
