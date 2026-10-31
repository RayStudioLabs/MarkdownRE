import test from 'node:test';
import assert from 'node:assert/strict';
import {activeFormats, formatMarkdown} from '../web/src/formatting.js';

function apply(text, start, end, kind) {
  const result = formatMarkdown(text, start, end, kind);
  assert.ok(result, `expected ${kind} to edit`);
  return {...result, value: text.slice(0, result.from) + result.text + text.slice(result.to)};
}

test('heading levels replace one another and clicking the active heading removes it', () => {
  let edit = apply('# hello', 4, 4, 'h2');
  assert.equal(edit.value, '## hello'); assert.equal(edit.start, 5);
  assert.ok(activeFormats(edit.value, edit.start).has('h2'));
  edit = apply(edit.value, edit.start, edit.end, 'h2');
  assert.equal(edit.value, 'hello'); assert.equal(edit.start, 2);
});

test('quote coexists with a heading; list kinds replace each other without removing quote', () => {
  let edit = apply('> - item', 6, 6, 'task');
  assert.equal(edit.value, '> - [ ] item');
  assert.deepEqual([...activeFormats(edit.value, edit.start)].sort(), ['quote', 'task']);
  edit = apply(edit.value, edit.start, edit.end, 'ordered');
  assert.equal(edit.value, '> 1. item');
  edit = apply(edit.value, edit.start, edit.end, 'ordered');
  assert.equal(edit.value, '> item');
  edit = apply('> ## hello', 7, 7, 'quote');
  assert.equal(edit.value, '## hello');
});

test('multi-line list formatting replaces existing types and retains selected text', () => {
  const text = '- one\n2. two';
  const edit = apply(text, 2, text.length, 'task');
  assert.equal(edit.value, '- [ ] one\n- [ ] two');
  assert.equal(edit.value.slice(edit.start, edit.end), 'one\n- [ ] two');
});

test('nested bold and italic can be toggled independently', () => {
  const text = '**bold _both_**', cursor = text.indexOf('both') + 2;
  assert.deepEqual([...activeFormats(text, cursor)].sort(), ['bold', 'italic']);
  let edit = apply(text, cursor, cursor, 'bold');
  assert.equal(edit.value, 'bold _both_');
  assert.deepEqual([...activeFormats(edit.value, edit.start)], ['italic']);
  edit = apply(edit.value, edit.start, edit.end, 'italic');
  assert.equal(edit.value, 'bold both');
});

test('empty markers can be toggled and code converts to a formatting tag', () => {
  let edit = apply('', 0, 0, 'bold');
  assert.equal(edit.value, '****'); assert.ok(activeFormats(edit.value, edit.start).has('bold'));
  edit = apply(edit.value, edit.start, edit.end, 'bold'); assert.equal(edit.value, '');
  edit = apply('`hello`', 3, 3, 'italic'); assert.equal(edit.value, '*hello*');
});

test('links and images replace one another and clicking again removes the markup', () => {
  let edit = apply('[label](https://example.com)', 3, 3, 'image');
  assert.equal(edit.value, '![label](https://example.com)');
  assert.ok(activeFormats(edit.value, edit.start).has('image'));
  edit = apply(edit.value, edit.start, edit.end, 'link');
  assert.equal(edit.value, '[label](https://example.com)');
  edit = apply(edit.value, edit.start, edit.end, 'link');
  assert.equal(edit.value, 'label');
});

test('code and math blocks replace one another, preserve content and toggle off', () => {
  let edit = apply('```js\nhello\n```', 8, 8, 'mathblock');
  assert.equal(edit.value, '$$\nhello\n$$');
  assert.ok(activeFormats(edit.value, edit.start).has('mathblock'));
  edit = apply(edit.value, edit.start, edit.end, 'mathblock');
  assert.equal(edit.value, 'hello');
});

test('formatting in fenced blocks is not mistaken for markdown tags', () => {
  const text = '```\n# not a heading\n```', cursor = text.indexOf('heading');
  assert.deepEqual([...activeFormats(text, cursor)], ['codeblock']);
  assert.equal(formatMarkdown(text, cursor, cursor, 'h1'), null);
});

test('table and rule are active and can be removed', () => {
  let text = '| a | b |\n| --- | --- |\n| c | d |';
  assert.ok(activeFormats(text, 3).has('table'));
  assert.equal(apply(text, 3, 3, 'table').value, 'a\tb\nc\td');
  text = '---'; assert.ok(activeFormats(text, 1).has('rule'));
  assert.equal(apply(text, 1, 1, 'rule').value, '');
});

test('task markers and same-line headings replace one another because GFM cannot render both', () => {
  let edit = apply('- [ ] item', 8, 8, 'h2');
  assert.equal(edit.value, '## item');
  edit = apply('## item', 5, 5, 'task');
  assert.equal(edit.value, '- [ ] item');
});

test('inserting line markers at the start keeps the cursor with the text', () => {
  const edit = apply('hello', 0, 0, 'h1');
  assert.equal(edit.value, '# hello'); assert.equal(edit.start, 2);
  assert.equal(apply('\nnext', 0, 0, 'h1').value, '# \nnext');
});

test('empty bold is not also marked italic', () => {
  const active = activeFormats('****', 2);
  assert.ok(active.has('bold')); assert.ok(!active.has('italic'));
});

test('setext headings are recognized, replaced and removed', () => {
  const text = 'hello\n=====';
  assert.ok(activeFormats(text, 2).has('h1'));
  assert.equal(apply(text, 2, 2, 'h2').value, '## hello');
  assert.equal(apply(text, 2, 2, 'h1').value, 'hello');
});

