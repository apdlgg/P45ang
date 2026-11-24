(() => {
  const newsList = document.querySelector('[data-news-list]');
  if (newsList) {
    const queryInput = document.querySelector('[data-news-query]');
    const monthSelect = document.querySelector('[data-news-month]');
    const status = document.querySelector('[data-news-status]');
    const dialog = document.getElementById('security-news-dialog');
    const dialogTitle = document.getElementById('news-dialog-title');
    const dialogMeta = document.querySelector('[data-news-dialog-meta]');
    const dialogNote = document.querySelector('[data-news-dialog-note]');
    const dialogSource = document.querySelector('[data-news-dialog-source]');
    const canOpenDialog = typeof dialog?.showModal === 'function' && dialogTitle && dialogMeta && dialogNote && dialogSource;
    let returnFocus;
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
    function newsMeta(item) {
      const meta = node('div', '', 'preview-news-meta');
      const time = node('time', '작성일 ' + item.date.replaceAll('-', '.'));
      time.dateTime = item.date;
      meta.append(time);
      if (validDate(item.publishedDate)) {
        const published = node('time', '원문 ' + item.publishedDate.replaceAll('-', '.'));
        published.dateTime = item.publishedDate;
        meta.append(published);
      }
      if (typeof item.tag === 'string' && item.tag.trim()) meta.append(node('span', item.tag.trim(), 'preview-news-tag'));
      if (item.example) meta.append(node('span', '예시'));
      return meta;
    }
    function sourceLink(link, item, label) {
      link.textContent = item.source + ' ' + label;
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', item.source + ' ' + label + ' (새 탭)');
    }
    function openMemo(item, opener) {
      if (!canOpenDialog || dialog.open) return;
      returnFocus = opener;
      dialogTitle.textContent = item.title;
      dialogMeta.replaceChildren(newsMeta(item));
      dialogNote.textContent = item.note;
      sourceLink(dialogSource, item, '원문 보기');
      dialog.showModal();
    }
    document.querySelector('[data-close-news]')?.addEventListener('click', () => dialog?.close());
    dialog?.addEventListener('close', () => returnFocus?.focus({ preventScroll: true }));
    dialog?.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    addEventListener('hashchange', () => { if (dialog?.open) dialog.close(); });
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
        const meta = newsMeta(item);
        const tag = typeof item.tag === 'string' ? item.tag.trim() : '';
        const heading = node('h3');
        const control = node(canOpenDialog ? 'button' : 'a', item.title, 'preview-news-title-button');
        if (canOpenDialog) {
          control.type = 'button';
          control.setAttribute('aria-haspopup', 'dialog');
          control.setAttribute('aria-controls', 'security-news-dialog');
          control.setAttribute('aria-label', item.title + ' 메모 보기');
          control.addEventListener('click', () => openMemo(item, control));
        } else {
          sourceLink(control, item, '원문');
          control.textContent = item.title;
          control.setAttribute('aria-label', item.title + ' 원문 (새 탭)');
        }
        heading.append(control);
        const link = node('a', '', 'preview-news-source');
        sourceLink(link, item, '원문');
        article.append(meta, heading, node('p', item.note), link);
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

})();
