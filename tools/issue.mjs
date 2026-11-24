#!/usr/bin/env node
// GitHub 이슈 양식(새 글 / 보안뉴스) → content/ 파일로 변환하고 사이트를 빌드한다.
// 이슈를 새로 열 때뿐 아니라 수정할 때도 같은 글을 다시 만든다(주소와 날짜는 처음 그대로).
//
// 데이터 보호
//  - 이슈로 만든 글을 누군가 저장소에서 직접 고쳤다면(마지막 변경이 자동 게시 커밋이 아니면) 덮어쓰지 않는다.
//    강제로 덮으려면 Actions에서 '다시 반영'을 force로 실행해야 한다.
//  - 이미 있는 이미지 파일은 덮어쓰거나 지우지 않는다. 새 이미지는 비어 있는 이름으로만 저장한다.
//  - 실패하면 새로 만든 파일은 지우고, 고친 파일은 원래 내용으로 되돌린다.
//
// 보안 원칙
//  - 이슈 내용은 셸·워크플로 표현식에 넣지 않고, 이벤트 JSON 파일에서 이 스크립트가 직접 읽는다.
//  - 저장소 소유자·협업자가 연 이슈만 처리한다(워크플로 조건 + 여기서 한 번 더 확인).
//  - 이미지는 GitHub가 올려 준 주소만 내려받고, 파일 내용(매직 바이트)으로 이미지인지 확인한다.
//  - 실패하면 만든 파일을 모두 지우고, 이유를 결과 파일에 적는다.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SITE, CATEGORIES } from './lib/site.mjs';
import { looksLikePastedHtml, htmlToMarkdown } from './lib/html2md.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const MAX_IMAGE = 8 * 1024 * 1024;
const IMAGE_HOST = /^https:\/\/(github\.com\/user-attachments\/assets\/|user-images\.githubusercontent\.com\/|private-user-images\.githubusercontent\.com\/)/i;

class UserError extends Error {}
class SkipError extends Error {}
export const BOT_NAME = 'p45ang-build';
const BOT_SUBJECT = /^post: (?:publish|update) from issue/;

// ───────────── 이슈 양식 읽기 ─────────────
// 양식의 칸 이름과 순서. 본문 안의 "### 소제목"을 칸으로 착각하지 않도록, 정해진 순서대로만 찾고
// 마지막 칸(본문 / 원문 공개일)은 끝까지를 그 칸의 내용으로 본다.
const FORMS = {
  post: ['제목', '분야', '요약', '태그', '주소 이름', '본문'],
  news: ['기사 주소', '제목', '한 줄 메모', '출처', '태그', '원문 공개일'],
};
export function formKind(body) {
  const first = String(body ?? '').replace(/\r\n?/g, '\n').match(/^### +(.+?) *$/m)?.[1];
  return Object.entries(FORMS).find(([, order]) => order[0] === first)?.[0] ?? null;
}
export function parseForm(body, kind = formKind(body)) {
  const text = String(body ?? '').replace(/\r\n?/g, '\n');
  const fields = {};
  const order = FORMS[kind] ?? [];
  const found = [];
  let from = 0;
  for (const label of order) {
    const re = new RegExp(`^### +${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} *$`, 'm');
    const m = re.exec(text.slice(from));
    if (!m) continue;
    found.push({ label, start: from + m.index, end: from + m.index + m[0].length });
    from = from + m.index + m[0].length;
  }
  found.forEach((f, i) => {
    const value = text.slice(f.end, i + 1 < found.length ? found[i + 1].start : text.length).trim();
    fields[f.label] = value === '_No response_' ? '' : value;
  });
  return fields;
}
const oneLine = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const validDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const kstDay = iso => new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString().slice(0, 10);

function imageExt(buf) {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 6 && buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}
async function defaultFetchImage(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'p45ang-issue-publisher' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_IMAGE) throw new Error('파일이 너무 큽니다');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE) throw new Error('파일이 너무 큽니다');
  return buf;
}

