import type { ObservationsResponse, ObservedPrice } from '../../../shared/contracts.ts';
import { ASSISTED_STORES, type AssistedStore, assistedLink } from '../domain/assisted.ts';
import type { PriceRecord, SearchHistory } from './ports.ts';

export interface ObservationsDeps {
  history: SearchHistory;
  stores?: AssistedStore[];
  onError?: (err: unknown) => void;
}

/** Un precio creíble para lo que se vende en estas tiendas: ni centavos sueltos ni millones. */
const MIN_PRICE = 1;
const MAX_PRICE = 2_000_000;

/**
 * Precios vistos por personas: la app abre la página de una tienda asistida (Mercado Libre) y manda lo que la tienda
 * le mostró. Se valida la liga (dominio y producto), el precio y el título, y se guarda como precio con origen
 * 'usuario'; la búsqueda lo enseña como respaldo con fecha cuando la tienda no contesta al servidor (siempre, hoy).
 */
export function createObservationsService(deps: ObservationsDeps) {
  const stores = deps.stores ?? ASSISTED_STORES;

  async function record(country: string, items: ObservedPrice[]): Promise<ObservationsResponse> {
    const rows: PriceRecord[] = [];
    const rejected: ObservationsResponse['rejected'] = [];
    for (const item of items) {
      const link = assistedLink(item.url, stores);
      if (!link) {
        rejected.push({ url: item.url, reason: 'liga-desconocida' });
        continue;
      }
      const price = Number(item.price);
      if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) {
        rejected.push({ url: item.url, reason: 'precio-increible' });
        continue;
      }
      const title = item.title.replace(/\s+/g, ' ').trim();
      if (title.length < 3) {
        rejected.push({ url: item.url, reason: 'sin-titulo' });
        continue;
      }
      const list = item.listPrice != null && Number.isFinite(item.listPrice) && item.listPrice > price && item.listPrice <= MAX_PRICE ? item.listPrice : null;
      rows.push({
        country,
        storeId: link.store.id,
        externalId: link.externalId,
        title: title.slice(0, 200),
        brand: null,
        price: Math.round(price * 100) / 100,
        listPrice: list,
        currency: (item.currency ?? 'MXN').toUpperCase().slice(0, 3),
        url: link.cleanUrl,
        source: 'usuario',
      });
    }
    // Una misma persona puede mandar el mismo producto varias veces en una visita: se queda el primero de cada producto.
    const byItem = new Map<string, PriceRecord>();
    for (const r of rows) {
      const key = `${r.storeId}|${r.externalId}`;
      if (!byItem.has(key)) byItem.set(key, r);
    }
    const unique = [...byItem.values()];
    if (unique.length > 0) {
      try {
        await deps.history.recordPrices(unique);
      } catch (err) {
        deps.onError?.(err);
        return { accepted: 0, rejected: [...rejected, ...unique.map((r) => ({ url: r.url, reason: 'no-se-pudo-guardar' }))] };
      }
    }
    return { accepted: unique.length, rejected };
  }

  return { record };
}

export type ObservationsService = ReturnType<typeof createObservationsService>;
