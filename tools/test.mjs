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
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(directory, 'index.html'));
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
  assert(fs.existsSync(path.join(directory, '.nojekyll')));
  const read = file => fs.readFileSync(path.join(directory, file), 'utf8');
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
