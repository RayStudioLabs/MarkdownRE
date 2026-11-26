// The renderer and DOM index use the same visible-text offsets. Formatting and
// syntax highlighting can split one match across several DOM text nodes.
const omitted = new Set(['style', 'script', 'svg', 'mjx-container', 'template', 'noscript']);
const omittedSelector = [...omitted].join(',');
const blocks = 'p,li,h1,h2,h3,h4,h5,h6,pre,td,th,div,blockquote,section,dt,dd,figcaption';

export function collectSearchSpans(tree, source, originalOffset) {
  const spans = [];
  let visible = 0, cursor = 0;

  function record(start, length) {
    const previous = spans.at(-1);
    if (previous && previous.start + previous.length === start && previous.visible + previous.length === visible) {
      previous.length += length;
    } else {
      spans.push({start, visible, length});
    }
    visible += length;
    cursor = start + length;
  }
  function visit(node, lower, upper, inCode = false) {
    if (omitted.has(node.tagName) || node.properties?.hidden) return;
    if (node.position) {
      lower = originalOffset(node.position.start.offset);
      upper = originalOffset(node.position.end.offset);
    }
    if (node.type === 'text') {
      const value = node.value.replace(/\r\n?/g, '\n');
      // GFM inserts whitespace between list items and table cells. It counts
      // towards DOM offsets but must not consume text from the next source line.
      if (lower == null || (!node.position && !inCode && !value.trim())) {
        visible += value.length;
        return;
      }
      const start = Math.max(lower, cursor);
      const raw = source.slice(start, upper);
      const exact = raw.indexOf(value);
      if (exact >= 0) { record(start + exact, value.length); return; }
      // Escapes, entities, indentation and soft breaks can change a text run.
      const runStart = visible;
      let i = 0;
      for (const char of value) {
        const entity = raw[i] === '&' && /^&(?:#\w+|[a-z]\w*);/i.exec(raw.slice(i));
        if (entity && !value.startsWith(entity[0], visible - runStart)) {
          i += entity[0].length;
          visible += char.length;
          continue;
        }
        const next = raw.indexOf(char, i);
        if (next < 0) { visible += char.length; continue; }
        record(start + next, char.length);
        i = next + char.length;
      }
      return;
    }
    // Highlight.js tokens inherit the fence's position. Start at the body so
    // a language identifier identical to the first token cannot take its place.
    if (node.tagName === 'pre' && lower != null) {
      const prefix = /^[ \t]*(?:`{3,}|~{3,})[^\n]*\n/.exec(source.slice(lower, upper));
      if (prefix) cursor = Math.max(cursor, lower + prefix[0].length);
    }
    for (const child of node.children || []) visit(child, lower, upper, inCode || node.tagName === 'code');
  }
  visit(tree, undefined, undefined);
  return spans;
}

export function indexPreview(preview) {
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
  const nodes = [], groups = [];
  let length = 0;
  for (let node; (node = walker.nextNode());) {
    if (!node.length || node.parentElement.closest(omittedSelector + ',[hidden]')) continue;
    const block = node.parentElement.closest(blocks) || preview;
    let group = groups.at(-1);
    if (group?.block !== block) {
      group = {block, start:length, text:''};
      groups.push(group);
    }
    group.text += node.data;
    nodes.push({node, start:length});
    length += node.length;
  }
  function point(offset) {
    let lo = 0, hi = nodes.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (nodes[mid].start <= offset) lo = mid; else hi = mid;
    }
    return nodes[lo];
  }
  return {
    groups,
    range(start, end) {
      if (!nodes.length || start < 0 || end > length) return null;
      const a = point(start), b = point(Math.max(start, end - 1));
      const range = document.createRange();
      range.setStart(a.node, start - a.start);
      range.setEnd(b.node, end - b.start);
      return range;
    }
  };
}

// Return the rendered portion of a source match, skipping Markdown delimiters.
export function visibleOffsets(spans, start, end) {
  let lo = 0, hi = spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (spans[mid].start + spans[mid].length <= start) lo = mid + 1; else hi = mid;
  }
  let first, last;
  for (let i = lo; i < spans.length && spans[i].start < end; i++) {
    const span = spans[i];
    first ??= span.visible + Math.max(0, start - span.start);
    last = span.visible + Math.min(span.length, end - span.start);
  }
  return first == null ? null : [first, last];
}
