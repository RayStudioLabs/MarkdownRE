const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {_electron} = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdownre-table-layout-'));
  const file = path.join(dir, 'layout.md');
  const description = '新增软件产品语义化版本号和每次修改的递增约定。'.repeat(35);
  const longToken = 'abcdefghijklmnopqrstuvwxyz'.repeat(30);
  await fs.writeFile(file, `# Revision history\n\n| 版本 | 日期 | 维护人 | 变更要点 |\n|---|---|---|---|\n| **V20261105** | 2026-11-05 | Daichenyu + Codex | ${description} |\n\n| 名称 | 链接 | 备注 |\n|---|---|---|\n| first | \`${longToken}\` | rightmost |\n`);
  const app = await _electron.launch({executablePath:process.env.ELECTRON_TEST_BINARY || require('electron'),args:[...(process.env.ELECTRON_TEST_PACKAGED?[]:[root]),`--user-data-dir=${path.join(dir,'profile')}`,file,...(process.env.ELECTRON_TEST_CONTAINER?['--no-sandbox','--disable-gpu']:[])]});
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#preview table');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1200,850));
    await page.locator('[data-layout="horizontal"]').click();
    await page.evaluate(()=>document.querySelector('#workspace').style.setProperty('--ratio','28%'));
    const measured = await page.evaluate(() => {
      const tables=[...document.querySelectorAll('#preview table')];
      const cells=[...tables[0].rows[1].cells];
      const lines = cell => {const range=document.createRange();range.selectNodeContents(cell);return [...new Set([...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>Math.round(r.top)))].length;};
      return {widths:cells.map(cell=>cell.getBoundingClientRect().width),lines:cells.slice(0,3).map(lines),font:parseFloat(getComputedStyle(cells[0]).fontSize),longTable:tables[1].getBoundingClientRect().width,available:document.querySelector('#preview').clientWidth-64,longCell:tables[1].rows[1].cells[1].getBoundingClientRect().width};
    });
    for (const width of measured.widths.slice(0,3)) assert(width >= measured.font*4, `metadata column is too narrow: ${JSON.stringify(measured)}`);
    assert(measured.lines[0] <= 2 && measured.lines[1] <= 2 && measured.lines[2] <= 2, `metadata characters wrap individually: ${JSON.stringify(measured)}`);
    assert(measured.longTable <= measured.available + 2 && measured.longCell <= 500, `long token overflowed the preview: ${JSON.stringify(measured)}`);
    await page.evaluate(()=>document.querySelector('#workspace').style.setProperty('--ratio','85%'));
    const narrow=await page.evaluate(()=>{const preview=document.querySelector('#preview'), table=preview.querySelector('table');preview.scrollLeft=preview.scrollWidth;return {previewWidth:preview.clientWidth,scrollWidth:preview.scrollWidth,scrollLeft:preview.scrollLeft,tableRight:table.getBoundingClientRect().right,previewRight:preview.getBoundingClientRect().right};});
    if (narrow.scrollWidth > narrow.previewWidth + 1) assert(narrow.scrollLeft > 0 && narrow.tableRight <= narrow.previewRight + 2, `wide table cannot be scrolled into view: ${JSON.stringify(narrow)}`);
    console.log('PASS: table column widths, long tokens and narrow-window scrolling');
  } finally {await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1});
