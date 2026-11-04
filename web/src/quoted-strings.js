// Protect quoted strings found in Markdown prose. Positions come from the
// original mdast, so quotes inside code, math and HTML attributes are ignored.
const containers = new Set(['paragraph', 'heading', 'tableRow']);
const quotes = new Map([['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']]);
const word = char => !!char && /[\p{L}\p{N}]/u.test(char);
function escaped(source, offset) {
  let slashes = 0;
  while (offset > 0 && source[--offset] === '\\') slashes++;
  return slashes % 2 === 1;
}
function punctuation(char) {
  const code = char.charCodeAt(0);
  return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) || (code >= 123 && code <= 126);
}

export function protectQuotedStrings(source, tree, sentinel) {
  const spans = [];
  function scan(container) {
    const positions = [];
    function collect(node) {
      if (node.type === 'text' && node.position?.start.offset != null && node.position?.end.offset != null) {
        for (let i = node.position.start.offset; i < node.position.end.offset; i++) {
          const char = source[i];
          if ((quotes.has(char) || char === '”' || char === '’') && !escaped(source, i)) {
            // Apostrophes in words (don't, it's) are not quotation marks.
            if ((char === "'" || char === '’') && word(source[i - 1]) && word(source[i + 1])) continue;
            positions.push(i);
          }
        }
      } else if (node.type !== 'html' && node.type !== 'inlineCode' && node.type !== 'inlineMath') {
        for (const child of node.children || []) collect(child);
      }
    }
    collect(container);
    let opening = null;
    for (const offset of positions) {
      const char = source[offset];
      if (opening && source.slice(opening.offset, offset).includes('\n')) opening = null;
      if (opening === null) {
        if (quotes.has(char)) opening = {offset, end: quotes.get(char)};
      } else if (char === opening.end) {
        // Treat a pair as a string only when it is contained on one line;
        // Markdown block boundaries and soft line breaks keep their meaning.
        if (!source.slice(opening.offset, offset).includes('\n')) spans.push([opening.offset + 1, offset]);
        opening = null;
      }
    }
  }
  function visit(node) {
    if (containers.has(node.type)) { scan(node); return; }
    for (const child of node.children || []) visit(child);
  }
  visit(tree);
  if (!spans.length) return source;
  let result = '', last = 0;
  for (const [start, end] of spans) {
    result += source.slice(last, start);
    for (const char of source.slice(start, end)) result += punctuation(char) ? `${sentinel}\\${char}${sentinel}` : char;
    last = end;
  }
  return result + source.slice(last);
}
