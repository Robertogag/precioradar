import { describe, expect, it } from 'vitest';
import { createLinksService } from '../src/application/links.ts';
import type { StoreLinker } from '../src/application/ports.ts';
import { pickCatalogMatch, searchSlug } from '../src/domain/links.ts';
import { createMemoryCache } from '../src/infrastructure/cache/memoryCache.ts';
import { createMercadoLibreLinker, parseMeliCatalog } from '../src/infrastructure/stores/mercadolibre.ts';

describe('enlaces a tiendas que no se consultan', () => {
  it('arma el buscador de la tienda con el nombre del producto: sin acentos, símbolos ni mayúsculas', () => {
    expect(searchSlug('Pantalla Samsung 55" Crystal UHD + Soporte')).toBe('pantalla-samsung-55-crystal-uhd-soporte');
    expect(searchSlug('Televisión LG 65" (2026)')).toBe('television-lg-65-2026');
    expect(searchSlug('Consola Nintendo Switch 2 con Mario Kart World', 25)).toBe('consola-nintendo-switch-2');
    expect(searchSlug('+++')).toBe('');
  });

  it('elige el producto del catálogo que más se parece, y ninguno si nada se parece lo suficiente', () => {
    const catalog = [
      { id: 'A', name: 'Videojuego Nintendo Switch Sports' },
      { id: 'B', name: 'Consola Nintendo Switch 2 256GB' },
    ];
    expect(pickCatalogMatch(catalog, 'Consola Nintendo Switch 2 256GB')?.id).toBe('B');
    expect(pickCatalogMatch(catalog, 'Funda Hori para Nintendo Switch')).toBeNull();
    expect(pickCatalogMatch([], 'Consola Nintendo Switch 2')).toBeNull();
  });

  it('lee el catálogo de Mercado Libre: id y nombre, solo de los productos activos', () => {
    const body = JSON.stringify({
      results: [
        { id: 'MLM1', name: 'Consola Nintendo Switch 2', status: 'active' },
        { id: 'MLM2', name: 'Vieja', status: 'inactive' },
        { id: 'MLM3' },
      ],
    });
    expect(parseMeliCatalog(body)).toEqual([{ id: 'MLM1', name: 'Consola Nintendo Switch 2' }]);
  });

  it('Mercado Libre sin llaves: enlaza a su buscador por nombre y no intenta reconocer el producto', async () => {
    const linker = createMercadoLibreLinker({ clientId: undefined, clientSecret: undefined });
    expect(linker.searchUrl('Nintendo Switch 2')).toBe('https://listado.mercadolibre.com.mx/nintendo-switch-2');
    expect(linker.searchUrl('???')).toBe('https://www.mercadolibre.com.mx');
    expect(await linker.productUrl('Nintendo Switch 2', 'Nintendo', AbortSignal.timeout(100))).toBeNull();
  });

  it('la página del producto cuando la tienda lo reconoce; su buscador cuando no, cuando falla o cuando tarda; y lo recuerda', async () => {
    let calls = 0;
    const linker: StoreLinker = {
      storeId: 'x',
      storeName: 'X',
      country: 'MX',
      searchUrl: (t) => `https://x/buscar?q=${encodeURIComponent(t)}`,
      productUrl: async (title) => {
        calls++;
        if (title === 'A') return 'https://x/p/1';
        if (title === 'B') return null;
        if (title === 'C') throw new Error('HTTP 500');
        return new Promise<string | null>(() => {}); // nunca contesta: debe ganar la espera máxima
      },
    };
    const errors: string[] = [];
    const service = createLinksService({
      linkers: [linker],
      cache: createMemoryCache({ now: () => Date.now() }),
      timeoutMs: 20,
      concurrency: 2,
      hitTtlMs: 60_000,
      missTtlMs: 60_000,
      onError: (id) => errors.push(id),
    });

    expect(service.searchLinks('MX', 'A')).toEqual([{ storeId: 'x', storeName: 'X', url: 'https://x/buscar?q=A', kind: 'busqueda' }]);
    expect(service.searchLinks('US', 'A')).toEqual([]);

    expect((await service.resolve('MX', 'A', null)).links[0]).toMatchObject({ url: 'https://x/p/1', kind: 'producto' });
    expect((await service.resolve('MX', 'B', null)).links[0]).toMatchObject({ url: 'https://x/buscar?q=B', kind: 'busqueda' });
    expect((await service.resolve('MX', 'C', null)).links[0]).toMatchObject({ kind: 'busqueda' });
    expect((await service.resolve('MX', 'D', null)).links[0]).toMatchObject({ kind: 'busqueda' });
    expect(errors).toEqual(['x', 'x']);

    // Lo encontrado y lo no encontrado se recuerdan: no se vuelve a preguntar a la tienda.
    await service.resolve('MX', 'A', null);
    await service.resolve('MX', 'B', null);
    expect(calls).toBe(4);
  });

  it('no manda a la tienda más consultas a la vez que las permitidas', async () => {
    let inFlight = 0;
    let peak = 0;
    const linker: StoreLinker = {
      storeId: 'x',
      storeName: 'X',
      country: 'MX',
      searchUrl: (t) => `https://x/${t}`,
      productUrl: async (title) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return `https://x/p/${title}`;
      },
    };
    const service = createLinksService({ linkers: [linker], cache: createMemoryCache({ now: () => Date.now() }), timeoutMs: 100, concurrency: 2, hitTtlMs: 1, missTtlMs: 1 });
    await Promise.all(['1', '2', '3', '4', '5'].map((t) => service.resolve('MX', t, null)));
    expect(peak).toBe(2);
  });
});
