import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize';
import rehypeMathjax from 'rehype-mathjax/svg';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import {protectQuotedStrings} from './quoted-strings.js';
import {collectSearchSpans} from './find-preview.js';
const schema = {...defaultSchema, attributes:{...defaultSchema.attributes, code:[['className', /^language-./, 'math-inline', 'math-display']]}};
// Add internal line markers only after sanitizing untrusted Markdown HTML.
function sourceLines() {
  const blocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'li', 'table', 'tr', 'hr', 'div']);
  function visit(node) {
    if (node.type === 'element') {
      delete node.properties.dataSourceLine;
      delete node.properties['data-source-line'];
      if (blocks.has(node.tagName) && node.position?.start?.line) {
        node.properties.dataSourceLine = node.position.start.line;
      }
    }
    for (const child of node.children || []) visit(child);
  }
  return tree => visit(tree);
}
// CommonMark scanning retains source offsets that GFM's autolinks can discard.
const scanParser = unified().use(remarkParse).use(remarkMath);
function removeStringSentinels() {
  return (tree, file) => {
    const marker = file.data.stringSentinel;
    if (!marker) return;
    function visit(node) {
      if (node.type === 'text') node.value = node.value.replaceAll(marker, '');
      for (const child of node.children || []) visit(child);
    }
    visit(tree);
  };
}
// Quoted prose temporarily gains escapes while parsing. Translate AST offsets
// back to the original document before pairing them with editor positions.
function originalOffsets(input, marker) {
  if (!marker || !input.includes(marker)) return offset => offset;
  const offsets = new Uint32Array(input.length + 1);
  let original = 0;
  for (let i = 0; i < input.length;) {
    if (input.startsWith(marker, i)) {
      const end = i + marker.length * 2 + 2;
      offsets.fill(original, i, end);
      i = end;
    } else {
      offsets[i++] = original;
    }
    original++;
  }
  offsets[input.length] = original;
  return offset => offsets[offset];
}
function searchPositions() {
  return (tree, file) => {
    if (file.data.onSpans) {
      const offset = originalOffsets(file.value, file.data.stringSentinel);
      file.data.onSpans(collectSearchSpans(tree, file.data.original, offset));
    }
  };
}
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(removeStringSentinels).use(remarkRehype,{allowDangerousHtml:true}).use(rehypeRaw).use(rehypeSanitize,schema).use(sourceLines).use(rehypeMathjax).use(rehypeHighlight).use(searchPositions).use(rehypeStringify);
export async function renderMarkdown(text, onSpans) {
  let input = text, sentinel;
  if (/["'“‘]/u.test(text)) {
    sentinel = '\uE000';
    while (text.includes(sentinel)) sentinel += '\uE000';
    input = protectQuotedStrings(text, scanParser.parse(text), sentinel);
  }
  return String(await parser.process({value:input, data:{original:text, stringSentinel:sentinel, onSpans}}));
}
