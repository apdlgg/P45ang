import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function tocPage() {
  const attributes = Array.from({ length: 3 }, () => new Map());
  const links = [0, 40, 80].map((offsetTop, index) => ({
    hash: '#heading-' + index,
    offsetTop,
    offsetHeight: 40,
    classList: { add() {}, remove() {} },
    setAttribute: (name, value) => attributes[index].set(name, value),
    removeAttribute: name => attributes[index].delete(name),
  }));
  const styles = new Map();
  const listeners = new Map();
  const frames = [];
  const nav = {
    offsetParent: {},
    clientHeight: 120,
    querySelector: () => ({}),
    querySelectorAll: () => links,
    style: { setProperty: (name, value) => styles.set(name, value) },
  };
  const context = {
    scrollY: 0,
    innerHeight: 720,
    URL,
    window: {},
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: callback => frames.push(callback),
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const article = {
    offsetHeight: 1900,
    getBoundingClientRect: () => ({ top: 100 - context.scrollY }),
    addEventListener() {},
  };
  const headings = [120, 800, 1500].map(top => ({
    getBoundingClientRect: () => ({ top: top - context.scrollY }),
  }));
  context.document = {
    documentElement: { scrollHeight: 3000 },
    currentScript: { src: 'https://apdlgg.github.io/P45ang/assets/app.js' },
    querySelector: selector => ({ '.toc nav': nav, '#article-body': article })[selector] ?? null,
    querySelectorAll: () => [],
    getElementById: id => /^heading-\d$/.test(id) ? headings[Number(id.slice(-1))] : null,
    addEventListener() {},
  };
  vm.createContext(context);
  for (const name of ['app.js', 'preview.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', name), 'utf8'), context);
  }
  const flush = () => { while (frames.length) frames.shift()(); };
  flush();
  return {
    context,
    nav,
    active: () => attributes.findIndex(value => value.has('aria-current')),
    fill: () => parseFloat(styles.get('--toc-fill')),
    update(event, scrollY = context.scrollY) {
      context.scrollY = scrollY;
      listeners.get(event)();
      flush();
    },
  };
}

test('목차의 강조 항목과 진행선이 빠른 이동과 역방향 이동에서 함께 갱신된다', () => {
  const page = tocPage();
  assert.equal(page.active(), 0);
  page.update('scroll', 1000);
  assert.equal(page.active(), 1);
  assert.equal(page.fill(), 86);
  page.update('hashchange', 1500);
  assert.equal(page.active(), 2);
  assert.equal(page.fill(), 110);
  page.update('scroll', 0);
  assert.equal(page.active(), 0);
  assert(page.fill() < 40);
});

test('글 끝과 숨겨진 목차의 크기 변경을 처리한다', () => {
  const page = tocPage();
  page.context.document.documentElement.scrollHeight = 2200;
  page.update('scroll', 1480);
  assert.equal(page.fill(), 120);
  assert.equal(page.active(), 2);
  page.nav.offsetParent = null;
  page.update('scroll', 0);
  assert.equal(page.fill(), 120);
  page.nav.offsetParent = {};
  page.update('resize');
  assert.equal(page.active(), 0);
  assert(page.fill() < 40);
});

