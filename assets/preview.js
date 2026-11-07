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
        style.setProperty('--preview-photo', 'url("' + url + '")');
        style.setProperty('--preview-photo-accent-dark', photo.darkAccent);
        style.setProperty('--preview-photo-accent-light', photo.lightAccent);
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
