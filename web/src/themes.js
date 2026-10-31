import {presetColors} from './theme-presets.js';

function mix(background, foreground, weight) {
  const color = (offset) => Math.round(
    parseInt(background.slice(offset, offset + 2), 16) * (1 - weight) +
    parseInt(foreground.slice(offset, offset + 2), 16) * weight,
  ).toString(16).padStart(2, '0');
  return `#${color(1)}${color(3)}${color(5)}`;
}

export const themes = Object.fromEntries(Object.entries(presetColors).map(([id, preset]) => {
  const solarized = id.startsWith('solarized-');
  const colors = preset.ansi;
  const vibrant = preset.dark && !solarized;
  const blue = colors[vibrant ? 12 : 4];
  const cyan = colors[vibrant ? 14 : 6];
  const green = colors[vibrant ? 10 : 2];
  const red = colors[vibrant ? 9 : 1];
  const magenta = colors[vibrant ? 13 : 5];
  const yellow = colors[vibrant ? 11 : 3];
  const orange = solarized ? colors[9] : yellow;
  return [id, {
    ...preset,
    surface: solarized ? preset.selection : mix(preset.background, preset.foreground, 0.10),
    border: solarized ? (preset.dark ? colors[10] : colors[14]) : mix(preset.background, preset.foreground, 0.45),
    muted: solarized ? preset.bold : preset.foreground,
    accent: blue,
    syntax: {blue, cyan, green, red, magenta, yellow, orange},
  }];
}));

export function normalizeTheme(value) {
  if (value === 'pastel-dark') return 'dark-background';
  if (value === 'dark') return 'solarized-dark';
  if (value === 'light') return 'solarized-light';
  return Object.hasOwn(themes, value) ? value : 'solarized-light';
}

export function monacoTheme(theme) {
  const {blue, cyan, magenta, orange} = theme.syntax;
  return {
    base: theme.dark ? 'vs-dark' : 'vs', inherit: true,
    colors: {
      'editor.background': theme.background,
      'editor.foreground': theme.foreground,
      'editorCursor.foreground': theme.cursor,
      'editor.selectionBackground': theme.selection,
      'editor.selectionForeground': theme.selectedText,
      'editor.inactiveSelectionBackground': theme.selection,
      'editor.lineHighlightBackground': theme.surface,
      'editorLineNumber.foreground': theme.border,
      'editorLineNumber.activeForeground': theme.foreground,
      'editorIndentGuide.background1': theme.surface,
      'editorIndentGuide.activeBackground1': theme.border,
    },
    rules: [
      {token: 'keyword', foreground: blue.slice(1)},
      {token: 'comment', foreground: theme.border.slice(1)},
      {token: 'string', foreground: cyan.slice(1)},
      {token: 'string.link', foreground: blue.slice(1)},
      {token: 'variable', foreground: cyan.slice(1)},
      {token: 'strong', foreground: orange.slice(1), fontStyle: 'bold'},
      {token: 'emphasis', foreground: magenta.slice(1), fontStyle: 'italic'},
      {token: 'number', foreground: magenta.slice(1)},
      {token: 'tag', foreground: blue.slice(1)},
    ],
  };
}
