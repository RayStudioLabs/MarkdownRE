const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {_electron: electron} = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdownre-find-'));
  const file = path.join(dir, 'search.md');
  const filler = Array.from({length:80}, (_, i) => `Paragraph ${i}\n`).join('\n');
  await fs.writeFile(file, `# First hit\n\n"**quoted**" [link](hit) then **hit**\n\n${filler}\nLast HIT and h**it**\n`);
  const app = await electron.launch({
    executablePath:process.env.ELECTRON_TEST_BINARY || require('electron'),
    args:[...(process.env.ELECTRON_TEST_PACKAGED ? [] : [root]), `--user-data-dir=${path.join(dir, 'profile')}`, file,
      ...(process.env.ELECTRON_TEST_CONTAINER ? ['--no-sandbox','--disable-gpu'] : [])]
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const query = page.locator('#find-query');
    const button = id => page.locator('#' + id);
    const mode = name => page.locator(`button[data-layout="${name}"]`).click();
    const checkCount = value => page.waitForFunction(value => document.getElementById('find-count').textContent === value, value);
    function checkVisibleHit(expected, parent, sourceVisible = false) {
      return page.waitForFunction(({expected, parent, sourceVisible}) => {
        const range = CSS.highlights.get('markdownre-find')?.values().next().value;
        if (!range || range.toString() !== expected || !range.startContainer.parentElement.closest(parent)) return false;
        const rect = range.getBoundingClientRect(), viewport = document.getElementById('preview').getBoundingClientRect();
        return rect.top >= viewport.top && rect.bottom <= viewport.bottom &&
          (!sourceVisible || !!document.querySelector('.monaco-editor .view-overlays .find-current'));
      }, {expected, parent, sourceVisible});
    }
    await page.waitForSelector('#preview h1');
    await button('open-find').click();
    assert(await button('toggle-replace').isHidden());
    await query.fill('hit');
    await checkCount('1 / 4');
    await query.press('Shift+Enter');
    await checkCount('4 / 4');
    await checkVisibleHit('hit', 'p'); // across an emphasis boundary
    await button('find-close').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    assert(await query.isVisible());

    for (const layout of ['horizontal', 'vertical']) {
      await mode(layout);
      await page.waitForSelector('.monaco-editor');
      await query.fill('First');
      await query.fill('hit');
      await checkCount('1 / 4');
      await button('find-next').click(); // link destination exists only in the source
      await checkCount('2 / 4');
      assert(await page.evaluate(() => !CSS.highlights.has('markdownre-find')));
      await button('find-next').click();
      await checkVisibleHit('hit', 'strong', true);
      await query.press('Enter');
      await checkCount('4 / 4');
      await checkVisibleHit('HIT', 'p', true);
      await button('find-prev').click();
      await checkVisibleHit('hit', 'strong', true);
    }

    await button('find-case').click();
    await checkCount('1 / 3');
    await button('toggle-replace').click();
    await button('replace-value').fill('found');
    await button('replace-one').click();
    await checkCount('1 / 2');
    await page.waitForFunction(() => document.querySelector('#preview h1').textContent === 'First found');
    await button('undo').click();
    await page.waitForFunction(() => document.querySelector('#find-count').textContent.endsWith(' / 3') && document.querySelector('#preview h1').textContent === 'First hit');
    await button('find-regex').click();
    await query.fill('[');
    assert.equal(await query.getAttribute('aria-invalid'), 'true');
    assert(await button('replace-all').isDisabled());
    await query.fill('(hi)t');
    await button('replace-value').fill('$1!');
    await button('replace-all').click();
    await checkCount('0 / 0');
    await page.waitForFunction(() => document.querySelector('#preview h1').textContent === 'First hi!');
    await button('undo').click();
    await page.waitForFunction(() => document.querySelector('#find-count').textContent.endsWith(' / 3') && document.querySelector('#preview h1').textContent === 'First hit');
    await mode('preview');
    assert(await button('toggle-replace').isHidden());
    assert(await button('replace-row').isHidden());
    await mode('editor');
    await query.press('Escape');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    await query.waitFor();
    assert(await button('replace-row').isHidden());
    assert.deepEqual(errors, []);
    console.log('PASS desktop find, linked navigation, replace, undo and layout changes');
  } finally {
    await app.evaluate(({dialog}) => { dialog.showMessageBox = async () => ({response:2}); }).catch(() => {});
    await app.close();
    await fs.rm(dir, {recursive:true, force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
