export const languageNames = {'zh-Hans':'简体中文','zh-Hant':'繁體中文',en:'English',de:'Deutsch',fr:'Français',es:'Español',ja:'日本語',ko:'한국어','pt-BR':'Português (Brasil)',it:'Italiano'};
export function resolveLanguage(preference, system = []) {
  if (preference && preference !== 'system' && languageNames[preference]) return preference;
  for (const locale of system) {
    const tag = String(locale).replaceAll('_', '-').toLowerCase();
    if (/^zh(?:-|$)/.test(tag)) { const parts = tag.split('-'); return parts.includes('hant') ? 'zh-Hant' : parts.includes('hans') ? 'zh-Hans' : parts.some(part => ['tw','hk','mo'].includes(part)) ? 'zh-Hant' : 'zh-Hans'; }
    if (/^pt(?:-|$)/.test(tag)) return 'pt-BR';
    const base = tag.split('-')[0];
    if (languageNames[base]) return base;
  }
  return 'en';
}
let translations = {};
export async function loadTranslations() {
  if (!Object.keys(translations).length) {
    const response = await fetch(new URL('locales.json', document.baseURI));
    if (!response.ok) throw new Error(`Could not load translations: ${response.status}`);
    translations = await response.json();
  }
}
export function translate(language, key) { return translations[language]?.[key] ?? translations.en?.[key] ?? key; }
