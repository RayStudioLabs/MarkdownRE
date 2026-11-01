// The Markdown renderer emits URL-escaped paths. Decode each component before
// encoding it for the local resource server so escapes are applied exactly once.
export function localImageURL(base, src) {
  if (!src || /^(?:https?:|data:|blob:|\/\/)/i.test(src)) return src;
  return base + src.split('/').map(segment => {
    try { return encodeURIComponent(decodeURIComponent(segment)); }
    catch { return encodeURIComponent(segment); }
  }).join('/');
}
