import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
test('macOS and desktop packages share a semantic version', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const plist = read('macos/Info.plist');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1], pkg.version);
});
