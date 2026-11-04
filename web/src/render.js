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
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(removeStringSentinels).use(remarkRehype,{allowDangerousHtml:true}).use(rehypeRaw).use(rehypeSanitize,schema).use(sourceLines).use(rehypeMathjax).use(rehypeHighlight).use(rehypeStringify);
export async function renderMarkdown(text) {
  if (!/["'“‘]/u.test(text)) return String(await parser.process(text));
  let sentinel = '\uE000';
  while (text.includes(sentinel)) sentinel += '\uE000';
  const input = protectQuotedStrings(text, scanParser.parse(text), sentinel);
  return String(await parser.process({value: input, data: {stringSentinel: sentinel}}));
}
