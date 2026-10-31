import {syncPreviewScroll} from './scroll-sync.js';
import {themes, normalizeTheme} from './themes.js';
import {renderIcons} from './icons.js';
import './style.css';

renderIcons();
const $ = (s) => document.querySelector(s);
const bridge = (type, data = {}) => {
  const message = {type, ...data};
  if (window.desktopBridge) window.desktopBridge.postMessage(message);
  else window.webkit?.messageHandlers?.app?.postMessage(message);
};
if (window.desktopBridge?.platform !== 'darwin' && window.desktopBridge) {
  for (const button of document.querySelectorAll('[title]')) button.title = button.title.replaceAll('⌘', 'Ctrl+').replaceAll('⇧', 'Shift+');
}
const initialTheme = normalizeTheme(window.__markdownREInitialTheme);
const state = {layout:'preview', theme:initialTheme, horizontal:0.5, vertical:0.5, base:'', text:''};
let editor = null, editorModule = null, editorPromise = null;
let rendererPromise = null, changing = false, renderVersion = 0, syncFrame = 0;

function updateHistoryButtons() {
  const model = editor?.getModel();
  $('#undo').disabled = !model?.canUndo();
  $('#redo').disabled = !model?.canRedo();
}
function updateHistoryAfterChange() { requestAnimationFrame(updateHistoryButtons); }
let formatFrame = 0;
function updateFormatButtons() {
  if (formatFrame) return;
  formatFrame = requestAnimationFrame(() => {
    formatFrame = 0;
    const active = editor && editorModule ? editorModule.getActiveMarkdown(editor) : new Set();
    for (const button of document.querySelectorAll('[data-markdown]')) {
      const pressed = active.has(button.dataset.markdown);
      button.classList.toggle('active', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    }
  });
}
$('#open-file').onclick = () => bridge('openDocument');
$('#save-file').onclick = () => bridge('saveDocument');
for (const command of ['undo', 'redo']) {
  $(`#${command}`).onclick = () => {
    if (!editor) return;
    editor.focus();
    editor.trigger('toolbar', command, null);
    updateHistoryAfterChange();
  };
}
updateHistoryButtons();

function schedulePreviewSync() {
  if (!editor || (state.layout !== 'horizontal' && state.layout !== 'vertical') || syncFrame) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    if (editor && (state.layout === 'horizontal' || state.layout === 'vertical')) syncPreviewScroll(editor, $('#preview'));
  });
}
$('#preview').addEventListener('load', event => { if (event.target instanceof HTMLImageElement) schedulePreviewSync(); }, true);

function ensureEditor() {
  if (!editorPromise) {
    editorPromise = import('./editor.js').then(module => {
      editorModule = module;
      editor = module.createEditor($('#editor'), themes[state.theme], state.text);
      editor.onDidScrollChange(event => { if (event.scrollTopChanged) schedulePreviewSync(); });
      editor.onDidLayoutChange(schedulePreviewSync);
      editor.onDidChangeCursorSelection(updateFormatButtons);
      editor.onDidChangeModelContent(() => {
        updateHistoryAfterChange();
        updateFormatButtons();
        if (!changing) { state.text = editor.getValue(); bridge('changed',{text:state.text}); render(state.text); }
      });
      updateHistoryButtons();
      updateFormatButtons();
      if (state.layout !== 'preview') { editor.layout(); schedulePreviewSync(); }
      return editor;
    }).catch(error => {
      editorPromise = null;
      $('#editor').textContent = `编辑器加载失败：${error.message}`;
      throw error;
    });
  }
  return editorPromise;
}

async function render(text) {
  const version = ++renderVersion;
  const preview = $('#preview');
  if (!text) { preview.replaceChildren(); return; }
  try {
    rendererPromise ||= import('./render.js');
    const {renderMarkdown} = await rendererPromise;
    const html = await renderMarkdown(text);
    if (version !== renderVersion) return;
    preview.innerHTML = html;
    for (const image of preview.querySelectorAll('img[src]')) {
      const src = image.getAttribute('src');
      if (src && !/^(?:https?:|data:|blob:|\/\/)/i.test(src)) image.src = state.base + src.split('/').map(encodeURIComponent).join('/');
      image.referrerPolicy = 'no-referrer';
    }
    schedulePreviewSync();
  } catch (error) {
    rendererPromise = null;
    if (version === renderVersion) preview.textContent = `预览失败：${error.message}`;
  }
}

