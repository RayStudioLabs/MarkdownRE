import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/markdown/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import {monacoTheme} from './themes.js';
import {activeFormats, formatMarkdown} from './formatting.js';

self.MonacoEnvironment = {getWorker: () => new EditorWorker()};

export function setEditorTheme(theme) {
  monaco.editor.defineTheme('markdownre-preset', monacoTheme(theme));
  monaco.editor.setTheme('markdownre-preset');
}

export function createEditor(container, theme, text) {
  setEditorTheme(theme);
  const editor = monaco.editor.create(container, {
    value: text, language: 'markdown', theme: 'markdownre-preset',
    automaticLayout: true, minimap: {enabled: false}, wordWrap: 'on',
    fontSize: 14, scrollBeyondLastLine: false,
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => {
    editor.trigger('keyboard', 'redo', null);
  }, 'editorTextFocus');
  return editor;
}

export function getActiveMarkdown(editor) {
  const model = editor.getModel(), selection = editor.getSelection();
  if (!model || !selection) return new Set();
  return activeFormats(model.getValue(), model.getOffsetAt(selection.getStartPosition()), model.getOffsetAt(selection.getEndPosition()));
}

export function insertMarkdown(editor, kind) {
  const model = editor.getModel(), selection = editor.getSelection();
  if (!model || !selection) return;
  const start = model.getOffsetAt(selection.getStartPosition()), end = model.getOffsetAt(selection.getEndPosition());
  const edit = formatMarkdown(model.getValue(), start, end, kind);
  if (!edit) { editor.focus(); return; }
  const from = model.getPositionAt(edit.from), to = model.getPositionAt(edit.to);
  editor.pushUndoStop();
  if (editor.executeEdits('markdown-toolbar', [{range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: edit.text, forceMoveMarkers: true}])) {
    const a = model.getPositionAt(edit.start), b = model.getPositionAt(edit.end);
    editor.setSelection(new monaco.Selection(a.lineNumber, a.column, b.lineNumber, b.column));
  }
  editor.pushUndoStop();
  editor.focus();
}
