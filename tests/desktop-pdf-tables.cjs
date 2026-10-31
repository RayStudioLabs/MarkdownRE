const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {_electron}=require('playwright');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'markdownre-pdf-tables-'));
  const file=path.join(dir,'tables.md');
  const filler=Array.from({length:21},(_,i)=>`Filler paragraph ${i+1}.\n\n`).join('');
  const short='| ShortHeadA | ShortHeadB |\n|---|---|\n'+Array.from({length:4},(_,i)=>`| ShortRow${i+1} | Value |\n`).join('');
  const long='| LongHeadA | LongHeadB |\n|---|---|\n'+Array.from({length:90},(_,i)=>`| LongRow${i+1} | Value |\n`).join('');
  await fs.writeFile(file,'# Tables\n\n'+filler+'## ParentHeading\n\nParent introduction.\n\n### TopicHeading\n\nChapter introduction.\n\n'+short+'\n\n### LaterHeading\n\n'+filler+'## ParentLong\n\nParent long introduction.\n\n### LongHeading\n\n'+long);
  const app=await _electron.launch({executablePath:process.env.ELECTRON_TEST_BINARY||require('electron'),args:[...(process.env.ELECTRON_TEST_PACKAGED?[]:[root]),`--user-data-dir=${path.join(dir,'profile')}`,file,...(process.env.ELECTRON_TEST_CONTAINER?['--no-sandbox','--disable-gpu']:[])]});
  try {
    const page=await app.firstWindow();await page.waitForSelector('#preview table');
    const pdf=path.join(dir,'tables.pdf');
    await app.evaluate(({dialog,Menu,BrowserWindow},out)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:out});BrowserWindow.getAllWindows()[0].focus();Menu.getApplicationMenu().getMenuItemById('file').submenu.getMenuItemById('exportPdf').click();},pdf);
    let data;for(let i=0;i<150;i++){try{data=await fs.readFile(pdf);break;}catch{}await new Promise(r=>setTimeout(r,100));}
    assert(data&&data.subarray(0,5).toString()==='%PDF-','PDF was not created');
    if(process.env.MARKDOWNRE_PDF_COPY)await fs.copyFile(pdf,process.env.MARKDOWNRE_PDF_COPY);
    await page.waitForFunction(()=>!document.querySelector('#pdf-export-root'));
    assert.equal(await page.locator('#preview').count(),1,'The temporary print preview was not removed');
    const parsed=spawnSync('pdftotext',['-layout',pdf,'-'],{encoding:'utf8'});
    if(!parsed.error){
      assert.equal(parsed.status,0,'pdftotext failed');
      const pages=parsed.stdout.split('\f').filter(p=>p.trim());
      const shortPages=pages.filter(p=>p.includes('ShortHeadA')||p.includes('ShortRow'));
      assert.equal(shortPages.length,1,'Short table split between pages');
      assert(shortPages[0].includes('ShortHeadA')&&shortPages[0].includes('ShortRow1')&&shortPages[0].includes('ShortRow4'));
      const topicPages=pages.filter(p=>p.includes('TopicHeading'));
      assert.equal(topicPages.length,1,'Chapter heading duplicated or missing');
      assert(topicPages[0].includes('Chapter introduction')&&topicPages[0].includes('ShortHeadA')&&topicPages[0].includes('ShortRow4'),'Chapter heading was separated from its introduction or table');
      assert(topicPages[0].includes('ParentHeading')&&topicPages[0].includes('Parent introduction'),'Parent heading was separated from its first subsection');
      const longPages=pages.filter(p=>p.includes('LongHeadA')||p.includes('LongRow'));
      assert(longPages.length>1,'Long table did not span pages');
      for(const content of longPages)assert(content.includes('LongHeadA')&&content.includes('LongRow'),'A table page is missing its header or rows');
      const headingPages=pages.filter(p=>p.includes('LongHeading'));
      assert.equal(headingPages.length,1);
      assert(headingPages[0].includes('LongHeadA')&&headingPages[0].includes('LongRow1'),'Long chapter heading is separated from its first rows');
      assert(headingPages[0].includes('ParentLong')&&headingPages[0].includes('Parent long introduction'),'Parent heading was separated from the long subsection');
      assert(longPages.at(-1).includes('LongRow90'),'Final table row is missing');
      console.log(`PASS: one-page table kept intact and headers repeated on ${longPages.length} table pages`);
    } else if(parsed.error.code!=='ENOENT')throw parsed.error;
    console.log('PASS: Electron generated a PDF containing short and long table fixtures');
  }finally{await app.close();await fs.rm(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
