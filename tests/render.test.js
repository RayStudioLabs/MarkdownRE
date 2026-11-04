import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../web/src/render.js';
test('renders GFM, math and fenced code', async () => {
  const html = await renderMarkdown('# Hello\n\n|a|b|\n|-|-|\n|1|2|\n\n$x^2$\n\n```js\nconst n = 1\n```');
  assert.match(html, /<h1(?: [^>]*)?>Hello<\/h1>/); assert.match(html, /<table(?: [^>]*)?>/); assert.match(html, /<mjx-container/); assert.match(html, /hljs/);
});
test('strips unsafe html and links', async () => {
  const html = await renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))');
  assert.doesNotMatch(html, /<script|javascript:/i);
});
test('renders source line anchors for preview blocks', async () => {
  const html = await renderMarkdown('# Title\n\nFirst paragraph\n\n- Item\n\n```js\ncode\n```');
  assert.match(html, /<h1 data-source-line="1">/);
  assert.match(html, /<p data-source-line="3">/);
  assert.match(html, /<li data-source-line="5">/);
  assert.match(html, /<pre data-source-line="7">/);
});
test('renders the documented task list, aligned table, and block math syntax', async () => {
  const html = await renderMarkdown('- [x] 已完成\n- [ ] 待完成\n\n| 名称 | 数量 |\n| :--- | ---: |\n| 苹果 | 2 |\n\n$$\n\\frac{a}{b}\n$$');
  assert.match(html, /<input type="checkbox" checked disabled>/);
  assert.match(html, /<th align="right">数量<\/th>/);
  assert.match(html, /<mjx-container[^>]+display="true"/);
});
test('renders a fenced math example as a display formula', async () => {
  const html = await renderMarkdown('```math\n\\sum_{i=1}^{n} i\n```');
  assert.match(html, /<mjx-container[^>]+display="true"/);
});

test('quoted strings retain Markdown characters while formatting outside remains active', async () => {
  const markdown = '- 费用报销根目录："/Users/daichenyu/Library/Mobile Documents/com~apple~CloudDocs/武汉天工/费用报销"\n- `https://mail.10086.cn/`\n- Playwright（`mcp__playwright__browser_*`）';
  const html = await renderMarkdown(markdown);
  assert.match(html, /com~apple~CloudDocs/);
  assert.doesNotMatch(html, /<del>/);
  assert.match(html, /<code>https:\/\/mail\.10086\.cn\/<\/code>/);
  assert.match(html, /<code>mcp__playwright__browser_\*<\/code>/);
  const formatted = await renderMarkdown('"**bold** _italic_ ~~strike~~ $x^2$ [link](https://example.com)" and **outside**');
  assert.match(formatted, /\*\*bold\*\* _italic_ ~~strike~~ \$x\^2\$ \[link\]\(https:\/\/example\.com\)/);
  assert.match(formatted, /<strong>outside<\/strong>/);
  assert.doesNotMatch(formatted, /<del>|<mjx-container|<a href=/);
});

test('quoted text in headings, tables, and different quotation marks stays literal', async () => {
  const html = await renderMarkdown('# “a*b*”\n\n| Name | Value |\n| --- | --- |\n| "a|b" | \'_text_\' |');
  assert.match(html, /<h1[^>]*>“a\*b\*”<\/h1>/);
  assert.match(html, /<td>"a\|b"<\/td>/);
  assert.match(html, /<td>'_text_'<\/td>/);
});

test('quoted text handling leaves code, HTML attributes, escaped quotes and apostrophes intact', async () => {
  const html = await renderMarkdown('`const s = "*value*"`\n\n<a href="https://example.com" title="a*b">link</a>\n\nDon\'t parse **outside**, and "a \\\"quoted\\\" *string*".');
  assert.match(html, /<code>const s = "\*value\*"<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com" title="a\*b">link<\/a>/);
  assert.match(html, /Don't parse <strong>outside<\/strong>/);
  assert.match(html, /\*string\*/);
  assert.doesNotMatch(html, /<em>string<\/em>/);
});

test('quoted URLs and email addresses are literal; unquoted links and formatting still work', async () => {
  const html = await renderMarkdown('"https://example.com" "user@example.com" "www.example.com"\n\nhttps://example.com and ~strike~');
  assert.match(html, /"https:\/\/example.com" "user@example.com" "www.example.com"/);
  assert.match(html, /<a href="https:\/\/example.com">https:\/\/example.com<\/a>/);
  assert.match(html, /<del>strike<\/del>/);
});

test('literal strings do not alter Markdown links, code blocks, or unsafe HTML filtering', async () => {
  const html = await renderMarkdown('[link](https://example.com "title *here*")\n\n```js\nconst x = "**bold**";\n```\n\n"<script>alert(1)</script>"\n\n<script>alert(2)</script>');
  assert.match(html, /<a href="https:\/\/example.com" title="title \*here\*">link<\/a>/);
  assert.match(html, /hljs/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&#x3C;script>alert\(1\)&#x3C;\/script>/);
});
