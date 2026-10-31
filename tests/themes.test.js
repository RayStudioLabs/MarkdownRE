import test from 'node:test';
import assert from 'node:assert/strict';
import {themes, normalizeTheme, monacoTheme} from '../web/src/themes.js';

test('Solarized themes use the iTerm2 background, text, selection and cursor colors', () => {
  assert.deepEqual(
    ['background', 'foreground', 'cursor', 'selection', 'selectedText'].map(key => themes['solarized-dark'][key]),
    ['#002b36', '#839496', '#839496', '#073642', '#93a1a1'],
  );
  assert.deepEqual(
    ['background', 'foreground', 'cursor', 'selection', 'selectedText'].map(key => themes['solarized-light'][key]),
    ['#fdf6e3', '#657b83', '#657b83', '#eee8d5', '#586e75'],
  );
  assert.equal(monacoTheme(themes['solarized-dark']).colors['editor.selectionBackground'], '#073642');
});

test('previous light and dark preferences migrate to their Solarized variants', () => {
  assert.equal(normalizeTheme('light'), 'solarized-light');
  assert.equal(normalizeTheme('dark'), 'solarized-dark');
  assert.equal(normalizeTheme('pastel-dark'), 'dark-background');
  assert.equal(normalizeTheme('solarized-dark'), 'solarized-dark');
  assert.equal(normalizeTheme(undefined), 'solarized-light');
});

test('all seven iTerm2 presets expose their original text, selection and ANSI colors', () => {
  const expected = {
    'dark-background': ['#000000', '#bbbbbb', '#b5d5ff', '#0000bb'],
    'light-background': ['#ffffff', '#000000', '#b5d5ff', '#0000bb'],
    'smoooooth': ['#15191f', '#dcdcdc', '#b3d7ff', '#2744c7'],
    'solarized-dark': ['#002b36', '#839496', '#073642', '#268bd2'],
    'solarized-light': ['#fdf6e3', '#657b83', '#eee8d5', '#268bd2'],
    'tango-dark': ['#000000', '#ffffff', '#b5d5ff', '#3465a4'],
    'tango-light': ['#ffffff', '#000000', '#b5d5ff', '#3465a4'],
  };
  assert.equal(Object.keys(themes).length, 7);
  for (const [id, values] of Object.entries(expected)) {
    const theme = themes[id];
    assert.deepEqual([theme.background, theme.foreground, theme.selection, theme.ansi[4]], values, id);
    assert.equal(normalizeTheme(id), id);
    assert.equal(monacoTheme(theme).colors['editor.background'], theme.background);
    assert.equal(monacoTheme(theme).colors['editorCursor.foreground'], theme.cursor);
  }
});