test('이미지 문단을 건너뛰어 요약하고 선택한 썸네일과 기존 읽는 시간 항목을 지원한다', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'p45ang-test-'));
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'tools'), path.join(directory, 'tools'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(directory, 'assets'), {
    recursive: true,
    filter: source => path.basename(source) !== 'landscapes',
  });
  fs.mkdirSync(path.join(directory, 'content'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'content', 'profile.json'), path.join(directory, 'content', 'profile.json'));
  const fixtures = [
    { slug: 'plain', body: '## 소제목\n\n첫 문단입니다.\n\n다음 문단입니다.', summary: '첫 문단입니다.', image: false },
    { slug: 'image-first', body: '![그림](diagram.svg)\n\n## 소제목\n\n첫 문단입니다.', summary: '첫 문단입니다.', image: true },
    { slug: 'image-only', body: '![그림](diagram.svg)', summary: '', image: true },
    { slug: 'no-thumbnail', body: '![그림](diagram.svg)\n\n본문입니다.', extra: 'thumbnail: none\n', summary: '본문입니다.', image: false },
    { slug: 'explicit', body: '## 소제목\n\n본문입니다.', extra: 'summary: 직접 쓴 요약\nthumbnail: diagram.svg\n', summary: '직접 쓴 요약', image: true },
  ];
  for (const fixture of fixtures) {
    const post = path.join(directory, 'content', 'posts', fixture.slug);
    fs.mkdirSync(post, { recursive: true });
    fs.writeFileSync(path.join(post, 'index.md'), `---\ntitle: 검증용 글\ndate: 2026-11-15\ncategory: development\ntags: [검증]\nreadingTime: 4\n${fixture.extra ?? ''}---\n\n${fixture.body}\n`);
    fs.writeFileSync(path.join(post, 'diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>');
  }
  const build = () => execFileSync(process.execPath, [path.join(directory, 'tools', 'build.mjs')]);
  build();
  assert(fs.existsSync(path.join(directory, '_site', '.nojekyll')));
  // 결과는 _site/ 에만 생기고 저장소 맨 위에는 아무것도 만들지 않는다
  for (const f of ['index.html', 'posts', 'categories', 'archive', 'feed.xml', 'sitemap.xml']) assert(!fs.existsSync(path.join(directory, f)), f);
  const read = file => fs.readFileSync(path.join(directory, '_site', file), 'utf8');
  const data = {};
  vm.runInNewContext(read('assets/search-index.js'), data);
  const home = read('index.html');
  const cards = home.match(/<article class="post-card"[^>]*>[\s\S]*?<\/article>/g);
  for (const fixture of fixtures) {
    const item = data.p45angSearchIndex.find(item => item.url === `posts/${fixture.slug}/index.html`);
    assert.equal(item.summary, fixture.summary);
    const card = cards.find(card => card.includes(`href="posts/${fixture.slug}/index.html"`));
    assert.equal(card.includes('class="preview-thumb"'), fixture.image);
    const post = read(`posts/${fixture.slug}/index.html`);
    assert(!post.includes('class="article-summary"'));
    assert(!post.includes('분 읽기'));
    assert(post.indexOf('id="article-body"') < post.indexOf('class="article-tags"'));
  }
  const firstBuild = read('index.html');
  build();
  assert.equal(read('index.html'), firstBuild);
});

// ───────────── 이슈 수정 반영 · 붙여넣은 HTML ─────────────
const { htmlToMarkdown, looksLikePastedHtml } = await import('./lib/html2md.mjs');
const { handleIssue, resync, commentFor, BOT_NAME } = await import('./issue.mjs');

test('붙여넣은 HTML 본문을 마크다운으로 바꾸고 위험한 태그와 주소는 버린다', () => {
  const html = '<html>\n<body>\n<!--StartFragment--><h1>제목</h1>\n<p>첫 <strong>문단</strong> &amp; <code>a*b</code></p>\n<h2>소제목</h2>\n<ul><li>하나</li><li>둘</li></ul>\n<pre><code class="language-c">if (a&lt;b) {}</code></pre>\n<p><a href="javascript:alert(1)">나쁜 링크</a> <a href="https://example.com">좋은 링크</a></p><script>alert(1)</script><img src="app://local/x.png" alt="내 그림"><!--EndFragment-->\n</body>\n</html>';
  assert(looksLikePastedHtml(html));
  assert(!looksLikePastedHtml('## 마크다운 글\n\n본문에 <b>태그</b>가 조금 있다.'));
  const md = htmlToMarkdown(html);
  assert.match(md, /^# 제목$/m);
  assert.match(md, /^## 소제목$/m);
  assert.match(md, /첫 \*\*문단\*\* & `a\*b`/);
  assert.match(md, /^- 하나\n- 둘$/m);
  assert.match(md, /```c\nif \(a<b\) \{\}\n```/);
  assert.match(md, /\[좋은 링크\]\(<https:\/\/example\.com>\)/);
  assert(!/javascript:|<script|alert\(1\)|app:\/\//.test(md));
  assert.match(md, /이미지: 내 그림/);
});

function issueRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p45ang-issue-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'content', 'posts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'content', 'news'), { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q');
  const commit = (name, msg) => { git('add', '-A'); git('-c', `user.name=${name}`, '-c', 'user.email=t@example.com', 'commit', '-qm', msg, '--allow-empty'); };
  commit('setup', 'init');
  return { dir, commit, read: rel => fs.readFileSync(path.join(dir, rel), 'utf8') };
}
const PNG_A = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('aaaaaaaa')]);
const PNG_B = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('bbbbbbbb')]);
const IMG = id => `https://github.com/user-attachments/assets/${id}`;
const postBody = ({ title = '테스트 글', slug = 'issue-test', body = '## 개념\n\n본문입니다.' } = {}) =>
  `### 제목\n\n${title}\n\n### 분야\n\n개발, 블로그/기술문서\n\n### 요약\n\n_No response_\n\n### 태그\n\n테스트\n\n### 주소 이름\n\n${slug}\n\n### 본문\n\n${body}\n`;