test('fenced blocks inside quotes keep their quote prefixes', () => {
  const text = '> ```js\n> hello\n> ```';
  let edit = apply(text, text.indexOf('hello') + 2, text.indexOf('hello') + 2, 'mathblock');
  assert.equal(edit.value, '> $$\n> hello\n> $$');
  edit = apply(edit.value, edit.start, edit.end, 'mathblock');
  assert.equal(edit.value, '> hello');
});

const sampleTable = '| 表头 1 | 表头 2 |\n| --- | --- |\n| 内容 1 | 内容 2 |';
test('inserting a table replaces an empty line containing only block or inline markers', () => {
  for (const line of ['', '# ', '##', '- ', '- [ ] ', '1. ', '> ', '> - [x] ', '****', '``']) {
    const edit = apply(line, line.length, line.length, 'table');
    assert.equal(edit.value, sampleTable, JSON.stringify(line));
    assert.equal(edit.value.slice(edit.start, edit.end), '表头 1');
  }
});

test('table insertion splits headings and lists into matching formatted paragraphs', () => {
  for (const [line, offset, left, right] of [
    ['hello world', 5, 'hello', ' world'],
    ['## hello', 5, '## he', '## llo'],
    ['- hello', 4, '- he', '- llo'],
    ['1. hello', 5, '1. he', '1. llo'],
    ['- [x] hello', 8, '- [x] he', '- [x] llo'],
    ['> ## hello', 7, '> ## he', '> ## llo'],
  ]) {
    const edit = apply(line, offset, offset, 'table');
    assert.equal(edit.value, `${left}\n\n${sampleTable}\n\n${right}`);
    assert.equal(edit.value.slice(edit.start, edit.end), '表头 1');
  }
});

test('table goes before or after a paragraph when cursor is at a text edge', () => {
  for (const [text, start] of [['## hello', 3], ['## hello', 0], ['**hello**', 2]]) {
    assert.equal(apply(text, start, start, 'table').value, `${sampleTable}\n\n${text}`);
  }
  for (const [text, start] of [['## hello', 8], ['**hello**', 7]]) {
    assert.equal(apply(text, start, start, 'table').value, `${text}\n\n${sampleTable}`);
  }
});

test('splitting inline formatting preserves nested markup and links', () => {
  for (const [text, start, left, right] of [
    ['**hello**', 4, '**he**', '**llo**'],
    ['**hello world**', 8, '**hello** ', '**world**'],
    ['**a _bc_ d**', 6, '**a _b_**', '**_c_ d**'],
    ['[hello](https://example.com)', 3, '[he](https://example.com)', '[llo](https://example.com)'],
    ['`hello`', 3, '`he`', '`llo`'],
  ]) assert.equal(apply(text, start, start, 'table').value, `${left}\n\n${sampleTable}\n\n${right}`);
});

test('table insertion maintains blank lines next to neighboring paragraphs', () => {
  assert.equal(apply('before\n# \nafter', 9, 9, 'table').value, `before\n\n${sampleTable}\n\nafter`);
  assert.equal(apply('before\nhello\nafter', 7, 7, 'table').value, `before\n\n${sampleTable}\n\nhello\nafter`);
  assert.equal(apply('before\nhello\nafter', 12, 12, 'table').value, `before\nhello\n\n${sampleTable}\n\nafter`);
});

test('table insertion keeps selected text, splitting at the start of the selection', () => {
  const text = '## hello world';
  const edit = apply(text, 5, 10, 'table');
  assert.equal(edit.value, `## he\n\n${sampleTable}\n\n## llo world`);
});

test('inserting a table within a Setext heading preserves its heading level', () => {
  let edit = apply('hello\n=====', 2, 2, 'table');
  assert.equal(edit.value, `# he\n\n${sampleTable}\n\n# llo`);
  edit = apply('hello\n-----', 0, 0, 'table');
  assert.equal(edit.value, `${sampleTable}\n\n## hello`);
});

test('inserting a table never splits an image or link destination', () => {
  const link = '[hello](https://example.com)';
  const edit = apply(link, link.indexOf('example'), link.indexOf('example'), 'table');
  assert.ok(edit.value.includes(link));
  const image = '![alt](image.png)';
  assert.ok(apply(image, 5, 5, 'table').value.includes(image));
});

test('table insertion preserves inline formatting spanning source lines', () => {
  for (const [text, cursor] of [['**hello\nworld**', 10], ['**hello\nworld**', 8], ['**hello world\nend**', 6]]) {
    const edit = apply(text, cursor, cursor, 'table');
    assert.ok(edit.value.includes(sampleTable));
    const [left, right] = edit.value.split(sampleTable);
    assert.match(left.trimEnd(), /^\*\*.+\*\*$/s);
    assert.match(right.trimStart(), /^\*\*.+\*\*$/s);
    assert.equal((left + right).replaceAll('*', '').replaceAll('\n', ''), text.replaceAll('*', '').replaceAll('\n', ''));
  }
});

test('multiline inline formatting survives a table inserted in a quote or list', async () => {
  const {unified} = await import('unified');
  const {default: remarkParse} = await import('remark-parse');
  const {default: remarkGfm} = await import('remark-gfm');
  const parser = unified().use(remarkParse).use(remarkGfm);
  for (const [text, container] of [['> **hello\n> world**', 'blockquote'], ['- **hello\n  world**', 'list']]) {
    for (const cursor of [text.indexOf('world'), text.indexOf('world') + 2, text.indexOf('\n')]) {
      const edit = apply(text, cursor, cursor, 'table');
      const tree = parser.parse(edit.value);
      assert.deepEqual(tree.children.map(node => node.type), [container, 'table', container]);
      function countStrong(node) { return (node.type === 'strong' ? 1 : 0) + (node.children || []).reduce((n, child) => n + countStrong(child), 0); }
      assert.equal(countStrong(tree), 2);
    }
  }
});