// 본문에서 코드 블록은 건드리지 않고, 이미지를 글 폴더로 가져온다.
async function localizeImages(body, dir, fetchImage, created) {
  const segments = body.split(/(^```[\s\S]*?^```[ \t]*$|^~~~[\s\S]*?^~~~[ \t]*$)/m);
  let n = 0;
  const cache = new Map();
  // 이미 글 폴더에 있는 이미지와 내용이 같으면 그 파일을 다시 쓰고, 새 이미지는 비어 있는 이름에만 저장한다.
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f)) : [];
  const sameAs = buf => existing.find(f => { try { return fs.readFileSync(path.join(dir, f)).equals(buf); } catch { return false; } });
  const grab = async (url, alt) => {
    const safeAlt = oneLine(alt, 100).replace(/[\[\]]/g, '');
    if (!IMAGE_HOST.test(url)) return `![${safeAlt}](${url})`; // 외부 이미지는 그대로 둔다(빌드가 주소를 검사)
    if (cache.has(url)) return `![${safeAlt}](${cache.get(url)})`;
    let buf;
    try { buf = await fetchImage(url); } catch (e) { throw new UserError(`이미지를 가져오지 못했습니다: ${url}\n(${e.message})`); }
    const ext = imageExt(buf);
    if (!ext) throw new UserError(`이미지 파일이 아니거나 지원하지 않는 형식입니다(png·jpg·gif·webp만 가능): ${url}`);
    const reuse = sameAs(buf);
    if (reuse) { cache.set(url, reuse); return `![${safeAlt}](${reuse})`; }
    let name;
    do name = `image-${++n}.${ext}`; while (fs.existsSync(path.join(dir, name)));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buf);
    created.push(path.join(dir, name));
    cache.set(url, name);
    return `![${safeAlt}](${name})`;
  };
  for (let i = 0; i < segments.length; i += 2) {
    let text = segments[i];
    // GitHub가 붙여넣은 이미지를 <img ...> 로 바꿔 넣는 경우가 많다.
    text = text.replace(/<img\b[^>]*>/gi, tag => {
      const src = tag.match(/\bsrc\s*=\s*"([^"]+)"/i)?.[1];
      const alt = tag.match(/\balt\s*=\s*"([^"]*)"/i)?.[1] ?? '';
      return src ? `![${alt.replace(/[\[\]\n]/g, ' ')}](${src})` : tag;
    });
    const re = /!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g;
    let out = '';
    let last = 0;
    for (const m of text.matchAll(re)) {
      out += text.slice(last, m.index) + await grab(m[2].replace(/^<|>$/g, ''), m[1]);
      last = m.index + m[0].length;
    }
    segments[i] = out + text.slice(last);
  }
  return segments.join('');
}

