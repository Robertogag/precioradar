import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { colors, radius, space } from '@/theme';

import type { ObservedPrice } from '../../../shared/contracts';
import { Icon } from './icons';
import { StoreAvatar, Txt } from './ui';

/** Tiendas que no entregan precios al servidor pero sí a la persona que abre su página: se abren dentro de la app. */
export const ASSISTED_STORES = new Set(['mercadolibre']);

/**
 * Lee el precio que la página de Mercado Libre le está mostrando a la persona (producto o listado) y se lo pasa a la
 * app. Solo lee lo que ya está en pantalla; no navega, no toca la sesión ni manda nada por su cuenta.
 */
const READ_PRICES = `
(function () {
  function txt(sel, root) { var e = (root || document).querySelector(sel); return e ? e.textContent.trim() : ''; }
  function num(s) { var n = parseFloat((s || '').replace(/[^\\d.,]/g, '').replace(/,/g, '')); return isFinite(n) ? n : null; }
  function send(p) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(p)); }
  function priceOf(root) {
    var f = root.querySelector('.andes-money-amount__fraction');
    if (!f) return null;
    var c = root.querySelector('.andes-money-amount__cents');
    var p = num(f.textContent); if (p === null) return null;
    var cents = c ? num(c.textContent) : null;
    return cents ? p + cents / 100 : p;
  }
  function readProduct() {
    var title = txt('h1.ui-pdp-title') || txt('h1');
    var main = document.querySelector('.ui-pdp-price__second-line') || document.querySelector('[data-testid="price-part"]') || document.querySelector('.ui-pdp-price');
    var price = main ? priceOf(main) : null;
    var prevEl = document.querySelector('.ui-pdp-price__original-value') || document.querySelector('.ui-pdp-price s');
    var listPrice = prevEl ? priceOf(prevEl) : null;
    if (title && price) send({ kind: 'pdp', title: title, price: price, listPrice: listPrice, url: location.href });
  }
  function readList() {
    var cards = [].slice.call(document.querySelectorAll('li.ui-search-layout__item, .ui-search-layout__item')).slice(0, 20);
    var items = cards.map(function (li) {
      var a = li.querySelector('a.poly-component__title, a.ui-search-link__title-card, h2 a, a.ui-search-link');
      var t = txt('.poly-component__title, h2.ui-search-item__title, .ui-search-item__title', li);
      var p = li.querySelector('.poly-price__current, .ui-search-price__second-line') || li;
      var price = priceOf(p);
      return a && t && price ? { title: t, price: price, url: a.href } : null;
    }).filter(Boolean);
    if (items.length) send({ kind: 'list', items: items, url: location.href });
  }
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (/\\/p\\/MLM|articulo\\.mercadolibre|MLM-?\\d{6,}/.test(location.href)) readProduct(); else readList();
    if (tries >= 8) clearInterval(timer);
  }, 1500);
})();
true;
`;

interface Message {
  kind: 'pdp' | 'list';
  title?: string;
  price?: number;
  listPrice?: number | null;
  url?: string;
  items?: ObservedPrice[];
}

/**
 * La tienda abierta dentro de la app (Mercado Libre). Si la persona aceptó compartir, el precio que la página le
 * muestra se manda al servidor y queda para todos con su fecha; si no, solo lo ve ella.
 */
export function StoreVisitSheet({ url, storeId, storeName, onClose }: { url: string | null; storeId: string; storeName: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const country = useSettings((s) => s.country) ?? 'MX';
  const share = useSettings((s) => s.shareSeen);
  const [seen, setSeen] = useState<{ price: number; shared: number } | null>(null);
  const sent = useRef(new Set<string>());

  // En la web no hay WebView: la tienda se abre en otra pestaña y listo.
  useEffect(() => {
    if (Platform.OS === 'web' && url) {
      window.open(url, '_blank', 'noopener');
      onClose();
    }
  }, [url, onClose]);

  const onMessage = async (e: WebViewMessageEvent) => {
    if (!url) return;
    let data: Message;
    try {
      data = JSON.parse(e.nativeEvent.data) as Message;
    } catch {
      return;
    }
    const items: ObservedPrice[] =
      data.kind === 'pdp' && data.title && data.price ? [{ url: data.url ?? url, title: data.title, price: data.price, listPrice: data.listPrice ?? null }] : (data.items ?? []).slice(0, 20);
    const fresh = items.filter((i) => i.price > 0 && i.url && !sent.current.has(i.url));
    if (fresh.length === 0) return;
    for (const i of fresh) sent.current.add(i.url);
    setSeen({ price: fresh[0]!.price, shared: 0 });
    if (share !== true) return;
    try {
      const r = await api.observe(country, fresh);
      setSeen({ price: fresh[0]!.price, shared: r.accepted });
    } catch {
      /* sin red o servidor caído: la persona sigue viendo la página; no pasa nada */
    }
  };

  if (Platform.OS === 'web') return null;
  return (
    <Modal visible={url !== null} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.head}>
          <StoreAvatar storeId={storeId} name={storeName} size={28} />
          <Txt variant="label" style={styles.flex} numberOfLines={1}>
            {storeName}
          </Txt>
          {url ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Abrir en el navegador" onPress={() => void Linking.openURL(url)} hitSlop={10} style={styles.headBtn}>
              <Icon name="arrow-up-right" size={18} color={colors.brand} />
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={10} style={styles.headBtn}>
            <Icon name="x" size={20} color={colors.ink} />
          </Pressable>
        </View>
        {seen ? (
          <View style={styles.banner}>
            <Icon name="check" size={16} color={colors.saveInk} strokeWidth={3} />
            <Txt variant="small" color={colors.saveInk} style={styles.flex}>
              {seen.shared > 0
                ? `Precio visto: ${money(seen.price, 'MXN')} · compartido con los demás, gracias.`
                : share === true
                  ? `Precio visto: ${money(seen.price, 'MXN')}.`
                  : `Precio visto: ${money(seen.price, 'MXN')} · activa "compartir precios" en Ajustes para ayudar a todos.`}
            </Txt>
          </View>
        ) : null}
        {url ? (
          <WebView
            source={{ uri: url }}
            style={styles.web}
            injectedJavaScript={READ_PRICES}
            onMessage={(e) => void onMessage(e)}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  headBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.saveSoft, paddingHorizontal: space.lg, paddingVertical: space.sm },
  web: { flex: 1 },
});