const issueOf = (number, body, created = '2026-11-20T01:00:00Z') => ({ number, title: '[글] 테스트', body, created_at: created, author_association: 'OWNER' });

test('이슈를 수정하면 같은 글을 고치고, 주소·날짜·기존 이미지는 그대로 둔다', async t => {
  const repo = issueRepo(t);
  const opts = { root: repo.dir, runBuild: () => {}, fetchImage: async url => (url.endsWith('a') ? PNG_A : PNG_B) };
  let r = await handleIssue({ action: 'opened', issue: issueOf(7, postBody({ body: `![그림](${IMG('a')})\n\n본문입니다.` })) }, opts);
  assert.equal(r.ok, true); assert.equal(r.action, 'created');
  const file = 'content/posts/issue-test/index.md';
  assert.match(repo.read(file), /^issue: 7$/m);
  assert.match(repo.read(file), /^date: 2026-11-20$/m);
  repo.commit(BOT_NAME, 'post: publish from issue #7');

  // 주소 이름을 바꾸고, 같은 이미지 + 새 이미지를 넣고, 이슈 작성일이 달라 보여도 주소·날짜는 유지
  r = await handleIssue({ action: 'edited', issue: issueOf(7, postBody({ title: '고친 제목', slug: 'other-name', body: `![그림](${IMG('a')})\n\n![새 그림](${IMG('b')})\n\n고친 본문입니다.` }), '2026-11-25T01:00:00Z') }, opts);
  assert.equal(r.ok, true); assert.equal(r.action, 'updated'); assert.equal(r.renamedFrom, 'other-name');
  const md = repo.read(file);
  assert.match(md, /title: "고친 제목"/); assert.match(md, /^date: 2026-11-20$/m); assert.match(md, /고친 본문입니다/);
  assert.match(md, /!\[그림\]\(image-1\.png\)/); assert.match(md, /!\[새 그림\]\(image-2\.png\)/);
  assert(fs.readFileSync(path.join(repo.dir, 'content/posts/issue-test/image-1.png')).equals(PNG_A));
  assert(!fs.existsSync(path.join(repo.dir, 'content/posts/other-name')));
  assert.match(commentFor(r), /수정한 내용을 반영했습니다/);
  repo.commit(BOT_NAME, 'post: update from issue #7');

  // 같은 내용으로 다시 수정(제목만 바꾼 경우 등) → 변경 없음
  const same = await handleIssue({ action: 'edited', issue: issueOf(7, postBody({ title: '고친 제목', body: `![그림](${IMG('a')})\n\n![새 그림](${IMG('b')})\n\n고친 본문입니다.` })) }, opts);
  assert.equal(same.action, 'unchanged');

  // 저장소에서 직접 고친 글은 덮어쓰지 않는다
  fs.writeFileSync(path.join(repo.dir, file), repo.read(file).replace('고친 본문입니다', '직접 고친 본문'));
  repo.commit('someone', 'Update index.md');
  const before = repo.read(file);
  r = await handleIssue({ action: 'edited', issue: issueOf(7, postBody({ body: '이슈에서 또 고침' })) }, opts);
  assert.equal(r.ok, false); assert.equal(r.protected, true);
  assert.equal(repo.read(file), before);
  assert.match(commentFor(r), /force/);

  // force면 덮어쓴다
  r = await handleIssue({ action: 'edited', issue: issueOf(7, postBody({ body: '이슈에서 또 고침' })) }, { ...opts, force: true });
  assert.equal(r.action, 'updated'); assert.match(repo.read(file), /이슈에서 또 고침/);
  repo.commit(BOT_NAME, 'post: update from issue #7');

  // 빌드가 실패하면 수정 전 내용으로 되돌리고 새 이미지 파일은 지운다
  const good = repo.read(file);
  r = await handleIssue({ action: 'edited', issue: issueOf(7, postBody({ body: `![셋째](${IMG('c')})\n\n깨지는 수정` })) },
    { ...opts, fetchImage: async () => Buffer.concat([PNG_A.subarray(0, 8), Buffer.from('cccccccc')]), runBuild: () => { throw new Error('boom'); } });
  assert.equal(r.ok, false);
  assert.equal(repo.read(file), good);
  assert(!fs.existsSync(path.join(repo.dir, 'content/posts/issue-test/image-3.png')));
});