// Wait for the current unsaved editor contents, images, and math fonts before printing.
window.preparePDFExport = async (forPrint = false) => {
  await render(state.text);
  await Promise.all(Array.from($('#preview').querySelectorAll('img'), image => {
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => {
      image.addEventListener('load', resolve, {once:true});
      image.addEventListener('error', resolve, {once:true});
      setTimeout(resolve, 10000);
    });
  }));
  if (document.fonts?.ready) await document.fonts.ready;
  if (forPrint) {
    document.querySelector('#pdf-export-root')?.remove();
    const root = document.createElement('div');
    root.id = 'pdf-export-root';
    const preview = $('#preview').cloneNode(false);
    root.appendChild(preview);
    const stack = [{level: 0, node: preview}];
    for (const child of $('#preview').childNodes) {
      const copy = child.cloneNode(true);
      if (copy.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test(copy.tagName)) {
        const level = Number(copy.tagName[1]);
        while (stack.length > 1 && stack.at(-1).level >= level) stack.pop();
        const section = document.createElement('section');
        section.className = 'pdf-section';
        stack.at(-1).node.appendChild(section);
        stack.push({level, node: section});
      }
      stack.at(-1).node.appendChild(copy);
    }
    // Treat a parent heading, its introduction and its first subsection as
    // one opening unit when it fits, rather than leaving the parent isolated.
    for (const section of Array.from(preview.querySelectorAll('.pdf-section')).reverse()) {
      const firstNested = Array.from(section.children).find(child => child.classList.contains('pdf-section'));
      if (!firstNested) continue;
      const intro = document.createElement('div');
      intro.className = 'pdf-section-intro';
      section.insertBefore(intro, section.firstChild);
      while (intro.nextSibling && intro.nextSibling !== firstNested) intro.appendChild(intro.nextSibling);
      intro.lastElementChild?.classList.add('pdf-keep-next');
      intro.appendChild(firstNested);
    }
    // Measure at the A4 printable width. Oversized sections must remain
    // splittable, otherwise Chromium can ignore keep-together rules inside.
    root.style.cssText = 'display:block;position:fixed;left:-10000px;top:0;width:calc(210mm - 1.34in)';
    preview.style.cssText = 'padding:0;overflow:visible;height:auto';
    document.body.appendChild(root);
    await Promise.all(Array.from(root.querySelectorAll('img'), image => image.complete ? Promise.resolve() :
      Promise.race([new Promise(resolve => { image.addEventListener('load', resolve, {once:true}); image.addEventListener('error', resolve, {once:true}); }), new Promise(resolve => setTimeout(resolve, 10000))])));
    const measure = document.createElement('div');
    measure.style.height = 'calc(297mm - 1.34in)';
    root.appendChild(measure);
    const pageHeight = measure.getBoundingClientRect().height;
    measure.remove();
    for (const block of root.querySelectorAll('.pdf-section, .pdf-section-intro')) {
      block.classList.toggle('pdf-large', block.getBoundingClientRect().height > pageHeight);
    }
    root.removeAttribute('style');
    preview.removeAttribute('style');
  }
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'), link => `<link rel="stylesheet" href="${link.href}">`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">${links}<style>
    :root { color-scheme: light; --background:#fff; --foreground:#222; --surface:#f2f2f2; --accent:#1769aa; --border:#aaa;
      --syntax-green:#286b32; --syntax-cyan:#087c83; --syntax-blue:#2358a3; --syntax-yellow:#805e00; --syntax-orange:#a14909; --syntax-red:#aa2525; }
    html, body { height:auto; margin:0; background:#fff; color:#222; }
    #preview { display:block; height:auto; overflow:visible; padding:0; }
    #preview pre { white-space:pre-wrap; overflow-wrap:anywhere; }
  </style></head><body><main id="preview">${$('#preview').innerHTML}</main></body></html>`;
};
window.finishPDFExport = () => document.querySelector('#pdf-export-root')?.remove();

function applyLayout(layout) {
  state.layout=layout;
  $('#edit-actions').hidden = layout === 'preview';
  $('#markdown-actions').hidden = layout === 'preview';
  const workspace=$('#workspace'); workspace.dataset.layout=layout;
  workspace.style.setProperty('--ratio', `${(layout==='vertical'?state.vertical:state.horizontal)*100}%`);
  document.querySelectorAll('[data-layout]').forEach(button => { const active = button.dataset.layout === layout; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  if (layout !== 'preview') {
    ensureEditor().then(instance => { if (state.layout !== 'preview') { instance.layout(); schedulePreviewSync(); } }).catch(() => {});
  }
  if (editor) editor.layout();
  schedulePreviewSync();
}
function applyTheme(value) {
  const id = normalizeTheme(value);
  const theme = themes[id];
  state.theme = id;
  document.documentElement.dataset.theme = theme.dark ? 'dark' : 'light';
  for (const key of ['background', 'foreground', 'accent', 'surface', 'muted', 'border']) document.documentElement.style.setProperty(`--${key}`, theme[key]);
  for (const [key, color] of Object.entries(theme.syntax)) document.documentElement.style.setProperty(`--syntax-${key}`, color);
  if (editorModule) editorModule.setEditorTheme(theme);
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-checked', String(button.dataset.themeChoice === id)));
}
for (const button of document.querySelectorAll('[data-layout]')) button.onclick=()=>{applyLayout(button.dataset.layout);bridge('layout',{layout:state.layout});};
for (const button of document.querySelectorAll('[data-markdown]')) button.onclick=()=>{
  if (state.layout === 'preview') return;
  ensureEditor().then(instance => { if (state.layout !== 'preview') editorModule.insertMarkdown(instance, button.dataset.markdown); }).catch(() => {});
};
const themeButton = $('#theme');
const themeMenu = $('#theme-menu');
function closeThemeMenu() { themeMenu.hidden = true; themeButton.setAttribute('aria-expanded', 'false'); }
themeButton.onclick = () => { themeMenu.hidden = !themeMenu.hidden; themeButton.setAttribute('aria-expanded', String(!themeMenu.hidden)); };
for (const button of themeMenu.querySelectorAll('[data-theme-choice]')) button.onclick = () => { applyTheme(button.dataset.themeChoice); bridge('theme', {theme: state.theme}); closeThemeMenu(); themeButton.focus(); };
document.addEventListener('click', event => { if (!event.target.closest('.theme-picker')) closeThemeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !themeMenu.hidden) { closeThemeMenu(); themeButton.focus(); } });
const splitter=$('#splitter'); splitter.addEventListener('pointerdown',event=>{event.preventDefault();splitter.setPointerCapture(event.pointerId);});
splitter.addEventListener('pointermove',event=>{
  if(!splitter.hasPointerCapture(event.pointerId)) return;
  const rect=$('#workspace').getBoundingClientRect(); const v=state.layout==='vertical';
  const ratio=Math.max(0.15,Math.min(0.85,v?(event.clientY-rect.top)/rect.height:(event.clientX-rect.left)/rect.width));
  state[v?'vertical':'horizontal']=ratio; $('#workspace').style.setProperty('--ratio',`${ratio*100}%`); editor?.layout();
});
splitter.addEventListener('pointerup',()=>bridge('ratios',{horizontal:state.horizontal,vertical:state.vertical}));
$('#preview').addEventListener('click',event=>{const link=event.target.closest('a');if(link){const href=link.getAttribute('href');if(href && !href.startsWith('#')) {event.preventDefault();bridge('openLink',{href});}}});
window.receiveNative = (message) => {
  if(message.type==='document') {
    state.text = message.text || ''; state.base=message.base || '';
    if (editor) { changing=true; editor.setValue(state.text); changing=false; }
    applyLayout('preview');
    render(state.text);
    // The lightweight toolbar is now ready; document rendering continues independently.
    bridge('displayReady');
  }
  if(message.type==='edit' && editor && ['undo','redo'].includes(message.command)) {editor.focus();editor.trigger('native-menu',message.command,null);updateHistoryAfterChange();}
  if(message.type==='documentBase') {state.base=message.base || ''; render(state.text);}
  if(message.type==='preferences') {state.horizontal=message.horizontal || 0.5;state.vertical=message.vertical || 0.5;applyTheme(message.theme);applyLayout(state.layout);}
  if(message.type==='theme') applyTheme(message.theme);
  if(message.type==='layout') applyLayout(message.layout);
  if(message.type==='requestContent') bridge('content',{text:state.text,action:message.action});
};
window.desktopBridge?.onMessage(message => window.receiveNative(message));
applyTheme(initialTheme); applyLayout('preview'); bridge('ready');
