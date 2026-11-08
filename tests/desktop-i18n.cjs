const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const dictionaries = require('../web/public/locales.json');
(async () => {
  const root = path.resolve(__dirname, '..');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdownre-i18n-'));
  const args = [...(process.env.ELECTRON_TEST_PACKAGED ? [] : [root]), `--user-data-dir=${path.join(dir,'profile')}`, ...(process.env.ELECTRON_TEST_CONTAINER ? ['--no-sandbox','--disable-gpu'] : [])];
  const launch = () => _electron.launch({ executablePath:process.env.ELECTRON_TEST_BINARY || require('electron'), args });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.waitForSelector('#toolbar');
    const secondWindow = app.waitForEvent('window');
    await app.evaluate(({Menu}) => Menu.getApplicationMenu().getMenuItemById('newDocument').click());
    const second = await secondWindow;
    await second.waitForSelector('#toolbar');
    const helpWindow = app.waitForEvent('window');
    await app.evaluate(({Menu}) => Menu.getApplicationMenu().getMenuItemById('syntax').click());
    const help = await helpWindow;
    await help.waitForFunction(() => typeof window.setHelpLanguage === 'function');
    const aboutWindow = app.waitForEvent('window');
    await app.evaluate(({Menu}) => Menu.getApplicationMenu().getMenuItemById('about').click());
    const about = await aboutWindow;
    await about.waitForFunction(() => typeof window.setAboutLanguage === 'function' && document.querySelector('.developer-logo')?.naturalWidth > 0);
    assert.equal(await about.locator('#version').textContent(), `Version ${require('../package.json').version}`);
    assert.equal(await about.locator('.copyright').textContent(), '© 2026 RayStudioLabs');
    if (process.env.MARKDOWNRE_ABOUT_SCREENSHOT) await about.screenshot({path:process.env.MARKDOWNRE_ABOUT_SCREENSHOT});
    for (const [locale, dict] of Object.entries(dictionaries)) {
      await app.evaluate(({Menu}, id) => Menu.getApplicationMenu().getMenuItemById(`language-${id}`).click(), locale);
      await page.waitForFunction(expected => document.documentElement.lang === expected, locale);
      await help.waitForFunction(expected => document.documentElement.lang === expected, locale);
      await second.waitForFunction(expected => document.documentElement.lang === expected, locale);
      await about.waitForFunction(expected => document.documentElement.lang === expected, locale);
      assert.equal(await page.locator('#open-file').getAttribute('aria-label'), dict.openFile, locale);
      assert.equal(await page.locator('#outline-toggle').getAttribute('aria-label'), dict.outline, locale);
      assert.equal(await help.locator('h1').textContent(), dict.syntax, locale);
      assert.equal(await about.locator('#detail').textContent(), dict.aboutDetail, locale);
      assert.equal(await second.locator('#open-file').getAttribute('aria-label'), dict.openFile, locale);
      assert.equal(await app.evaluate(({Menu}) => Menu.getApplicationMenu().getMenuItemById('file').label), dict.file, locale);
      if (process.platform === 'win32') assert.equal(await app.evaluate(({Menu}) => Menu.getApplicationMenu().getMenuItemById('defaultApp').label), dict.defaultApp, locale);
    }
    if (process.platform === 'win32') {
      await app.evaluate(({dialog,shell,Menu}) => {
        globalThis.__defaultSettingsURLs=[];
        dialog.showMessageBox=async()=>({response:1});
        shell.openExternal=async url=>{globalThis.__defaultSettingsURLs.push(url);};
        Menu.getApplicationMenu().getMenuItemById('defaultApp').click();
      });
      await page.waitForTimeout(100);
      assert.deepEqual(await app.evaluate(()=>globalThis.__defaultSettingsURLs),['ms-settings:defaultapps']);
    }
    await app.evaluate(({Menu}) => Menu.getApplicationMenu().getMenuItemById('language-ja').click());
    await page.waitForFunction(() => document.documentElement.lang === 'ja');
    await new Promise(resolve => setTimeout(resolve, 300));
    await app.close();
    app = await launch(); page = await app.firstWindow();
    await page.waitForFunction(() => document.documentElement.lang === 'ja');
    assert.equal(await page.locator('#open-file').getAttribute('aria-label'), dictionaries.ja.openFile);
    assert.equal(await app.evaluate(({Menu}) => Menu.getApplicationMenu().getMenuItemById('file').label), dictionaries.ja.file);
    console.log('PASS: language menus, toolbar and help update for 10 languages and persist across restart');
  } finally { await app.close(); await fs.rm(dir, {recursive:true, force:true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