test('예전에 올린 글(표시 없음)과 보안뉴스도 수정 반영하고, 다시 반영은 게시된 것만 고친다', async t => {
  const repo = issueRepo(t);
  const opts = { root: repo.dir, runBuild: () => {} };
  fs.mkdirSync(path.join(repo.dir, 'content/posts/post-9'));
  fs.writeFileSync(path.join(repo.dir, 'content/posts/post-9/index.md'), '---\ntitle: "옛 글"\ndate: 2026-11-01\ncategory: development\n---\n\n<html><body><h1>붙여넣은 글</h1><p>옛 본문</p><p>둘째</p></body></html>\n');
  repo.commit(BOT_NAME, 'post: publish from issue #9');
  let r = await handleIssue({ action: 'edited', issue: issueOf(9, postBody({ slug: '', body: '<html>\n<body>\n<h2>고친 글</h2>\n<p>새 본문</p>\n<p>둘째 문단</p>\n</body>\n</html>' })) }, opts);
  assert.equal(r.action, 'updated');
  const md = repo.read('content/posts/post-9/index.md');
  assert.match(md, /^date: 2026-11-01$/m); assert.match(md, /^## 고친 글$/m); assert(!md.includes('<p>'));

  const news = n => `### 기사 주소\n\nhttps://x.com/a/status/1\n\n### 제목\n\n뉴스 제목\n\n### 한 줄 메모\n\n${n}\n\n### 출처\n\n_No response_\n\n### 태그\n\n#테스트\n\n### 원문 공개일\n\n_No response_\n`;
  r = await handleIssue({ action: 'opened', issue: { ...issueOf(11, news('처음 메모')), created_at: '2026-11-21T15:30:00Z' } }, opts);
  assert.equal(r.action, 'created');
  repo.commit(BOT_NAME, 'post: publish from issue #11');
  r = await handleIssue({ action: 'edited', issue: { ...issueOf(11, news('고친 메모')), created_at: '2026-11-21T15:30:00Z' } }, opts);
  assert.equal(r.action, 'updated');
  const item = JSON.parse(repo.read('content/news/2026-11-22-11.json'));
  assert.equal(item.note, '고친 메모'); assert.equal(item.date, '2026-11-22');

  const { changed, lines } = await resync([issueOf(12, postBody({ slug: 'never-published' })), issueOf(9, postBody({ slug: '', body: '다시 반영된 본문' }))], opts);
  assert.deepEqual(changed, [9]);
  assert(!fs.existsSync(path.join(repo.dir, 'content/posts/never-published')));
  assert(lines.some(l => l.startsWith('- #12') && l.includes('건너뜀')));
});

test('붙여넣은 HTML로 저장된 글도 빌드에서 태그 없이 보인다', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'p45ang-html-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'tools'), path.join(directory, 'tools'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(directory, 'assets'), { recursive: true, filter: s => path.basename(s) !== 'landscapes' });
  fs.mkdirSync(path.join(directory, 'content'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'content', 'profile.json'), path.join(directory, 'content', 'profile.json'));
  const post = path.join(directory, 'content', 'posts', 'pasted');
  fs.mkdirSync(post, { recursive: true });
  const src = '---\ntitle: 붙여넣은 글\ndate: 2026-11-24\ncategory: writing\nissue: 25\n---\n\n<html>\n<body>\n<!--StartFragment--><h2>소제목</h2>\n<p>본문 <code>x</code></p>\n<p>둘째</p><!--EndFragment-->\n</body>\n</html>\n';
  fs.writeFileSync(path.join(post, 'index.md'), src);
  execFileSync(process.execPath, [path.join(directory, 'tools', 'build.mjs')], { stdio: 'pipe' });
  const html = fs.readFileSync(path.join(directory, '_site', 'posts', 'pasted', 'index.html'), 'utf8');
  assert(!html.includes('&lt;p&gt;'));
  assert.match(html, /<h2 id="[^"]+">소제목<\/h2>/);
  assert.equal(fs.readFileSync(path.join(post, 'index.md'), 'utf8'), src); // 원본 파일은 그대로
});