// ───────────── 글 / 뉴스 만들기 ─────────────
async function makePost(fields, issue, root, opts, created, edits) {
  const title = oneLine(fields['제목'], 120);
  if (!title) throw new UserError('제목이 비어 있습니다.');
  // 분야는 여러 개 고를 수 있다. GitHub는 "개발, 블로그/기술문서"처럼 쉼표로 이어서 보낸다.
  const picked = String(fields['분야'] ?? '').split(/,\s*|\n/).map(s => s.trim()).filter(Boolean);
  const cats = [];
  for (const label of picked) {
    const c = CATEGORIES.find(x => x.label === label);
    if (!c) throw new UserError(`분야를 고를 수 없습니다: "${label}"`);
    if (!cats.includes(c.key)) cats.push(c.key);
  }
  if (!cats.length) throw new UserError('분야를 하나 이상 골라 주세요.');
  if (cats.length > 3) throw new UserError('분야는 3개 이하로 골라 주세요.');
  let rawBody = (fields['본문'] ?? '').trim();
  if (!rawBody) throw new UserError('본문이 비어 있습니다.');
  // 옵시디언·웹페이지에서 서식째 붙여넣어 HTML이 된 본문은 마크다운으로 바꿔 저장한다.
  if (looksLikePastedHtml(rawBody)) rawBody = htmlToMarkdown(rawBody);

  // 이 이슈로 이미 만든 글이 있으면 그 글을 고친다(주소·날짜 유지).
  const existingSlug = findPostSlug(root, issue.number, opts);
  let slug = existingSlug;
  let date = kstDay(issue.created_at);
  let renamedFrom = null;
  if (existingSlug) {
    const file = path.join(root, 'content', 'posts', existingSlug, 'index.md');
    guardEdited(root, file, issue.number, opts);
    date = fs.readFileSync(file, 'utf8').match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1] ?? date;
    const wanted = oneLine(fields['주소 이름'], 60).toLowerCase();
    if (/^[a-z0-9][a-z0-9_-]*$/.test(wanted) && wanted !== existingSlug) renamedFrom = wanted;
  } else {
    if (opts.updateOnly) throw new SkipError('이 이슈로 게시된 글이 없습니다.');
    slug = oneLine(fields['주소 이름'], 60).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) slug = `post-${issue.number}`;
    if (fs.existsSync(path.join(root, 'content', 'posts', slug))) slug = `${slug}-${issue.number}`;
    if (fs.existsSync(path.join(root, 'content', 'posts', slug))) throw new UserError(`이미 같은 주소(${slug})의 글이 있습니다. 주소 이름을 바꿔 다시 올려 주세요.`);
  }
  const dir = path.join(root, 'content', 'posts', slug);
  if (!existingSlug) created.push(dir);

  const body = await localizeImages(rawBody, dir, opts.fetchImage ?? defaultFetchImage, created);
  const tags = [...new Set(String(fields['태그'] ?? '').split(/[,\n]/).map(t => oneLine(t.replace(/^#/, '').replace(/[\[\]",\\]/g, ''), 30)).filter(Boolean))].slice(0, 8);
  const q = s => `"${s.replace(/\\/g, '').replace(/"/g, '”')}"`;
  const head = ['---', `title: ${q(title)}`, `date: ${date}`, cats.length === 1 ? `category: ${cats[0]}` : `category: [${cats.join(', ')}]`];
  const summary = oneLine(fields['요약'], 160);
  if (summary) head.push(`summary: ${q(summary)}`);
  if (tags.length) head.push(`tags: [${tags.map(q).join(', ')}]`);
  head.push(`issue: ${issue.number}`);
  head.push('---', '');
  fs.mkdirSync(dir, { recursive: true });
  const changed = writeTracked(path.join(dir, 'index.md'), head.join('\n') + '\n' + body + '\n', edits);
  return { kind: '글', url: `${SITE}posts/${slug}/`, label: title, action: existingSlug ? (changed ? 'updated' : 'unchanged') : 'created', renamedFrom };
}

// 파일을 쓰기 전에 원래 내용을 기억해 둔다(실패하면 되돌린다). 내용이 같으면 쓰지 않는다.
function writeTracked(file, content, edits) {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (before === content) return false;
  if (before !== null && !edits.has(file)) edits.set(file, before);
  fs.writeFileSync(file, content);
  return true;
}

// ───────────── 이 이슈로 만든 글 찾기 ─────────────
function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}
const issueOf = file => {
  try {
    const head = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    return head.match(/^issue:\s*(\d+)\s*$/m)?.[1] ?? null;
  } catch { return null; }
};

export function findPostSlug(root, number, opts = {}) {
  const base = path.join(root, 'content', 'posts');
  if (!fs.existsSync(base)) return null;
  const dirs = fs.readdirSync(base).filter(d => fs.existsSync(path.join(base, d, 'index.md')));
  const marked = dirs.find(d => issueOf(path.join(base, d, 'index.md')) === String(number));
  if (marked) return marked;
  // 이 기능 전에 올린 글은 표시가 없다 → 처음 게시한 커밋 기록에서 찾고, 없으면 기본 주소(post-번호)를 본다.
  const log = (opts.git ?? git)(root, ['log', '--format=', '--name-only', '-E', `--grep=^post: publish from issue #${number}$`, '--', 'content/posts']);
  const fromLog = (log ?? '').split('\n').map(l => l.match(/^content\/posts\/([^/]+)\/index\.md$/)?.[1]).find(Boolean);
  const unmarked = d => d && dirs.includes(d) && issueOf(path.join(base, d, 'index.md')) === null;
  if (unmarked(fromLog)) return fromLog;
  if (unmarked(`post-${number}`)) return `post-${number}`;
  return null;
}

// 마지막으로 이 파일을 바꾼 커밋이 자동 게시가 아니면 = 누군가 저장소에서 직접 고쳤다 → 덮어쓰지 않는다.
function guardEdited(root, file, number, opts) {
  if (opts.force) return;
  const rel = path.relative(root, file).split(path.sep).join('/');
  const out = (opts.git ?? git)(root, ['log', '-1', '--format=%an%x1f%s', '--', rel]);
  if (!out || !out.trim()) return; // 기록이 없으면(테스트·첫 커밋 전) 막지 않는다
  const [name, subject] = out.trim().split('\x1f');
  if (name === BOT_NAME && BOT_SUBJECT.test(subject)) return;
  throw new ProtectedError(rel, number);
}
class ProtectedError extends UserError {
  constructor(rel, number) {
    super(`\`${rel}\` 파일을 저장소에서 직접 고친 기록이 있어서, 그 내용을 지키려고 이슈 수정으로 덮어쓰지 않았습니다.`);
    this.rel = rel; this.number = number;
  }
}

function makeNews(fields, issue, root, created, opts = {}, edits = new Map()) {
  const title = oneLine(fields['제목'], 140);
  const note = oneLine(fields['한 줄 메모'], 400);
  if (!title) throw new UserError('제목이 비어 있습니다.');
  if (!note) throw new UserError('한 줄 메모가 비어 있습니다.');
  let url;
  try {
    url = new URL(oneLine(fields['기사 주소'], 2000));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('scheme');
  } catch { throw new UserError('기사 주소는 https:// 로 시작하는 주소여야 합니다.'); }
  const host = url.hostname.replace(/^www\./, '');
  const source = oneLine(fields['출처'], 60) || (/^(x|twitter)\.com$/.test(host) ? 'X' : host);
  const newsDir = path.join(root, 'content', 'news');
  const existing = fs.existsSync(newsDir) ? fs.readdirSync(newsDir).find(f => f.endsWith(`-${issue.number}.json`) && /^\d{4}-\d{2}-\d{2}-\d+\.json$/.test(f)) : null;
  if (existing) guardEdited(root, path.join(newsDir, existing), issue.number, opts);
  else if (opts.updateOnly) throw new SkipError('이 이슈로 게시된 뉴스가 없습니다.');
  const item = { date: existing ? existing.slice(0, 10) : kstDay(issue.created_at) };
  const published = oneLine(fields['원문 공개일'], 10);
  if (published) {
    if (!validDay(published)) throw new UserError('원문 공개일은 2026-11-12 형식으로 적어 주세요.');
    item.publishedDate = published;
  }
  Object.assign(item, { title, source, url: url.href, note });
  const tag = oneLine(fields['태그'], 20);
  if (tag) item.tag = tag;
  const file = path.join(newsDir, existing ?? `${item.date}-${issue.number}.json`);
  fs.mkdirSync(newsDir, { recursive: true });
  if (!existing) created.push(file);
  const changed = writeTracked(file, JSON.stringify(item, null, 2) + '\n', edits);
  return { kind: '보안뉴스', url: `${SITE}#news`, label: title, action: existing ? (changed ? 'updated' : 'unchanged') : 'created' };
}

function runBuild(root) {
  try {
    execFileSync(process.execPath, [path.join(root, 'tools', 'build.mjs')], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new UserError(`사이트를 만드는 중 오류가 났습니다.\n${String(e.stderr || e.message).slice(0, 1500)}`);
  }
}

// ───────────── 이슈 하나 처리 ─────────────
export async function handleIssue(event, opts = {}) {
  const root = opts.root ?? ROOT;
  const issue = event?.issue;
  const created = [];
  const edits = new Map();
  try {
    if (!issue || !['opened', 'edited'].includes(event.action) || issue.pull_request) return { ok: false, skip: true, message: '새로 열리거나 수정된 이슈가 아니라서 건너뜁니다.' };
    if (!TRUSTED.has(issue.author_association)) return { ok: false, skip: true, message: '저장소 소유자·협업자가 아니라서 처리하지 않습니다.' };
    const kind = formKind(issue.body);
    // 양식이 아닌 이슈를 수정한 경우(일반 메모 등)는 조용히 넘어간다.
    if (!kind && event.action === 'edited') return { ok: false, skip: true, message: '양식으로 쓴 이슈가 아니라서 건너뜁니다.' };
    const fields = parseForm(issue.body, kind);
    let result;
    if (kind === 'news') result = makeNews(fields, issue, root, created, opts, edits);
    else if (kind === 'post') result = await makePost(fields, issue, root, opts, created, edits);
    else throw new UserError('"새 글" 또는 "보안뉴스" 양식으로 작성한 이슈가 아닙니다. New issue에서 양식을 골라 다시 올려 주세요.');
    if (result.action !== 'unchanged') (opts.runBuild ?? runBuild)(root);
    return { ok: true, ...result };
  } catch (e) {
    for (const p of created.reverse()) fs.rmSync(p, { recursive: true, force: true });
    for (const [file, before] of edits) fs.writeFileSync(file, before);
    if (e instanceof SkipError) return { ok: false, skip: true, message: e.message };
    if (!(e instanceof UserError)) console.error(e);
    return {
      ok: false,
      protected: e instanceof ProtectedError,
      update: event?.action === 'edited',
      number: issue?.number,
      message: e instanceof UserError ? e.message : '예상하지 못한 오류가 났습니다. Actions 탭의 로그를 확인해 주세요.',
    };
  }
}

export function commentFor(r) {
  const editHint = '\n\n이후에도 이 이슈를 수정하면 블로그에 같이 반영됩니다.';
  if (r.ok && r.action === 'updated') {
    const moved = r.renamedFrom ? `\n\n주소 이름(${r.renamedFrom})은 이미 공개된 주소가 깨지지 않도록 바꾸지 않았습니다.` : '';
    return `✏️ 수정한 내용을 반영했습니다: ${r.kind} **${r.label}**\n\n1~2분 뒤 ${r.url} 에서 볼 수 있습니다.${moved}`;
  }
  if (r.ok) return `✅ ${r.kind} **${r.label}** 을(를) 올렸습니다.\n\n1~2분 뒤 ${r.url} 에서 볼 수 있습니다.${editHint}`;
  if (r.protected) return `⚠️ 수정 내용을 반영하지 않았습니다. 블로그의 글은 그대로입니다.\n\n${r.message}\n\n저장소에서 고친 내용이 사라져도 괜찮다면: **Actions → publish-from-issue → Run workflow**에서 이슈 번호에 \`${r.number}\`, 적용(apply)과 강제(force)를 켜고 실행하세요.`;
  if (r.update) return `❌ 수정 내용을 반영하지 못했습니다. 블로그의 글은 수정 전 그대로입니다.\n\n${r.message}\n\n이슈를 다시 고치면 다시 시도합니다.`;
  return `❌ 올리지 못했습니다. 사이트는 바뀌지 않았습니다.\n\n${r.message}\n\n이 이슈를 고치면 다시 시도합니다.`;
}

// ───────────── 지난 이슈 다시 반영 (Actions에서 수동 실행) ─────────────
async function fetchIssues(selector) {
  const repo = process.env.GITHUB_REPOSITORY;
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'user-agent': 'p45ang-issue-publisher' };
  const api = async url => {
    const res = await fetch(`https://api.github.com/repos/${repo}${url}`, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
    return res.json();
  };
  const want = String(selector ?? 'all').trim();
  if (want && want !== 'all') {
    const nums = [...new Set(want.split(/[\s,]+/).map(s => s.replace(/^#/, '')).filter(s => /^\d+$/.test(s)).map(Number))];
    if (!nums.length) throw new Error('이슈 번호를 읽을 수 없습니다. 예: 20, 25 또는 all');
    return Promise.all(nums.map(n => api(`/issues/${n}`)));
  }
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const list = await api(`/issues?state=all&per_page=100&page=${page}&direction=asc`);
    all.push(...list);
    if (list.length < 100) break;
  }
  return all;
}

export async function resync(issues, opts = {}) {
  const lines = [];
  const changed = [];
  for (const issue of issues.sort((a, b) => a.number - b.number)) {
    if (issue.pull_request || !formKind(issue.body)) continue;
    // 다시 반영은 이미 게시된 글·뉴스만 고친다(실패했던 이슈로 새 글을 만들지 않는다).
    const r = await handleIssue({ action: 'edited', issue }, { ...opts, updateOnly: true });
    const label = `#${issue.number} ${oneLine(issue.title, 60)}`;
    if (r.skip) lines.push(`- ${label} — 건너뜀 (${r.message})`);
    else if (r.ok && r.action === 'unchanged') lines.push(`- ${label} — 변경 없음`);
    else if (r.ok) { changed.push(issue.number); lines.push(`- ${label} — ${r.action === 'created' ? '새로 만듦' : '수정 반영'}`); }
    else if (r.protected) lines.push(`- ${label} — 보호됨: 저장소에서 직접 고친 기록이 있어 그대로 둠 (force로 덮어쓸 수 있음)`);
    else lines.push(`- ${label} — 실패: ${oneLine(r.message, 200)}`);
  }
  return { changed, lines };
}

// ───────────── 명령줄 실행 ─────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === '--resync') {
  const force = process.env.FORCE === 'true';
  const { changed, lines } = await resync(await fetchIssues(process.env.RESYNC_ISSUES), { force });
  const report = [`### 지난 이슈 다시 반영${force ? ' (강제)' : ''}`, '', ...(lines.length ? lines : ['- 양식으로 쓴 이슈가 없습니다.'])].join('\n');
  if (process.env.RESULT_FILE) fs.writeFileSync(process.env.RESULT_FILE, JSON.stringify({ changed }));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  console.log(report);
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const r = await handleIssue(event);
  const resultFile = process.env.RESULT_FILE;
  if (resultFile) {
    // 변경 없음(제목만 고친 경우 등)은 댓글을 달지 않는다.
    fs.writeFileSync(resultFile, JSON.stringify({ ok: r.ok, skip: !!r.skip || r.action === 'unchanged', created: r.action === 'created' }));
    fs.writeFileSync(resultFile.replace(/\.json$/, '.md'), commentFor(r));
  }
  console.log(r.ok ? `완료: ${r.kind} — ${r.label}` : `실패/건너뜀: ${r.message}`);
}
