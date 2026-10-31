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