test('홈·정보 페이지는 템플릿과 profile.json으로 만들고, 오류가 나면 이전 결과를 그대로 둔다', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'p45ang-site-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, 'tools'), path.join(directory, 'tools'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(directory, 'assets'), { recursive: true, filter: s => path.basename(s) !== 'landscapes' });
  fs.mkdirSync(path.join(directory, 'content', 'posts', 'one'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'content', 'posts', 'one', 'index.md'), '---\ntitle: 하나\ndate: 2026-11-24\ncategory: [ctf-wargame, writing]\n---\n\n본문입니다.\n');
  const profile = { name: '테스트', intro: '첫 줄\n둘째 줄 <b>', interests: '보안', about: '소개', github: 'https://github.com/example' };
  fs.writeFileSync(path.join(directory, 'content', 'profile.json'), JSON.stringify(profile));
  const build = () => execFileSync(process.execPath, [path.join(directory, 'tools', 'build.mjs')], { stdio: 'pipe' });
  build();
  const read = file => fs.readFileSync(path.join(directory, '_site', file), 'utf8');
  const home = read('index.html');
  const about = read('about/index.html');
  for (const page of [home, about]) {
    assert.match(page, /첫 줄<br>둘째 줄 &lt;b&gt;/);
    assert.match(page, /href="https:\/\/github\.com\/example"[^>]*>example ↗/);
  }
  // 홈 안의 메뉴는 같은 페이지 이동, 다른 페이지는 홈으로 이동
  assert.match(home, /<a href="#records" data-preview-nav="records">/);
  assert.match(read('posts/one/index.html'), /href="\.\.\/\.\.\/index\.html#records"/);
  assert.match(read('404.html'), /href="\/P45ang\/index\.html#home"/);
  // 뉴스 스크립트와 메모 팝업은 홈에만, 사진 보기 버튼도 홈에만
  assert(home.includes('assets/news.js?v=') && home.includes('id="security-news-dialog"') && home.includes('data-preview-photo'));
  assert(!about.includes('news.js') && !about.includes('data-preview-photo'));
  // 스타일 파일은 하나만
  assert(home.includes('assets/site.css?v=') && !home.includes('style.css') && !home.includes('preview.css'));
  assert(fs.existsSync(path.join(directory, '_site', 'assets', 'site.css')));
  // 여러 분야 글은 두 분야 목록에 모두 나온다
  assert(read('categories/ctf-wargame/index.html').includes('posts/one/') && read('categories/writing/index.html').includes('posts/one/'));

  // 템플릿 값이 빠지면 빌드가 실패하고 이전 결과는 남아 있다
  const before = read('index.html');
  fs.appendFileSync(path.join(directory, 'tools', 'templates', 'home.html'), '{{missingValue}}');
  assert.throws(build);
  assert.equal(read('index.html'), before);
  assert(!fs.readdirSync(directory).some(n => n.startsWith('_site.tmp')));
});
