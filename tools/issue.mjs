#!/usr/bin/env node
// GitHub 이슈 양식(새 글 / 보안뉴스) → content/ 파일로 변환하고 사이트를 빌드한다.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const MAX_IMAGE = 8 * 1024 * 1024;
const IMAGE_HOST = /^https:\/\/(github\.com\/user-attachments\/assets\/|user-images\.githubusercontent\.com\/|private-user-images\.githubusercontent\.com\/)/i;

class UserError extends Error {}

// ───────────── 이슈 양식 읽기 ─────────────
export function parseForm(body) {
  const fields = {};
  const parts = String(body ?? '').replace(/\r\n?/g, '\n').split(/^### +(.+?) *$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const value = parts[i + 1].trim();
    fields[parts[i].trim()] = value === '_No response_' ? '' : value;
  }
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
  const grab = async (url, alt) => {
    const safeAlt = oneLine(alt, 100).replace(/[\[\]]/g, '');
    if (!IMAGE_HOST.test(url)) return `![${safeAlt}](${url})`; // 외부 이미지는 그대로 둔다(빌드가 주소를 검사)
    if (cache.has(url)) return `![${safeAlt}](${cache.get(url)})`;
    let buf;
    try { buf = await fetchImage(url); } catch (e) { throw new UserError(`이미지를 가져오지 못했습니다: ${url}\n(${e.message})`); }
    const ext = imageExt(buf);
    if (!ext) throw new UserError(`이미지 파일이 아니거나 지원하지 않는 형식입니다(png·jpg·gif·webp만 가능): ${url}`);
    const name = `image-${++n}.${ext}`;
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
async function makePost(fields, issue, root, opts, created) {
  const title = oneLine(fields['제목'], 120);
  if (!title) throw new UserError('제목이 비어 있습니다.');
  const cat = CATEGORIES.find(c => c.label === fields['분야']);
  if (!cat) throw new UserError(`분야를 고를 수 없습니다: "${fields['분야'] ?? ''}"`);
  const rawBody = (fields['본문'] ?? '').trim();
  if (!rawBody) throw new UserError('본문이 비어 있습니다.');

  let slug = oneLine(fields['주소 이름'], 60).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) slug = `post-${issue.number}`;
  if (fs.existsSync(path.join(root, 'content', 'posts', slug))) slug = `${slug}-${issue.number}`;
  const dir = path.join(root, 'content', 'posts', slug);
  if (fs.existsSync(dir)) throw new UserError(`이미 같은 주소(${slug})의 글이 있습니다. 주소 이름을 바꿔 다시 올려 주세요.`);
  created.push(dir);

  const body = await localizeImages(rawBody, dir, opts.fetchImage ?? defaultFetchImage, created);
  const tags = [...new Set(String(fields['태그'] ?? '').split(/[,\n]/).map(t => oneLine(t.replace(/^#/, '').replace(/[\[\]",\\]/g, ''), 30)).filter(Boolean))].slice(0, 8);
  const q = s => `"${s.replace(/\\/g, '').replace(/"/g, '”')}"`;
  const head = ['---', `title: ${q(title)}`, `date: ${kstDay(issue.created_at)}`, `category: ${cat.key}`];
  const summary = oneLine(fields['요약'], 160);
  if (summary) head.push(`summary: ${q(summary)}`);
  if (tags.length) head.push(`tags: [${tags.map(q).join(', ')}]`);
  head.push('---', '');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.md'), head.join('\n') + '\n' + body + '\n');
  return { kind: '글', url: `${SITE}posts/${slug}/`, label: title };
}

function makeNews(fields, issue, root, created) {
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
  const item = { date: kstDay(issue.created_at) };
  const published = oneLine(fields['원문 공개일'], 10);
  if (published) {
    if (!validDay(published)) throw new UserError('원문 공개일은 2026-11-12 형식으로 적어 주세요.');
    item.publishedDate = published;
  }
  Object.assign(item, { title, source, url: url.href, note });
  const tag = oneLine(fields['태그'], 20);
  if (tag) item.tag = tag;
  const file = path.join(root, 'content', 'news', `${item.date}-${issue.number}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(item, null, 2) + '\n');
  created.push(file);
  return { kind: '보안뉴스', url: `${SITE}#news`, label: title };
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
  try {
    if (!issue || event.action !== 'opened' || issue.pull_request) return { ok: false, skip: true, message: '새로 열린 이슈가 아니라서 건너뜁니다.' };
    if (!TRUSTED.has(issue.author_association)) return { ok: false, skip: true, message: '저장소 소유자·협업자가 아니라서 처리하지 않습니다.' };
    const fields = parseForm(issue.body);
    let result;
    if ('기사 주소' in fields) result = makeNews(fields, issue, root, created);
    else if ('본문' in fields) result = await makePost(fields, issue, root, opts, created);
    else throw new UserError('"새 글" 또는 "보안뉴스" 양식으로 작성한 이슈가 아닙니다. New issue에서 양식을 골라 다시 올려 주세요.');
    (opts.runBuild ?? runBuild)(root);
    return { ok: true, ...result };
  } catch (e) {
    for (const p of created.reverse()) fs.rmSync(p, { recursive: true, force: true });
    if (!(e instanceof UserError)) console.error(e);
    return { ok: false, message: e instanceof UserError ? e.message : '예상하지 못한 오류가 났습니다. Actions 탭의 로그를 확인해 주세요.' };
  }
}

export function commentFor(r) {
  if (r.ok) return `✅ ${r.kind} **${r.label}** 을(를) 올렸습니다.\n\n1~2분 뒤 ${r.url} 에서 볼 수 있습니다.`;
  return `❌ 올리지 못했습니다. 사이트는 바뀌지 않았습니다.\n\n${r.message}\n\n내용을 고쳐 새 이슈로 다시 올려 주세요.`;
}

// ───────────── 명령줄 실행 ─────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const r = await handleIssue(event);
  const resultFile = process.env.RESULT_FILE;
  if (resultFile) {
    fs.writeFileSync(resultFile, JSON.stringify({ ok: r.ok, skip: !!r.skip }));
    fs.writeFileSync(resultFile.replace(/\.json$/, '.md'), commentFor(r));
  }
  console.log(r.ok ? `완료: ${r.kind} — ${r.label}` : `실패/건너뜀: ${r.message}`);
}
