import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localImageURL} from '../web/src/image-path.js';
import {renderMarkdown} from '../web/src/render.js';

test('local image paths use exactly one layer of URL encoding', async () => {
  const markdown = '![img](图片和附件/image%205.png)';
  const html = await renderMarkdown(markdown);
  const src = html.match(/src="([^"]+)"/)[1];
  assert.equal(localImageURL('http://localhost/doc/id/', src), 'http://localhost/doc/id/%E5%9B%BE%E7%89%87%E5%92%8C%E9%99%84%E4%BB%B6/image%205.png');
  assert.equal(localImageURL('base/', '图片和附件/image 5.png'), 'base/%E5%9B%BE%E7%89%87%E5%92%8C%E9%99%84%E4%BB%B6/image%205.png');
  assert.equal(localImageURL('base/', 'images/100%25.png'), 'base/images/100%25.png');
  assert.equal(localImageURL('base/', 'images/a%2520b.png'), 'base/images/a%2520b.png');
  assert.equal(localImageURL('base/', 'images/bad%name.png'), 'base/images/bad%25name.png');
});

test('remote and embedded images remain unchanged', () => {
  for (const src of ['https://example.com/a%20b.png', 'http://example.com/a.png', '//example.com/a.png', 'data:image/png;base64,AAAA', 'blob:abc']) {
    assert.equal(localImageURL('base/', src), src);
  }
});
