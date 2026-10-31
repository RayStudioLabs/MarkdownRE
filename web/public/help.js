(async () => {
  const response = await fetch(new URL('locales.json', document.baseURI));
  if (!response.ok) return;
  const translations = await response.json();
  window.setHelpLanguage = language => {
    const dictionary = translations[language] || translations.en;
    document.documentElement.lang = language;
    document.title = dictionary.syntax;
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = dictionary[element.dataset.i18n] || translations.en[element.dataset.i18n];
  };
  window.setHelpLanguage(window.__markdownREInitialLanguage || new URL(location.href).searchParams.get('lang') || 'en');
})().catch(console.error);
