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
      card.hidden = category !== 'all' && card.dataset.recordCategory !== category;
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
    const cover = document.querySelector('.preview-cover');
    const coverCaption = cover ? document.createElement('p') : null;
    if (coverCaption) {
      coverCaption.className = 'preview-cover-caption';
      cover.querySelector('p')?.after(coverCaption);
    }
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
        if (coverCaption) {
          const seoul = new Date(now.getTime() + 9 * 36e5);
          coverCaption.textContent = String(seoul.getUTCMonth() + 1).padStart(2, '0') + '.' + String(seoul.getUTCDate()).padStart(2, '0') + ' · ' + photo.title;
        }
        photoDialog?.setAttribute('aria-label', '풍경만 보기 · ' + photo.title);
      }
      timer = setTimeout(updatePhoto, Math.max(1000, nextLandscapeChange(now) - Date.now() + 100));
    }
    updatePhoto();
    addEventListener('pageshow', updatePhoto);
    addEventListener('pagehide', () => clearTimeout(timer));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updatePhoto(); });

    // 글 카드 썸네일: 글을 쓴 날에 보여 줬을 풍경 사진(assets/landscapes/thumbs/)
    function dayPhoto(value) {
      const date = new Date(value + 'T12:00:00+09:00');
      return Number.isNaN(date.getTime()) ? null : photos[landscapeIndex(date, photos.length)];
    }
    function thumbnail(photo) {
      const figure = document.createElement('figure');
      figure.className = 'preview-thumb';
      const image = document.createElement('img');
      image.src = new URL(photo.src.replace('/landscapes/', '/landscapes/thumbs/'), root).href;
      image.alt = '';
      image.width = 720;
      image.height = 374;
      image.loading = 'lazy';
      image.decoding = 'async';
      const caption = document.createElement('figcaption');
      caption.textContent = '그날의 풍경 · ' + photo.title;
      figure.append(image, caption);
      return figure;
    }
    for (const item of document.querySelectorAll('.preview-entry, .post-card')) {
      const value = item.querySelector('time[datetime]')?.getAttribute('datetime') ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
      const photo = dayPhoto(value);
      if (!photo) continue;
      const figure = thumbnail(photo);
      const old = item.querySelector('.preview-visual');
      if (item.classList.contains('preview-entry')) {
        figure.classList.add('preview-visual');
        if (old) old.replaceWith(figure);
        else item.append(figure);
      } else {
        (item.querySelector('.card-link') ?? item).prepend(figure);
      }
      figure.querySelector('img').addEventListener('error', () => {
        if (old) figure.replaceWith(old);
        else figure.remove();
      }, { once: true });
    }
  }

  const newsList = document.querySelector('[data-news-list]');
  if (newsList) {
    const queryInput = document.querySelector('[data-news-query]');
    const monthSelect = document.querySelector('[data-news-month]');
    const status = document.querySelector('[data-news-status]');
    function validDate(value) {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(value);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    const source = Array.isArray(globalThis.p45angSecurityNews) ? globalThis.p45angSecurityNews : [];
    const news = source.flatMap(item => {
      if (!item || !validDate(item.date)) return [];
      if (![item.title, item.note, item.source].every(value => typeof value === 'string' && value.trim())) return [];
      try {
        const url = new URL(item.url);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return [];
        return [{ ...item, url: url.href }];
      } catch {
        return [];
      }
    }).sort((a, b) => b.date.localeCompare(a.date));
    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text) element.textContent = text;
      if (className) element.className = className;
      return element;
    }
    const months = new Map();
    for (const item of news) {
      const month = item.date.slice(0, 7);
      if (!months.has(month)) months.set(month, []);
      months.get(month).push(item);
    }
    const groups = [];
    for (const [month, items] of months) {
      const label = month.replace('-', '.');
      const option = node('option', label);
      option.value = month;
      monthSelect?.append(option);
      const section = node('details', '', 'preview-news-month');
      section.open = groups.length === 0;
      const summary = node('summary');
      const count = node('small', items.length + '건');
      summary.append(node('span', label), count);
      section.append(summary);
      const rows = [];
      for (const item of items) {
        const article = node('article', '', 'preview-news-item');
        const meta = node('div', '', 'preview-news-meta');
        const time = node('time', '작성일 ' + item.date.replaceAll('-', '.'));
        time.dateTime = item.date;
        meta.append(time);
        if (validDate(item.publishedDate)) {
          const published = node('time', '원문 ' + item.publishedDate.replaceAll('-', '.'));
          published.dateTime = item.publishedDate;
          meta.append(published);
        }
        const tag = typeof item.tag === 'string' ? item.tag.trim() : '';
        if (tag) meta.append(node('span', tag, 'preview-news-tag'));
        if (item.example) meta.append(node('span', '예시'));
        const link = node('a', item.source + ' 원문 ↗');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        article.append(meta, node('h3', item.title), node('p', item.note), link);
        section.append(article);
        rows.push({ article, text: [item.title, item.note, item.source, tag].join(' ').toLocaleLowerCase('ko') });
      }
      groups.push({ month, section, rows, count, wasOpen: section.open });
      newsList.append(section);
    }
    const emptyNews = node('p', '', 'preview-records-empty');
    newsList.append(emptyNews);
    let filtered = false;
    function filterNews() {
      const terms = (queryInput?.value || '').trim().toLocaleLowerCase('ko').split(/\s+/).filter(Boolean);
      const month = monthSelect?.value || '';
      const filtering = Boolean(month || terms.length);
      let shown = 0;
      for (const group of groups) {
        if (filtering && !filtered) group.wasOpen = group.section.open;
        let matched = 0;
        for (const row of group.rows) {
          row.article.hidden = Boolean(month && month !== group.month) || !terms.every(term => row.text.includes(term));
          if (!row.article.hidden) matched++;
        }
        group.section.hidden = matched === 0;
        if (filtering) group.section.open = matched > 0;
        else if (filtered) group.section.open = group.wasOpen;
        group.count.textContent = (matched === group.rows.length ? matched : matched + ' / ' + group.rows.length) + '건';
        shown += matched;
      }
      filtered = filtering;
      if (status) status.textContent = (filtering ? '표시 ' + shown + '건 · ' : '') + '전체 ' + news.length + '건';
      emptyNews.hidden = shown > 0;
      emptyNews.textContent = news.length ? '일치하는 보안 뉴스 없음' : '등록된 보안 뉴스 없음';
    }
    queryInput?.addEventListener('input', filterNews);
    monthSelect?.addEventListener('change', filterNews);
    filterNews();
  }

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

  if (motion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-flow-active');
        observer.unobserve(entry.target);
      }
    }, { threshold: .45 });
    document.querySelectorAll('.preview-flow').forEach(figure => observer.observe(figure));
  }
})();
