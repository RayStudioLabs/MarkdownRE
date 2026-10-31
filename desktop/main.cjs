const {app,BrowserWindow,Menu,dialog,ipcMain,protocol,shell} = require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {fileURLToPath}=require('node:url');
const {decodeDocument,encodeDocument,fileHash,atomicSave,confinedPath}=require('./files.cjs');
const UI='markdownre://ui/index.html';
const dictionaries=require('../web-dist/locales.json');
const languageNames={'zh-Hans':'简体中文','zh-Hant':'繁體中文',en:'English',de:'Deutsch',fr:'Français',es:'Español',ja:'日本語',ko:'한국어','pt-BR':'Português (Brasil)',it:'Italiano'};
function resolveLanguage(value) {if (value && value !== 'system' && languageNames[value]) return value; const tag=app.getLocale().replaceAll('_','-').toLowerCase();if(tag==='zh'||tag.startsWith('zh-')){const parts=tag.split('-');return parts.includes('hant')?'zh-Hant':parts.includes('hans')?'zh-Hans':parts.some(part=>['tw','hk','mo'].includes(part))?'zh-Hant':'zh-Hans';}if(tag.startsWith('pt'))return 'pt-BR';return languageNames[tag.split('-')[0]]?tag.split('-')[0]:'en';}
function t(key){return dictionaries[resolveLanguage(preferences.language)]?.[key]||dictionaries.en[key]||key;}

