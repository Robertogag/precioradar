import { describe, expect, it } from 'vitest';
import { hostOf, isSafeHttpUrl, isSafeImageUrl } from './url.ts';

describe('ligas seguras', () => {
  it('solo http(s) con dominio', () => {
    expect(isSafeHttpUrl('https://www.liverpool.com.mx/tienda/pdp/x/1')).toBe(true);
    expect(isSafeHttpUrl('http://tienda.mx/p')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html;base64,AAAA')).toBe(false);
    expect(isSafeHttpUrl('ftp://x.mx/a')).toBe(false);
    expect(isSafeHttpUrl('/relativa')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });

  it('las imágenes además deben ser https', () => {
    expect(isSafeImageUrl('https://m.media-amazon.com/x.jpg')).toBe(true);
    expect(isSafeImageUrl('http://m.media-amazon.com/x.jpg')).toBe(false);
  });

  it('hostOf quita el www', () => {
    expect(hostOf('https://www.liverpool.com.mx/x')).toBe('liverpool.com.mx');
    expect(hostOf('no es url')).toBe('');
  });
});
