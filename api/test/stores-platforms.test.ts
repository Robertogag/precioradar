import { describe, expect, it } from 'vitest';
import { parseMagentoProducts } from '../src/infrastructure/stores/magento.ts';
import { parseShopifySuggest } from '../src/infrastructure/stores/shopify.ts';
import { parseWooProducts } from '../src/infrastructure/stores/woocommerce.ts';

/** Respuestas reales (recortadas) del 8-nov-2026. */
describe('lectores de plataformas de tienda', () => {
  it('Shopify (Doto): sugerencias con precio, marca, foto y liga sin parámetros de rastreo', () => {
    const body = JSON.stringify({
      resources: {
        results: {
          products: [
            {
              id: 8800001,
              title: 'Apple iPhone 16 eSIM + SIM Físico',
              url: '/products/apple-iphone-16-128gb-esim-sim-fisico?_pos=1&_psq=iphone+16&_ss=e',
              vendor: 'Apple',
              available: true,
              price: '13999.00',
              price_min: '13999.00',
              compare_at_price_min: '15999.00',
              featured_image: { url: '//cdn.shopify.com/s/files/1/0604/4339/4137/files/iphone16.jpg' },
            },
            { id: 2, title: 'Agotado', url: '/products/agotado', available: false, price: '100.00' },
            { id: 3, title: 'Sin precio', url: '/products/x', available: true, price: '0.00' },
          ],
        },
      },
    });
    const offers = parseShopifySuggest(body, 'https://www.doto.com.mx');
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      externalId: '8800001',
      title: 'Apple iPhone 16 eSIM + SIM Físico',
      brand: 'Apple',
      price: 13999,
      listPrice: 15999,
      url: 'https://www.doto.com.mx/products/apple-iphone-16-128gb-esim-sim-fisico',
      imageUrl: 'https://cdn.shopify.com/s/files/1/0604/4339/4137/files/iphone16.jpg',
    });
  });

  it('Magento (Steren): precio final y regular, solo con existencia, liga armada con la clave', () => {
    const body = JSON.stringify({
      data: {
        products: {
          items: [
            {
              name: 'Cable USB tipo C a Lightning, de 1,8 m',
              sku: 'POD-460',
              url_key: 'cable-usb-tipo-c-a-lightning-de-1-8-m',
              price_range: { minimum_price: { regular_price: { value: 349, currency: 'MXN' }, final_price: { value: 299 } } },
              small_image: { url: 'https://www.steren.com.mx/media/catalog/product/p/o/pod-460.jpg' },
              stock_status: 'IN_STOCK',
            },
            { name: 'Agotado', sku: 'X', url_key: 'x', price_range: { minimum_price: { regular_price: { value: 10 }, final_price: { value: 10 } } }, stock_status: 'OUT_OF_STOCK' },
          ],
        },
      },
    });
    const offers = parseMagentoProducts(body, 'https://www.steren.com.mx');
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ externalId: 'POD-460', price: 299, listPrice: 349, currency: 'MXN', url: 'https://www.steren.com.mx/cable-usb-tipo-c-a-lightning-de-1-8-m' });
  });

  it('WooCommerce (Game Planet): los precios vienen en centavos', () => {
    const body = JSON.stringify([
      {
        id: 762262,
        name: 'CONSOLA NINTENDO SWITCH 2 EDICIÓN DEL 40 ANIVERSARIO THE LEGEND OF ZELDA NSW2',
        permalink: 'https://gameplanet.com/producto/consola-nintendo-switch-2-zelda/',
        is_in_stock: true,
        images: [{ src: 'https://gameplanet.com/wp-content/uploads/switch2.jpg' }],
        prices: { price: '1299900', regular_price: '1399900', sale_price: '1299900', currency_minor_unit: 2, currency_code: 'MXN' },
      },
      { id: 1, name: 'Agotado', permalink: 'https://gameplanet.com/producto/x/', is_in_stock: false, prices: { price: '100', currency_minor_unit: 2 } },
    ]);
    const offers = parseWooProducts(body);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ externalId: '762262', price: 12999, listPrice: 13999, currency: 'MXN', imageUrl: 'https://gameplanet.com/wp-content/uploads/switch2.jpg' });
  });
});
