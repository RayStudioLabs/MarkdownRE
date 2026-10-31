import test from 'node:test';
import assert from 'node:assert/strict';
import {mapScrollPosition} from '../web/src/scroll-sync.js';
test('aligns document ends and interpolates between source blocks', () => {
  const anchors = [{source:100, preview:200}, {source:300, preview:500}];
  assert.equal(mapScrollPosition(0, 400, 900, anchors), 0);
  assert.equal(mapScrollPosition(200, 400, 900, anchors), 350);
  assert.equal(mapScrollPosition(400, 400, 900, anchors), 900);
});
test('handles missing, repeated and out-of-range anchors safely', () => {
  assert.equal(mapScrollPosition(50, 100, 200, []), 100);
  assert.equal(mapScrollPosition(50, 100, 200, [{source:0,preview:20},{source:50,preview:80},{source:50,preview:90}]), 80);
  assert.equal(mapScrollPosition(10, 0, 100, []), 0);
});
