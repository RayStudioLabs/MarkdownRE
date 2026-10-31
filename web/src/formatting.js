import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const inlineTypes = {bold: 'strong', italic: 'emphasis', strike: 'delete', code: 'inlineCode', link: 'link', image: 'image'};
const wrappers = {bold: '**', italic: '*', strike: '~~', code: '`'};
const blockTypes = {codeblock: 'code', mathblock: 'math', table: 'table', rule: 'thematicBreak'};
const lineKinds = ['h1', 'h2', 'h3', 'quote', 'bullet', 'ordered', 'task'];

function nodesAt(text, start, end) {
  const matches = [];
  function visit(node) {
    const a = node.position?.start.offset, b = node.position?.end.offset;
    if (a == null || b == null || start < a || end > b) return;
    if (start === end && (start === a || start === b) && b !== a) {
      // Block markers still count when the cursor is at the start or end of a line.
      if (!['root', 'paragraph', 'heading', 'blockquote', 'list', 'listItem', 'code', 'math', 'table', 'thematicBreak'].includes(node.type)) return;
    }
    matches.push(node);
    for (const child of node.children || []) visit(child);
  }
  visit(parser.parse(text));
  return matches;
}
function lineInfo(text, offset) {
  const start = offset === 0 ? 0 : text.lastIndexOf('\n', offset - 1) + 1;
  const end = text.indexOf('\n', offset);
  return {start, end: end < 0 ? text.length : end, text: text.slice(start, end < 0 ? text.length : end)};
}
function prefixes(line) {
  const quote = line.match(/^( {0,3}(?:>\s?)+)/)?.[0] || '';
  const rest = line.slice(quote.length);
  const list = rest.match(/^(\s{0,3}(?:[-+*]|\d{1,9}[.)])(?:\s+|$)(?:\[[ xX]\](?:\s+|$))?)/)?.[0] || '';
  const content = rest.slice(list.length);
  const heading = content.match(/^( {0,3}#{1,6}(?:\s+|$))/)?.[0] || '';
  let listKind = null;
  if (list) listKind = /\[[ xX]\]/.test(list) ? 'task' : /^\s*\d/.test(list) ? 'ordered' : 'bullet';
  const depth = heading.match(/#+/)?.[0].length;
  return {quote, list, heading, listKind, headingKind: depth <= 3 ? `h${depth}` : null};
}
function inLiteral(nodes) { return nodes.some(n => ['code', 'math'].includes(n.type)); }
function emptyInline(text, start, end, kind) {
  if (start !== end || !wrappers[kind]) return null;
  const marker = wrappers[kind];
  if (kind === 'italic' && (text[start - 2] === '*' || text[start + 1] === '*')) return null;
  if (text.slice(start - marker.length, start) === marker && text.slice(start, start + marker.length) === marker)
    return {start: start - marker.length, end: start + marker.length, marker};
  return null;
}
export function activeFormats(text, start, end = start) {
  const nodes = nodesAt(text, start, end);
  const active = new Set();
  for (const [kind, type] of Object.entries(inlineTypes)) {
    if (nodes.some(n => n.type === type) || (!inLiteral(nodes) && emptyInline(text, start, end, kind))) active.add(kind);
  }
  for (const [kind, type] of Object.entries(blockTypes)) if (nodes.some(n => n.type === type)) active.add(kind);
  if (!inLiteral(nodes)) {
    const heading = [...nodes].reverse().find(n => n.type === 'heading' && n.depth <= 3);
    if (heading) active.add(`h${heading.depth}`);
    const first = lineInfo(text, start), last = lineInfo(text, end > start && text[end - 1] === '\n' ? end - 1 : end);
    const lines = text.slice(first.start, last.end).split('\n');
    for (const kind of lineKinds) {
      if (lines.every(line => {
        const p = prefixes(line);
        return kind === 'quote' ? !!p.quote : kind.startsWith('h') ? p.listKind !== 'task' && p.headingKind === kind : p.listKind === kind;
      })) active.add(kind);
    }
  }
  return active;
}
function change(from, to, value, start, end = start) { return {from, to, text: value, start, end}; }
function removeNode(node, text, start, end, left, right) {
  const a = node.position.start.offset, b = node.position.end.offset;
  const value = text.slice(a + left, b - right);
  const map = offset => a + Math.max(0, Math.min(value.length, offset - a - left));
  return change(a, b, value, map(start), map(end));
}
function adjust(offset, a, b, replacementLength) {
  if (offset < a) return offset;
  if (offset >= b) return offset + replacementLength - (b - a);
  return a + replacementLength;
}

// Return the literal delimiters for inline syntax that can be split safely.
function inlineDelimiters(node, text) {
  const a = node.position.start.offset, b = node.position.end.offset;
  const raw = text.slice(a, b);
  if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'delete') {
    const length = node.type === 'emphasis' ? 1 : 2;
    return {open: raw.slice(0, length), close: raw.slice(-length)};
  }
  if (node.type === 'inlineCode' || node.type === 'inlineMath') {
    const delimiter = node.type === 'inlineCode' ? raw.match(/^`+/)?.[0] : raw.match(/^\$+/)?.[0];
    if (delimiter && raw.endsWith(delimiter)) return {open: delimiter, close: delimiter};
  }
  if (node.type === 'link' && raw.startsWith('[')) {
    const end = raw.lastIndexOf('](');
    if (end >= 0) return {open: '[', close: raw.slice(end)};
  }
  return null;
}

function insertTable(text, offset, nodes) {
  let line = lineInfo(text, offset);
  // Include any lines spanned by inline formatting so both sides get complete delimiters.
  const spanning = nodes.filter(node => inlineDelimiters(node, text) &&
    (node.position.start.offset < line.start || node.position.end.offset > line.end));
  if (spanning.length) {
    const first = Math.min(line.start, ...spanning.map(node => lineInfo(text, node.position.start.offset).start));
    const last = Math.max(line.end, ...spanning.map(node => lineInfo(text, node.position.end.offset - 1).end));
    line = {start: first, end: last, text: text.slice(first, last)};
  }
  const p = prefixes(line.text.split('\n')[0]);
  const prefix = p.quote + p.list + p.heading;
  const contentStart = line.start + prefix.length;
  let caret = Math.max(contentStart, Math.min(offset, line.end));

  // A cursor inside a marker, link destination or image cannot split it safely.
  for (const node of [...nodes].reverse()) {
    if (!['strong', 'emphasis', 'delete', 'inlineCode', 'inlineMath', 'link', 'image'].includes(node.type)) continue;
    const a = node.position.start.offset, b = node.position.end.offset;
    const delimiter = inlineDelimiters(node, text);
    if (!delimiter) {
      if (caret > a && caret < b) caret = caret - a <= b - caret ? a : b;
    } else if (caret > a && caret < a + delimiter.open.length) caret = a;
    else if (caret > b - delimiter.close.length && caret < b) caret = b;
  }
  caret = Math.max(contentStart, Math.min(caret, line.end));

  const inline = nodesAt(text, caret, caret)
    .map(node => ({node, delimiter: inlineDelimiters(node, text)}))
    .filter(({node, delimiter}) => delimiter && node.position.start.offset >= contentStart && node.position.end.offset <= line.end &&
      caret >= node.position.start.offset + delimiter.open.length && caret <= node.position.end.offset - delimiter.close.length);
  const opens = inline.map(item => item.delimiter.open).join('');
  const closes = inline.map(item => item.delimiter.close).reverse().join('');
  let left = text.slice(contentStart, caret), right = text.slice(caret, line.end);
  const hasLeft = !!(opens && left.endsWith(opens) ? left.slice(0, -opens.length) : left).trim();
  const hasRight = !!(closes && right.startsWith(closes) ? right.slice(closes.length) : right).trim();
  const onlyEmptyMarkers = /^(?:\*{2,}|_{2,}|~{4,}|`{2,})$/.test((left + right).trim());

  let before = '', after = '';
  if (!onlyEmptyMarkers && hasLeft && hasRight) {
    // Keep spaces outside emphasis delimiters so both fragments remain valid Markdown.
    left = left.replace(/(?:\n(?:[ \t]*>[ \t]?)+[ \t]*|\s*)$/, whitespace => closes + whitespace);
    right = right.replace(/^(?:[ \t]*\n(?:[ \t]*>[ \t]?)+[ \t]*|\s*)/, whitespace => whitespace + opens);
    before = prefix + left;
    after = prefix + right;
  } else if (!onlyEmptyMarkers && (hasLeft || hasRight)) {
    if (hasLeft) before = line.text;
    else after = line.text;
  }
  const table = '| 表头 1 | 表头 2 |\n| --- | --- |\n| 内容 1 | 内容 2 |';
  const previous = line.start > 0 ? text.slice(0, line.start - 1).split('\n').at(-1) : '';
  const next = line.end < text.length ? text.slice(line.end + 1).split('\n')[0] : '';
  const leading = !before && previous.trim() ? '\n' : '';
  const trailing = !after && next.trim() ? '\n' : '';
  const beforeTable = before ? `${before}\n\n` : '';
  const replacement = leading + beforeTable + table + (after ? `\n\n${after}` : '') + trailing;
  const cursor = line.start + leading.length + beforeTable.length + 2;
  return change(line.start, line.end, replacement, cursor, cursor + 4);
}
export function formatMarkdown(text, start, end, kind) {
  const nodes = nodesAt(text, start, end);
  const active = activeFormats(text, start, end);
  const currentBlock = [...nodes].reverse().find(n => n.type === 'code' || n.type === 'math');

  if (lineKinds.includes(kind)) {
    if (currentBlock) return null;
    const heading = [...nodes].reverse().find(n => n.type === 'heading');
    if (kind.startsWith('h') && heading) {
      const a = heading.position.start.offset, b = heading.position.end.offset;
      const raw = text.slice(a, b);
      const setext = raw.match(/^([^\n]+)\n[ \t]{0,3}(?:=+|-+)[ \t]*$/);
      if (setext) {
        const prefix = active.has(kind) ? '' : `${'#'.repeat(Number(kind[1]))} `;
        const value = prefix + setext[1];
        const map = offset => a + prefix.length + Math.max(0, Math.min(setext[1].length, offset - a));
        return change(a, b, value, map(start), map(end));
      }
    }
    const first = lineInfo(text, start), last = lineInfo(text, end > start && text[end - 1] === '\n' ? end - 1 : end);
    const lines = text.slice(first.start, last.end).split('\n');
    const remove = active.has(kind);
    let oldAt = first.start, newStart = start, newEnd = end, delta = 0;
    const changed = lines.map((line, index) => {
      const p = prefixes(line);
      let at, old, replacement;
      if (kind === 'quote') { at = 0; old = p.quote; replacement = remove ? old.replace(/>\s?$/, '') : `${old}> `; }
      else if (kind.startsWith('h')) {
        // A task marker and an ATX heading on the same line do not form a heading in GFM.
        at = p.quote.length + (p.listKind === 'task' && !remove ? 0 : p.list.length);
        old = (p.listKind === 'task' && !remove ? p.list : '') + p.heading;
        replacement = remove ? '' : `${'#'.repeat(Number(kind[1]))} `;
      } else {
        at = p.quote.length;
        old = p.list + (kind === 'task' && !remove ? p.heading : '');
        replacement = remove ? '' : kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${index + 1}. `;
      }
      const a = oldAt + at + delta, b = a + old.length;
      newStart = adjust(newStart, a, b, replacement.length);
      newEnd = adjust(newEnd, a, b, replacement.length);
      delta += replacement.length - old.length;
      oldAt += line.length + 1;
      return line.slice(0, at) + replacement + line.slice(at + old.length);
    }).join('\n');
    return change(first.start, last.end, changed, newStart, newEnd);
  }
  if (kind in inlineTypes) {
    if (currentBlock) return null;
    const node = [...nodes].reverse().find(n => n.type === inlineTypes[kind]);
    if (node) {
      const a = node.position.start.offset, b = node.position.end.offset;
      const raw = text.slice(a, b);
      if (kind === 'link' || kind === 'image') {
        const labelStart = kind === 'image' ? 2 : 1;
        const labelEnd = raw.lastIndexOf('](');
        if (labelEnd < 0) return null;
        return removeNode(node, text, start, end, labelStart, raw.length - labelEnd);
      }
      const marker = kind === 'code' ? raw.match(/^`+/)?.[0].length : kind === 'bold' || kind === 'strike' ? 2 : 1;
      return removeNode(node, text, start, end, marker, marker);
    }
    const empty = emptyInline(text, start, end, kind);
    if (empty) return change(empty.start, empty.end, '', empty.start);
    const opposite = kind === 'link' ? 'image' : kind === 'image' ? 'link' : null;
    const other = opposite && [...nodes].reverse().find(n => n.type === inlineTypes[opposite]);
    if (other) {
      const at = other.position.start.offset;
      return kind === 'image' ? change(at, at, '!', start + 1, end + 1) : change(at, at + 1, '', Math.max(at, start - 1), Math.max(at, end - 1));
    }
    const code = [...nodes].reverse().find(n => n.type === 'inlineCode');
    if (code && kind !== 'code') {
      const a = code.position.start.offset, b = code.position.end.offset, raw = text.slice(a, b);
      const n = raw.match(/^`+/)[0].length, content = raw.slice(n, -n);
      if (wrappers[kind]) return change(a, b, wrappers[kind] + content + wrappers[kind], a + wrappers[kind].length, a + wrappers[kind].length + content.length);
      // Links and images replace the code span below using its plain content.
      start = a; end = b;
      const label = content || (kind === 'image' ? '图片说明' : '链接文字');
      const before = kind === 'image' ? '![' : '[';
      const url = kind === 'image' ? '图片地址' : 'https://';
      const result = `${before}${label}](${url})`;
      return change(a, b, result, a + before.length + label.length + 2, a + before.length + label.length + 2 + url.length);
    }
    if (wrappers[kind]) {
      const marker = wrappers[kind], content = text.slice(start, end);
      return change(start, end, marker + content + marker, start + marker.length, end + marker.length);
    }
    const before = kind === 'image' ? '![' : '[';
    const label = text.slice(start, end) || (kind === 'image' ? '图片说明' : '链接文字');
    const url = kind === 'image' ? '图片地址' : 'https://';
    const result = `${before}${label}](${url})`;
    const cursor = start + before.length + (start === end ? 0 : label.length + 2);
    return change(start, end, result, cursor, cursor + (start === end ? label.length : url.length));
  }
  if (kind === 'codeblock' || kind === 'mathblock') {
    if (currentBlock) {
      const a = currentBlock.position.start.offset, b = currentBlock.position.end.offset;
      const raw = text.slice(a, b), newline = raw.indexOf('\n'), closing = raw.lastIndexOf('\n');
      if (newline < 0 || closing <= newline) return null;
      const closingLine = raw.slice(closing + 1);
      const closingPrefix = closingLine.match(/^[\t >]*/)?.[0] || '';
      const rawContent = raw.slice(newline + 1, closing);
      const firstPrefix = closingPrefix && rawContent.startsWith(closingPrefix) ? closingPrefix.length : 0;
      const content = rawContent.slice(firstPrefix);
      const marker = kind === 'codeblock' ? '```' : '$$';
      const togglingOff = currentBlock.type === blockTypes[kind];
      const value = togglingOff ? content : `${marker}\n${closingPrefix}${content}\n${closingPrefix}${marker}`;
      const oldContentStart = a + newline + 1 + firstPrefix;
      const newContentStart = a + (togglingOff ? 0 : marker.length + 1 + closingPrefix.length);
      const map = offset => newContentStart + Math.max(0, Math.min(content.length, offset - oldContentStart));
      return change(a, b, value, map(start), map(end));
    }
    const first = lineInfo(text, start), last = lineInfo(text, end > start && text[end - 1] === '\n' ? end - 1 : end);
    const content = text.slice(first.start, last.end), fence = kind === 'codeblock' ? '```' : '$$';
    const leading = first.start > 0 && text.slice(0, first.start - 1).split('\n').at(-1).trim() ? '\n' : '';
    const opening = `${leading}${fence}\n`;
    return change(first.start, last.end, `${opening}${content}\n${fence}`, first.start + opening.length + (start - first.start), first.start + opening.length + (end - first.start));
  }
  const node = [...nodes].reverse().find(n => n.type === blockTypes[kind]);
  if (node && kind === 'rule') return change(node.position.start.offset, node.position.end.offset, '', node.position.start.offset);
  if (node && kind === 'table') {
    const a = node.position.start.offset, b = node.position.end.offset;
    const lines = text.slice(a, b).split('\n');
    const value = lines.filter((_, i) => i !== 1).map(line => line.replace(/^\s*\|\s?/, '').replace(/\s?\|\s*$/, '').replace(/\s*\|\s*/g, '\t')).join('\n');
    return change(a, b, value, a + Math.min(value.length, start - a), a + Math.min(value.length, end - a));
  }
  if (currentBlock) return null;
  if (kind === 'table') {
    // Convert a one-line Setext heading to ATX so both halves retain its level.
    const heading = [...nodes].reverse().find(n => n.type === 'heading');
    if (heading) {
      const a = heading.position.start.offset, b = heading.position.end.offset;
      const raw = text.slice(a, b);
      const setext = raw.match(/^([^\n]+)\n[ \t]{0,3}(?:=+|-+)[ \t]*$/);
      if (setext && lineInfo(text, a).start === a) {
        const prefix = `${'#'.repeat(heading.depth)} `;
        const virtual = text.slice(0, a) + prefix + setext[1] + text.slice(b);
        const caret = a + prefix.length + Math.min(setext[1].length, Math.max(0, start - a));
        const edit = insertTable(virtual, caret, nodesAt(virtual, caret, caret));
        return change(a, b, edit.text, edit.start, edit.end);
      }
    }
    return insertTable(text, start, nodes);
  }
  if (kind === 'rule') {
    const line = lineInfo(text, start);
    const leading = line.start > 0 && text.slice(0, line.start - 1).split('\n').at(-1).trim() ? '\n' : '';
    const value = '---\n\n';
    const cursor = line.start + leading.length + value.length;
    return change(line.start, line.start, leading + value, cursor);
  }
  return null;
}