const webRoot=path.join(__dirname,'../web-dist');
const documents=new Map();
const themes=new Set(['dark-background','light-background','smoooooth','solarized-dark','solarized-light','tango-dark','tango-light']);
let preferences={theme:'solarized-light',horizontal:0.5,vertical:0.5,language:'system'},preferencesQueue=Promise.resolve();
const earlyFiles=[];
protocol.registerSchemesAsPrivileged([{scheme:'markdownre',privileges:{standard:true,secure:true,supportFetchAPI:true,allowServiceWorkers:false}}]);
if(!app.requestSingleInstanceLock()) {app.quit();} else {
  app.on('second-instance',(_event,args)=>{for(const file of documentArgs(args))void openDocument(file);const win=BrowserWindow.getAllWindows()[0];if(win){if(win.isMinimized())win.restore();win.focus();}});
  app.on('open-file',(event,file)=>{event.preventDefault();if(app.isReady())void openDocument(file);else earlyFiles.push(file);});
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox(t('startupFailed'),localizedError(error));app.quit();});
}
app.on('window-all-closed',()=>app.quit());
function documentArgs(args) {return args.slice(app.isPackaged?1:2).filter(arg=>!arg.startsWith('-')&&/\.(md|markdown|mdown|txt)$/i.test(arg)).map(file=>file.startsWith('file:')?fileURLToPath(file):path.resolve(file));}
function send(doc,message){if(!doc.win.isDestroyed())doc.win.webContents.send('native-message',message);}
function updateTitle(doc){doc.win.setTitle(`${doc.text===doc.savedText?'':'● '}${doc.file?path.basename(doc.file):`${t('untitled')}.md`} — MarkdownRE`);doc.win.setDocumentEdited(doc.text!==doc.savedText);}
const fileErrors={'无法识别文件编码，文件未打开。支持 UTF-8 和带 BOM 的 UTF-16。':'encodingError','文件包含混合换行符，暂无法安全编辑。':'mixedNewlines','文件在保存前再次发生变化，请重试。':'changedAgain','文件已被其他程序修改，未覆盖外部内容。':'changedBeforeSave','非法资源路径':'invalidResource','资源超出文档目录':'resourceOutside'};
function localizedError(error){const message=error.message||String(error);return fileErrors[message]?t(fileErrors[message]):message;}
function errorBox(doc,error){return dialog.showMessageBox(doc.win,{type:'error',message:localizedError(error)});}
function storePreferences(){const data=JSON.stringify(preferences);preferencesQueue=preferencesQueue.then(()=>fs.writeFile(path.join(app.getPath('userData'),'preferences.json'),data)).catch(()=>{});}
async function chooseOpen(){const result=await dialog.showOpenDialog({properties:['openFile','multiSelections'],filters:[{name:`Markdown / ${t('textFiles')}`,extensions:['md','markdown','mdown','txt']}]});if(!result.canceled)for(const file of result.filePaths)await openDocument(file);}
function snapshot(doc){return new Promise((resolve,reject)=>{const action=randomUUID();const timer=setTimeout(()=>{doc.requests.delete(action);reject(new Error(t('editorUnresponsive')));},10000);doc.requests.set(action,{resolve:text=>{clearTimeout(timer);resolve(text);},reject});send(doc,{type:'requestContent',action});});}
async function exportPDF(doc,file){
  if(doc.exportingPDF)return false;
  doc.exportingPDF=true;
  try {
    await doc.win.webContents.executeJavaScript('window.preparePDFExport(true)');
    const data=await doc.win.webContents.printToPDF({pageSize:'A4',printBackground:true,margins:{top:0.67,bottom:0.67,left:0.67,right:0.67}});
    await atomicSave(file,data,await fileHash(file));
    return true;
  } catch(error){await errorBox(doc,error);return false;}
  finally{if(!doc.win.isDestroyed())await doc.win.webContents.executeJavaScript('window.finishPDFExport()').catch(()=>{});doc.exportingPDF=false;}
}
async function choosePDFExport(doc){
  const defaultPath=doc.file?path.join(path.dirname(doc.file),path.parse(doc.file).name+'.pdf'):`${t('untitled')}.pdf`;
  const result=await dialog.showSaveDialog(doc.win,{defaultPath,filters:[{name:'PDF',extensions:['pdf']}],properties:['showOverwriteConfirmation']});
  if(!result.canceled&&result.filePath)await exportPDF(doc,result.filePath);
}
async function save(doc,saveAs=false) {
  if(doc.saving)return false;doc.saving=true;
  try {
    const text=await snapshot(doc);doc.text=text;
    let file=doc.file;
    if(!file||saveAs){const result=await dialog.showSaveDialog(doc.win,{defaultPath:file||`${t('untitled')}.md`,filters:[{name:'Markdown',extensions:['md']},...(saveAs?[{name:'PDF',extensions:['pdf']}]:[]),{name:t('textFiles'),extensions:['txt']}],properties:['showOverwriteConfirmation']});if(result.canceled)return false;file=result.filePath;if(saveAs&&path.extname(file).toLowerCase()==='.pdf'){await exportPDF(doc,file);return false;}}
    const current=await fileHash(file);
    if(file===doc.file&&current!==doc.format.hash){const r=await dialog.showMessageBox(doc.win,{type:'warning',message:t('changedOrDeleted'),buttons:[t('cancel'),t('overwrite')],defaultId:0,cancelId:0});if(r.response!==1)return false;}
    const data=encodeDocument(text,doc.format);const hash=await atomicSave(file,data,current);
    doc.file=file;doc.savedText=text;doc.format.hash=hash;updateTitle(doc);app.addRecentDocument(file);
    send(doc,{type:'documentBase',base:`markdownre://document/${doc.token}/`});return true;
  } catch(error){await errorBox(doc,error);return false;} finally{doc.saving=false;}
}
async function confirmClose(doc){
  try {doc.text=await snapshot(doc);updateTitle(doc);}catch(error){await errorBox(doc,error);return false;}
  if(doc.text===doc.savedText)return true;
  const r=await dialog.showMessageBox(doc.win,{type:'question',message:t('saveChanges'),buttons:[t('save'),t('cancel'),t('discard')],defaultId:0,cancelId:1});
  return r.response===2||(r.response===0&&await save(doc)&&doc.text===doc.savedText);
}
async function openDocument(file){
  try {
    if(file){file=await fs.realpath(file);const existing=[...documents.values()].find(d=>d.file===file);if(existing){existing.win.focus();return;}}
    const format=file?decodeDocument(await fs.readFile(file)):{text:'',encoding:'utf8',bom:false,newline:'\n',hash:null};
    const win=new BrowserWindow({width:1100,height:750,minWidth:600,minHeight:400,show:false,backgroundColor:'#fdf6e3',icon:path.join(__dirname,'../macos/assets/MarkdownRE.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    const doc={win,file,format,text:format.text,savedText:format.text,token:randomUUID(),requests:new Map(),closing:false,ready:false};documents.set(win.webContents.id,doc);updateTitle(doc);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(url!==UI)event.preventDefault();});
    win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    win.webContents.session.setPermissionCheckHandler(()=>false);
    win.webContents.on('render-process-gone',()=>{if(!win.isDestroyed()){win.show();void errorBox(doc,new Error(t('editorStopped')));}});
    win.on('close',event=>{if(doc.allowClose)return;event.preventDefault();if(doc.closing)return;doc.closing=true;void confirmClose(doc).then(ok=>{doc.closing=false;if(ok){doc.allowClose=true;win.close();}});});
    const contentsId=win.webContents.id;
    win.on('closed',()=>documents.delete(contentsId));
    await win.loadURL(UI);win.show();if(file)app.addRecentDocument(file);
  }catch(error){dialog.showErrorBox(t('openFailed'),localizedError(error));}
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.avif':'image/avif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
async function resource(request){
  try {
    const url=new URL(request.url);let file;
    if(url.host==='ui')file=await confinedPath(webRoot,decodeURIComponent(url.pathname.slice(1)||'index.html'));
    else if(url.host==='document'){
      const [,token,...parts]=url.pathname.split('/');const doc=[...documents.values()].find(d=>d.token===token);
      if(!doc?.file)return new Response('',{status:404});
      file=await confinedPath(path.dirname(doc.file),decodeURIComponent(parts.join('/')));
      if(!types[path.extname(file).toLowerCase()]?.startsWith('image/'))return new Response('',{status:403});
    } else return new Response('',{status:403});
    const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','X-Content-Type-Options':'nosniff'};
    headers['Content-Security-Policy']=url.host==='document'?"default-src 'none'; sandbox":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' markdownre: https: http: data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'";
    return new Response(await fs.readFile(file),{headers});
  }catch{return new Response('',{status:404});}
}
function focused(){return documents.get(BrowserWindow.getFocusedWindow()?.webContents.id);}
function setLanguage(value) {
  if (value !== 'system' && !languageNames[value]) return;
  preferences.language = value; storePreferences(); makeMenu();
  for (const doc of documents.values()) { updateTitle(doc); send(doc, {type:'language',language:resolveLanguage(value)}); }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.__markdownHelp) { win.setTitle(t('syntax')); void win.webContents.executeJavaScript(`window.__markdownREInitialLanguage=${JSON.stringify(resolveLanguage(value))}; window.setHelpLanguage?.(window.__markdownREInitialLanguage)`); }
    if (win.__markdownAbout) { win.setTitle(t('about')); void win.webContents.executeJavaScript(`window.__markdownREInitialLanguage=${JSON.stringify(resolveLanguage(value))}; window.setAboutLanguage?.(window.__markdownREInitialLanguage)`); }
  }
}
let aboutWindow;
function showAbout() {
  if (aboutWindow && !aboutWindow.isDestroyed()) { aboutWindow.focus(); return; }
  const win = new BrowserWindow({width:380,height:440,resizable:false,show:false,title:t('about'),icon:path.join(__dirname,'../macos/assets/MarkdownRE.png'),webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  aboutWindow=win; win.__markdownAbout=true;
  win.on('closed',()=>{if(aboutWindow===win)aboutWindow=null;});
  win.once('ready-to-show',()=>win.show());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  const query = new URLSearchParams({lang:resolveLanguage(preferences.language),version:app.getVersion(),theme:preferences.theme});
  void win.loadURL(`markdownre://ui/about.html?${query}`);
}
function makeMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
 ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
 {id:'file',label:t('file'),submenu:[{id:'newDocument',label:t('new'),accelerator:'CmdOrCtrl+N',click:()=>openDocument()},{label:t('open'),accelerator:'CmdOrCtrl+O',click:chooseOpen},{label:t('recent'),submenu:[{role:'recentDocuments',submenu:[{role:'clearRecentDocuments',label:t('clearRecent')}]}]},{type:'separator'},{label:t('save'),accelerator:'CmdOrCtrl+S',click:()=>{const d=focused();if(d)void save(d);}},{id:'saveAs',label:t('saveAs'),accelerator:'CmdOrCtrl+Shift+S',click:()=>{const d=focused();if(d)void save(d,true);}},{id:'exportPdf',label:t('exportPdf'),click:()=>{const d=focused();if(d)void choosePDFExport(d);}},{type:'separator'},{role:'close',label:t('close')},{role:'quit',label:t('quit')}]},
 {id:'edit',label:t('edit'),submenu:[{label:t('undo'),accelerator:'CmdOrCtrl+Z',click:()=>{const d=focused();if(d)send(d,{type:'edit',command:'undo'});}},{label:t('redo'),accelerator:'CmdOrCtrl+Shift+Z',click:()=>{const d=focused();if(d)send(d,{type:'edit',command:'redo'});}},{type:'separator'},{role:'cut',label:t('cut')},{role:'copy',label:t('copy')},{role:'paste',label:t('paste')},{role:'selectAll',label:t('selectAll')}]},
 {id:'view',label:t('view'),submenu:[...['preview','horizontal','vertical','editor'].map(layout=>({label:t(layout),click:()=>{const d=focused();if(d)send(d,{type:'layout',layout});}})),{type:'separator'},{label:t('language'),submenu:[{id:'language-system',type:'radio',label:t('systemLanguage'),checked:preferences.language==='system',click:()=>setLanguage('system')},{type:'separator'},...Object.entries(languageNames).map(([id,name])=>({id:`language-${id}`,type:'radio',label:name,checked:preferences.language===id,click:()=>setLanguage(id)}))]},{type:'separator'},{role:'togglefullscreen',label:t('fullscreen')}]},
 {id:'help',label:t('help'),submenu:[{id:'syntax',label:t('syntax'),click:()=>{const win=new BrowserWindow({title:t('syntax'),width:850,height:700,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});win.__markdownHelp=true;win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());void win.loadURL(`markdownre://ui/help.html?lang=${encodeURIComponent(resolveLanguage(preferences.language))}`);}},{id:'about',label:t('about'),click:showAbout}]},
]));}
async function start(){
  await fs.mkdir(app.getPath('userData'),{recursive:true});try{const p=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'preferences.json'),'utf8'));if(themes.has(p.theme))preferences.theme=p.theme;if(p.language==='system'||languageNames[p.language])preferences.language=p.language;for(const k of ['horizontal','vertical'])if(Number.isFinite(p[k])&&p[k]>=0.15&&p[k]<=0.85)preferences[k]=p[k];}catch{}
  protocol.handle('markdownre',resource);
  ipcMain.on('app-message',(event,message)=>{
    const doc=documents.get(event.sender.id);
    if(!doc||event.senderFrame!==event.sender.mainFrame||event.senderFrame.url!==UI||!message||typeof message.type!=='string')return;
    switch(message.type){
      case 'ready':doc.ready=true;send(doc,{type:'preferences',...preferences,language:resolveLanguage(preferences.language)});send(doc,{type:'document',text:doc.text,base:`markdownre://document/${doc.token}/`});break;
      case 'changed':if(typeof message.text==='string'){doc.text=message.text;updateTitle(doc);}break;
      case 'content':if(typeof message.text==='string'){const request=doc.requests.get(message.action);doc.requests.delete(message.action);request?.resolve(message.text);}break;
      case 'openDocument':void chooseOpen();break;
      case 'saveDocument':void save(doc);break;
      case 'theme':if(themes.has(message.theme)){preferences.theme=message.theme;storePreferences();for(const d of documents.values())send(d,{type:'theme',theme:message.theme});if(aboutWindow&&!aboutWindow.isDestroyed())void aboutWindow.webContents.executeJavaScript(`window.setAboutTheme?.(${JSON.stringify(message.theme)})`);}break;
      case 'ratios':for(const key of ['horizontal','vertical'])if(Number.isFinite(message[key])&&message[key]>=0.15&&message[key]<=0.85)preferences[key]=message[key];storePreferences();break;
      case 'openLink':try{const url=new URL(message.href);if(['https:','http:','mailto:'].includes(url.protocol))void shell.openExternal(url.href).catch(e=>errorBox(doc,e));}catch{}break;
    }
  });
  makeMenu();const files=[...earlyFiles,...documentArgs(process.argv)];if(files.length)for(const file of files)await openDocument(file);else await openDocument();
}
