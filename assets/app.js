(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const base = document.body.dataset.base || '';
  const themeButton = $('.theme-toggle');
  const updateThemeLabel = () => themeButton?.setAttribute('aria-label', document.documentElement.dataset.theme === 'dark' ? '밝은 테마로 전환' : '어두운 테마로 전환');
  updateThemeLabel();
  themeButton?.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('p45ang-theme', theme); } catch {}
    updateThemeLabel();
  });
  const menuButton = $('.mobile-toggle');
  menuButton?.addEventListener('click', () => {
    const open = $('#main-nav').classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('#main-nav')?.classList.contains('open')) menuButton.click();
  });

  const dialog = $('.search-dialog');
  const searchInput = $('#global-search');
  const results = $('#search-results');
  const meta = $('#search-meta');
  let index;
  let loading;
  let loadError = false;
  let searchTimer;
  async function loadIndex() {
    if (index) return;
    if (!loading) {
      loadError = false;
      loading = fetch(`${base}/search.json`).then(response => {
        if (!response.ok) throw new Error('검색 자료를 가져오지 못했습니다.');
        return response.json();
      }).then(data => { index = data; }).catch(() => { loadError = true; }).finally(() => { loading = null; });
    }
    await loading;
  }
  function renderResults() {
    if (loadError) {
      meta.textContent = '검색 자료를 불러오지 못했습니다.';
      results.innerHTML = '<div class="search-empty">연결을 확인한 뒤 다시 시도해주세요.<br><button class="text-link" id="retry-search">다시 불러오기 →</button></div>';
      $('#retry-search').addEventListener('click', async () => { meta.textContent = '기록을 불러오는 중…'; await loadIndex(); renderResults(); });
      return;
    }
    if (!index) { meta.textContent = '기록을 불러오는 중…'; results.innerHTML = ''; return; }
    if (!index.length) {
      meta.textContent = '공개된 글 0편';
      results.innerHTML = '<div class="search-empty">아직 게시글이 없습니다.</div>';
      return;
    }
    const query = searchInput.value.trim().toLocaleLowerCase('ko');
    const terms = query.split(/\s+/).filter(Boolean);
    const matching = index.filter(p => terms.every(term => `${p.title} ${p.summary} ${p.category} ${p.tags.join(' ')} ${p.text}`.toLocaleLowerCase('ko').includes(term)));
    meta.textContent = query ? `“${searchInput.value.trim()}” 검색 결과 ${matching.length}편` : `전체 기록 ${index.length}편 · 제목, 내용, 태그를 검색합니다`;
    results.innerHTML = matching.length ? matching.map(p => `<a class="search-result" href="${esc(p.url)}"><small>${esc(p.category)} · ${esc(p.date.replaceAll('-', '.'))}</small><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p></a>`).join('') : '<div class="search-empty">아직 일치하는 기록이 없어요.<br>다른 단어로 찾아보세요.</div>';
  }
  async function openSearch(value = '') {
    if (!dialog.open) dialog.showModal();
    searchInput.value = value;
    searchInput.focus();
    renderResults();
    await loadIndex();
    renderResults();
  }
  document.querySelectorAll('[data-open-search]').forEach(button => button.addEventListener('click', () => openSearch()));
  document.querySelectorAll('[data-search]').forEach(button => button.addEventListener('click', () => openSearch(button.dataset.search)));
  $('[data-close-search]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  searchInput?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderResults, 70); });
  dialog?.addEventListener('keydown', event => {
    const links = [...results.querySelectorAll('a')];
    const active = links.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' && links.length) { event.preventDefault(); links[Math.min(active + 1, links.length - 1)].focus(); }
    if (event.key === 'ArrowUp' && active >= 0) { event.preventDefault(); if (active === 0) searchInput.focus(); else links[active - 1].focus(); }
    if (event.key === 'Enter' && document.activeElement === searchInput && links.length) { event.preventDefault(); links[0].click(); }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
  });

  let toastTimer;
  function toast(message) {
    const element = $('.toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
  }
  async function copy(text) {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; }
    const area = document.createElement('textarea');
    area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.append(area); area.select();
    const success = document.execCommand('copy'); area.remove();
    if (!success) throw new Error('복사 실패');
  }
  $('.share-button')?.addEventListener('click', async () => {
    try { await copy(location.href); toast('글 주소를 복사했어요.'); } catch { toast('주소창에서 글 주소를 직접 복사해주세요.'); }
  });
  document.querySelectorAll('.prose pre').forEach(pre => {
    const code = pre.querySelector('code');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'copy-code'; button.textContent = '복사'; button.setAttribute('aria-label', '코드 복사');
    button.addEventListener('click', async () => {
      try { await copy(code ? code.textContent : pre.textContent); button.textContent = '복사됨 ✓'; setTimeout(() => { button.textContent = '복사'; }, 2200); } catch { toast('코드를 선택해 직접 복사해주세요.'); }
    });
    pre.append(button);
  });
  document.querySelectorAll('.prose table').forEach(table => {
    const wrap = document.createElement('div'); wrap.className = 'table-scroll'; wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', '표 · 좌우로 스크롤 가능');
    table.before(wrap); wrap.append(table);
  });
  const progress = $('.reading-progress');
  const article = $('#article-body');
  if (progress && article) {
    const updateProgress = () => {
      const top = article.getBoundingClientRect().top + scrollY;
      const available = article.offsetHeight - innerHeight + 110;
      const ratio = Math.max(0, Math.min(1, (scrollY - top + 110) / Math.max(1, available)));
      progress.style.width = `${ratio * 100}%`;
    };
    document.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress); updateProgress();
    const links = [...document.querySelectorAll('.toc a')];
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        links.forEach(link => {
          const active = decodeURIComponent(link.hash.slice(1)) === entry.target.id;
          link.classList.toggle('active', active);
          if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
        });
      }
    }, { rootMargin: '-100px 0px -60% 0px', threshold: 0 });
    document.querySelectorAll('.prose h2, .prose h3').forEach(heading => observer.observe(heading));
  }
})();
