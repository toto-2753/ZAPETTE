/** URL passant par le proxy facultatif (voir proxy/worker.js). */
export function proxied(url: string, proxyUrl: string, token = '') {
  const base = proxyUrl.trim().replace(/\/+$/, '');
  return `${base}/?url=${encodeURIComponent(url)}${token ? `&t=${encodeURIComponent(token)}` : ''}`;
}
