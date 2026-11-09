/**
 * Solo se enlaza o se pinta lo que es una liga http(s) de verdad. Una liga `javascript:` o `data:` que viniera
 * de una tienda (o de alguien en medio) no se abre nunca.
 */
export function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Las imágenes solo por https: la página corre en https y una imagen http saldría bloqueada. */
export function isSafeImageUrl(url: string | null | undefined): url is string {
  if (!isSafeHttpUrl(url)) return false;
  return url.startsWith('https://');
}

/** "https://www.liverpool.com.mx/x" → "liverpool.com.mx". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
