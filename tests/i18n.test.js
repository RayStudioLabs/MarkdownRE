import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {languageNames, resolveLanguage} from '../web/src/i18n.js';
import {formatMarkdown} from '../web/src/formatting.js';
const dictionaries = JSON.parse(fs.readFileSync(new URL('../web/public/locales.json', import.meta.url), 'utf8'));
test('all supported languages provide every translation', () => {
  const keys = Object.keys(dictionaries.en).sort();
  assert.deepEqual(Object.keys(dictionaries).sort(), Object.keys(languageNames).sort());
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), keys, language);
    for (const [key, value] of Object.entries(dictionary)) assert.ok(typeof value === 'string' && value.trim(), `${language}.${key}`);
  }
});
test('language choice and system locale resolution', () => {
  assert.equal(resolveLanguage('de', ['ja-JP']), 'de');
  assert.equal(resolveLanguage('system', ['zh-Hant-HK']), 'zh-Hant');
  assert.equal(resolveLanguage('system', ['zh-TW']), 'zh-Hant');
  assert.equal(resolveLanguage('system', ['zh-CN']), 'zh-Hans');
  assert.equal(resolveLanguage('system', ['zh-Hans-TW']), 'zh-Hans');
  assert.equal(resolveLanguage('system', ['zh-Hant-CN']), 'zh-Hant');
  assert.equal(resolveLanguage('system', ['pt-PT']), 'pt-BR');
  assert.equal(resolveLanguage('system', ['sv-SE', 'fr-CA']), 'fr');
  assert.equal(resolveLanguage('system', ['sv-SE']), 'en');
});
test('localized insertion selects the complete first table heading', () => {
  const labels = dictionaries.de;
  const result = formatMarkdown('', 0, 0, 'table', labels);
  assert.equal(result.text.slice(result.start, result.end), `${labels.tableHeader} 1`);
  assert.match(formatMarkdown('', 0, 0, 'image', labels).text, /Bildbeschreibung/);
});
