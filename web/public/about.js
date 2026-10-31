(async () => {
  const params = new URL(location.href).searchParams;
  document.getElementById('version').textContent = `Version ${params.get('version') || ''}`;
  window.setAboutTheme = theme => {
    document.documentElement.dataset.theme = ['dark-background', 'smoooooth', 'solarized-dark', 'tango-dark'].includes(theme) ? 'dark' : 'light';
  };
  window.setAboutTheme(params.get('theme'));
  const response = await fetch(new URL('locales.json', document.baseURI));
  if (!response.ok) return;
  const translations = await response.json();
  window.setAboutLanguage = language => {
    const dictionary = translations[language] || translations.en;
    document.documentElement.lang = language;
    document.title = dictionary.about;
    document.getElementById('detail').textContent = dictionary.aboutDetail;
  };
  window.setAboutLanguage(window.__markdownREInitialLanguage || params.get('lang') || 'en');
})().catch(console.error);
