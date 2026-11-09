/**
 * Prueba una búsqueda EN VIVO contra las tiendas, sin levantar el servidor ni la app.
 *   npm run probar -- "iphone 15"
 *   npm run probar -- "pantalla samsung 55" precio
 */
import type { SortMode } from '../../shared/contracts.ts';
import { compose } from '../src/composition.ts';

const [query = 'iphone 15', sort = 'relevancia'] = process.argv.slice(2);
const { service } = compose();
const res = await service.search({
  query,
  country: 'MX',
  state: null,
  sort: sort as SortMode,
  includeAccessories: false,
  includeRefurbished: false,
});

const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

console.log(`\nBúsqueda: "${res.query}"  ·  ${res.totalOffers} ofertas en ${res.groups.length} productos  ·  ${res.tookMs} ms`);
console.log(`Ocultos: ${res.hiddenAccessories} accesorios, ${res.hiddenRefurbished} reacondicionados\n`);

console.log('TIENDAS');
for (const s of res.stores) {
  console.log(`  ${s.storeName.padEnd(16)} ${s.status.padEnd(22)} ${String(s.count).padStart(3)} ofertas  ${String(s.ms).padStart(5)} ms  ${s.message ?? ''}`);
}

console.log('\nPRODUCTOS');
for (const g of res.groups.slice(0, 25)) {
  const d = g.best.discountPct ? `  -${g.best.discountPct}% (antes ${money(g.best.listPrice!)})` : '';
  console.log(`  ${money(g.minPrice).padStart(12)}  ${g.title.slice(0, 70)}${d}`);
  for (const o of g.offers) console.log(`      ${o.storeName.padEnd(14)} ${money(o.price).padStart(12)}${o.seller ? `  (vende ${o.seller})` : ''}`);
}
