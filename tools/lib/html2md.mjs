// 붙여넣은 HTML(옵시디언·웹페이지에서 복사한 글)을 마크다운으로 바꾼다.
//
// 이슈 본문에 서식 있는 글을 붙여넣으면 GitHub가 <p>, <h2> 같은 HTML을 그대로 저장하는 경우가 있다.
// 빌드는 보안상 원시 HTML을 실행하지 않고 글자로 보여 주므로, 그대로 두면 태그가 화면에 보인다.
// 여기서는 글에 필요한 태그만 마크다운으로 옮기고 나머지 태그는 버린다(속성은 링크·이미지 주소만 쓴다).

const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'figure', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'hr', 'details', 'summary', 'dl', 'dt', 'dd']);
const VOID = new Set(['br', 'hr', 'img', 'meta', 'link', 'input', 'col', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track']);
const DROP = new Set(['script', 'style', 'head', 'title', 'template', 'noscript', 'iframe', 'object', 'svg', 'math', 'button', 'select', 'textarea']);

/** 본문 전체가 붙여넣은 HTML 문서처럼 보이는지 */
export function looksLikePastedHtml(text) {
  const t = String(text ?? '').replace(/^﻿/, '').trim();
  if (!t.startsWith('<')) return false;
  if (/^<(?:!doctype\s+html|html|body)\b/i.test(t) || /^<!--\s*StartFragment\s*-->/i.test(t)) return true;
  // 문서 표시는 없어도 줄 대부분이 블록 태그로 시작하면 붙여넣은 HTML로 본다.
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  const tagged = lines.filter(l => /^<\/?(?:p|h[1-6]|ul|ol|li|pre|blockquote|table|div|hr|br)\b/i.test(l)).length;
  return lines.length >= 3 && tagged / lines.length >= 0.6;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', times: '×', rarr: '→', larr: '←' };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  const top = () => stack[stack.length - 1];
  const text = s => { if (s) top().children.push({ text: decodeEntities(s) }); };
  let m;
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (!m[1]) continue; // 주석·doctype
    const tag = m[1].toLowerCase();
    if (m[0][1] === '/') {
      const i = stack.map(n => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const attrs = {};
    for (const a of (m[2] || '').matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    }
    // <p> 안에 블록이 오면 앞의 <p>를 닫는다(브라우저와 같은 동작)
    if (BLOCK.has(tag) && top().tag === 'p') stack.pop();
    if (tag === 'li') { const i = stack.map(n => n.tag).lastIndexOf('li'); const l = Math.max(stack.map(n => n.tag).lastIndexOf('ul'), stack.map(n => n.tag).lastIndexOf('ol')); if (i > l && i > 0) stack.length = i; }
    const node = { tag, attrs, children: [] };
    top().children.push(node);
    if (!VOID.has(tag) && !m[3]) {
      if (DROP.has(tag)) {
        // 내용까지 버린다
        const end = html.toLowerCase().indexOf(`</${tag}`, last);
        const close = end < 0 ? html.length : (html.indexOf('>', end) + 1 || html.length);
        last = close;
        re.lastIndex = close;
        top().children.pop();
        continue;
      }
      stack.push(node);
    }
  }
  text(html.slice(last));
  return root;
}

const safeHref = h => {
  const v = String(h ?? '').trim();
  if (/^(?:https?:|mailto:)/i.test(v) || v.startsWith('#') || (/^[^:]+$/.test(v) && v !== '')) return v;
  return null;
};
const escText = s => s.replace(/\\/g, '\\\\').replace(/([*_`[\]])/g, '\\$1');
const hasBlock = n => n.children?.some(c => c.tag && (BLOCK.has(c.tag) || hasBlock(c)));
const textOf = n => n.text != null ? n.text : n.children.map(textOf).join('');

function inline(nodes, ctx = {}) {
  let out = '';
  for (const n of nodes) {
    if (n.text != null) { out += ctx.code ? n.text : escText(n.text.replace(/\s+/g, ' ')); continue; }
    const kids = () => inline(n.children, ctx);
    switch (n.tag) {
      case 'br': out += '  \n'; break;
      case 'strong': case 'b': { const k = kids().trim(); if (k) out += `**${k}**`; break; }
      case 'em': case 'i': { const k = kids().trim(); if (k) out += `*${k}*`; break; }
      case 'del': case 's': case 'strike': { const k = kids().trim(); if (k) out += `~~${k}~~`; break; }
      case 'code': case 'kbd': case 'samp': {
        const t = textOf(n).replace(/\s+/g, ' ');
        if (!t) break;
        const ticks = t.includes('`') ? '``' : '`';
        out += `${ticks}${ticks.length > 1 ? ' ' : ''}${t}${ticks.length > 1 ? ' ' : ''}${ticks}`;
        break;
      }
      case 'a': {
        const k = kids().trim();
        const href = safeHref(n.attrs.href);
        out += href && k ? `[${k}](<${href.replace(/[<>]/g, encodeURIComponent)}>)` : k;
        break;
      }
      case 'img': {
        // https 이미지만 남긴다(옵시디언의 app:// 같은 내 컴퓨터 주소는 사이트에서 열 수 없다).
        const src = String(n.attrs.src ?? '').trim();
        const alt = (n.attrs.alt ?? '').replace(/[\[\]\n]/g, ' ').trim();
        if (/^https:\/\//i.test(src)) out += `![${alt}](<${src.replace(/[<>]/g, encodeURIComponent)}>)`;
        else if (alt) out += escText(`[이미지: ${alt}]`);
        break;
      }
      default: out += kids();
    }
  }
  return out;
}

function blocks(nodes, depth = 0) {
  const parts = [];
  let run = [];
  const flush = () => {
    const t = inline(run).replace(/[ \t]+\n/g, m => m.includes('  \n') ? '  \n' : '\n').replace(/^[ \t]+|[ \t]+$/g, '').trim();
    if (t) parts.push(t.replace(/^(#{1,6}\s|>|[-+*]\s|\d+[.)]\s)/, '\\$1'));
    run = [];
  };
  for (const n of nodes) {
    // html·body·span처럼 블록이 아닌 태그라도 안에 블록이 있으면 껍데기로 보고 안쪽을 처리한다.
    if (n.text != null || (!BLOCK.has(n.tag) && !hasBlock(n))) { run.push(n); continue; }
    flush();
    const t = n.tag;
    if (/^h[1-6]$/.test(t)) {
      const level = Math.min(Number(t[1]), 4);
      const k = inline(n.children).replace(/\s+/g, ' ').trim();
      if (k) parts.push(`${'#'.repeat(level)} ${k}`);
    } else if (t === 'p' || t === 'summary' || t === 'figcaption' || t === 'dt') {
      const k = blocks(n.children, depth);
      if (k) parts.push(k);
    } else if (t === 'hr') parts.push('---');
    else if (t === 'pre') {
      const codeEl = n.children.find(c => c.tag === 'code');
      const lang = String((codeEl ?? n).attrs?.class ?? '').match(/(?:language|lang)-([A-Za-z0-9_+-]+)/)?.[1] ?? '';
      const code = textOf(n).replace(/\n$/, '');
      const fence = code.includes('```') ? '~~~' : '```';
      parts.push(`${fence}${lang}\n${code}\n${fence}`);
    } else if (t === 'blockquote') {
      const k = blocks(n.children, depth);
      if (k) parts.push(k.split('\n').map(l => (l ? `> ${l}` : '>')).join('\n'));
    } else if (t === 'ul' || t === 'ol') {
      let i = Number(n.attrs.start) || 1;
      const items = n.children.filter(c => c.tag === 'li').map(li => {
        const mark = t === 'ol' ? `${i++}. ` : '- ';
        const body = blocks(li.children, depth + 1) || '';
        const pad = ' '.repeat(mark.length);
        return mark + body.split('\n').map((l, j) => (j === 0 || !l ? l : pad + l)).join('\n');
      });
      if (items.length) parts.push(items.join('\n'));
    } else if (t === 'table') {
      const rows = [];
      const walk = x => { for (const c of x.children ?? []) { if (c.tag === 'tr') rows.push(c); else if (c.children) walk(c); } };
      walk(n);
      const cells = rows.map(r => r.children.filter(c => c.tag === 'td' || c.tag === 'th').map(c => inline(c.children).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()));
      const width = Math.max(0, ...cells.map(r => r.length));
      if (width) {
        const norm = cells.map(r => [...r, ...Array(width - r.length).fill('')]);
        const line = r => `| ${r.join(' | ')} |`;
        parts.push([line(norm[0]), line(Array(width).fill('---')), ...norm.slice(1).map(line)].join('\n'));
      }
    } else {
      // div, section, li 안의 블록 등은 안쪽만 이어서
      const k = blocks(n.children, depth);
      if (k) parts.push(k);
    }
  }
  flush();
  return parts.join('\n\n');
}

/** 붙여넣은 HTML을 마크다운으로 바꾼다. */
export function htmlToMarkdown(html) {
  const tree = parse(String(html ?? '').replace(/\r\n?/g, '\n'));
  return blocks(tree.children).replace(/\n{3,}/g, '\n\n').trim();
}
