import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/lib/api';
import { money, plural } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { colors, family, radius, space, tabular } from '@/theme';

import type { Offer, ProductGroup, StoreLink } from '../../../shared/contracts';
import { Icon } from './icons';
import { PriceHistorySheet } from './price-history';
import { ASSISTED_STORES, StoreVisitSheet } from './store-visit';
import { Card, LinkText, Skeleton, StoreAvatar, Txt } from './ui';

/** Cuántas tiendas se enseñan antes de "ver todas". */
const ROWS_COLLAPSED = 6;

function openOffer(offer: Offer) {
  void WebBrowser.openBrowserAsync(offer.url);
}

/** "hace 35 min", "hace 3 h", "hace 2 días": de cuándo es un precio guardado. */
function sinceText(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${plural(days, 'día', 'días')}`;
}

function Thumb({ uri, size }: { uri: string | null; size: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size }]}>
      {uri ? <Image source={{ uri }} style={styles.fill} contentFit="contain" transition={180} /> : <Icon name="bag" size={size * 0.34} color={colors.bar} />}
    </View>
  );
}

/** Precio anterior tachado y porcentaje de rebaja, solo cuando la tienda publica un precio anterior. */
function Discount({ offer }: { offer: Offer }) {
  if (!offer.discountPct || !offer.listPrice) return null;
  return (
    <View style={styles.discount}>
      <Txt variant="small" color={colors.inkFaint} style={[styles.strike, tabular]}>
        {money(offer.listPrice, offer.currency)}
      </Txt>
      <View style={styles.dealChip}>
        <Icon name="percent" size={12} color={colors.deal} strokeWidth={2.6} />
        <Txt variant="caption" color={colors.deal} style={[tabular, styles.chipText]}>
          {`−${offer.discountPct}%`}
        </Txt>
      </View>
    </View>
  );
}

/** Una tienda dentro de un producto: su precio y, cuando hay varias, cuánto más cuesta que la más barata. */
function StoreRow({ offer, cheapest, comparing, minPrice }: { offer: Offer; cheapest: boolean; comparing: boolean; minPrice: number }) {
  const [hover, setHover] = useState(false);
  const extra = offer.price - minPrice;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${offer.storeName}, ${money(offer.price, offer.currency)}. Abrir en la tienda`}
      onPress={() => openOffer(offer)}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [styles.row, hover && styles.rowHover, pressed && styles.pressed]}>
      <View style={styles.rowTop}>
        <StoreAvatar storeId={offer.storeId} name={offer.storeName} size={30} />
        <View style={styles.rowName}>
          <Txt variant="label" numberOfLines={1}>
            {offer.storeName}
          </Txt>
          {offer.seller ? (
            <Txt variant="caption" color={colors.inkFaint} numberOfLines={1}>
              {`Vende ${offer.seller}`}
            </Txt>
          ) : null}
          {offer.extras.length > 0 ? (
            <Txt variant="caption" color={colors.saveInk} style={styles.chipText}>
              {`Incluye ${offer.extras.join(' + ')}`}
            </Txt>
          ) : null}
          {offer.seenAt ? (
            <Txt variant="caption" color={colors.deal} numberOfLines={1}>
              {`Precio visto ${sinceText(offer.seenAt)} · sin verificar hoy`}
            </Txt>
          ) : null}
        </View>
        <View style={styles.rowPrice}>
          <Txt variant="label" color={comparing && cheapest ? colors.save : colors.ink} style={tabular}>
            {money(offer.price, offer.currency)}
          </Txt>
          {comparing && cheapest ? (
            <View style={styles.bestChip}>
              <Icon name="check" size={11} color={colors.saveInk} strokeWidth={3} />
              <Txt variant="caption" color={colors.saveInk} style={styles.chipText}>
                Mejor precio
              </Txt>
            </View>
          ) : comparing && extra >= 1 ? (
            <Txt variant="caption" color={colors.inkFaint} style={tabular}>
              {`+${money(extra, offer.currency)}`}
            </Txt>
          ) : null}
        </View>
        <Icon name="arrow-up-right" size={16} color={hover ? colors.brand : colors.bar} />
      </View>
    </Pressable>
  );
}

/** Qué conviene más, dicho con números: el más barato, o el paquete que por poco más incluye algo. */
function Recommendation({ group }: { group: ProductGroup }) {
  const rec = group.recommendation;
  const offer = rec ? group.offers.find((o) => o.id === rec.offerId) : undefined;
  if (!rec || !offer) return null;
  const extras = rec.extras.join(' + ');
  const text =
    rec.kind === 'mejor-valor'
      ? `Te conviene ${offer.storeName}: por ${money(rec.extraCost, offer.currency)} más incluye ${extras}.`
      : rec.extras.length > 0
        ? `Te conviene ${offer.storeName}: el más barato y además incluye ${extras}.`
        : `Te conviene ${offer.storeName}: es el más barato.`;
  return (
    <View style={styles.rec}>
      <Icon name="check" size={16} color={colors.accentDeep} strokeWidth={2.6} />
      <Txt variant="small" style={styles.flex}>
        {text}
      </Txt>
    </View>
  );
}

/** Un producto: su mejor precio arriba y, debajo, el precio en cada tienda que lo tiene. */
/** Tienda que no se consulta pero sí se abre a mano (Mercado Libre): su logotipo y "Ver en…" o "Buscar en…". */
function StoreLinkRow({ link, onOpen }: { link: StoreLink; onOpen: (link: StoreLink) => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => onOpen(link)} hitSlop={10} style={({ pressed }) => [styles.storeLink, pressed && styles.pressed]}>
      <StoreAvatar storeId={link.storeId} name={link.storeName} size={22} />
      <Txt variant="label" color={colors.brand}>
        {link.kind === 'producto' ? `Ver en ${link.storeName}` : `Buscar en ${link.storeName}`}
      </Txt>
      <Icon name="arrow-up-right" size={16} color={colors.brand} />
    </Pressable>
  );
}

export function GroupCard({ group }: { group: ProductGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { best } = group;
  const comparing = group.storeCount > 1;
  const rows = expanded ? group.offers : group.offers.slice(0, ROWS_COLLAPSED);
  const hiddenRows = group.offers.length - rows.length;
  const country = useSettings((s) => s.country) ?? 'MX';
  // El buscador de la tienda viene con la búsqueda; la página exacta del producto se pide aparte y, si llega, lo sustituye.
  const resolved = useQuery({
    queryKey: ['links', country, group.title, group.brand],
    queryFn: () => api.links(group.title, group.brand, country),
    enabled: group.links.length > 0,
    staleTime: 60 * 60_000,
    retry: false,
  });
  const links = resolved.data?.links ?? group.links;
  const [visit, setVisit] = useState<StoreLink | null>(null);
  const setShareSeen = useSettings((s) => s.setShareSeen);

  // Mercado Libre se abre dentro de la app para poder leer el precio que le muestra a la persona (con su permiso);
  // las demás tiendas, en el navegador. La primera vez se pregunta, y se puede cambiar en Ajustes.
  const openLink = (link: StoreLink) => {
    if (!ASSISTED_STORES.has(link.storeId) || Platform.OS === 'web') {
      void WebBrowser.openBrowserAsync(link.url);
      return;
    }
    if (useSettings.getState().shareSeen !== null) {
      setVisit(link);
      return;
    }
    Alert.alert(
      'Compartir precios de Mercado Libre',
      'Mercado Libre no le da sus precios a PrecioRadar, pero sí te los muestra a ti. Si aceptas, al abrir Mercado Libre dentro de la app leemos el precio que te enseña y lo compartimos con los demás usuarios, con la fecha en que lo viste. No se envía nada más. Lo puedes cambiar en Ajustes.',
      [
        {
          text: 'Ahora no',
          style: 'cancel',
          onPress: () => {
            setShareSeen(false);
            setVisit(link);
          },
        },
        {
          text: 'Sí, compartir',
          onPress: () => {
            setShareSeen(true);
            setVisit(link);
          },
        },
      ],
    );
  };

  return (
    <Card style={styles.group}>
      <View style={styles.head}>
        <Thumb uri={group.imageUrl} size={104} />
        <View style={styles.headText}>
          {group.brand ? (
            <Txt variant="overline" color={colors.inkFaint} numberOfLines={1}>
              {group.brand}
            </Txt>
          ) : null}
          <Txt variant="label" numberOfLines={3}>
            {group.title}
          </Txt>
          {group.condition === 'reacondicionado' ? (
            <Txt variant="caption" color={colors.warn}>
              Reacondicionado
            </Txt>
          ) : null}
          <View style={styles.priceLine}>
            <Txt variant="price" style={tabular}>
              {money(best.price, best.currency)}
            </Txt>
            <Discount offer={best} />
          </View>
        </View>
      </View>

      {comparing && group.spread > 0 ? (
        <View style={styles.saving}>
          <Icon name="trending-down" size={18} color={colors.save} />
          <Txt variant="small" color={colors.save} style={styles.flex}>
            {`Ahorras ${money(group.spread, best.currency)} comprando en ${best.storeName}`}
          </Txt>
        </View>
      ) : null}

      <Recommendation group={group} />

      <View>
        {rows.map((o, i) => (
          <StoreRow key={o.id} offer={o} cheapest={i === 0} comparing={comparing} minPrice={group.minPrice} />
        ))}
      </View>

      <View style={styles.actions}>
        {hiddenRows > 0 || expanded ? (
          <LinkText
            label={expanded ? 'Ver menos' : `Ver ${plural(hiddenRows, 'tienda más', 'tiendas más')}`}
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            onPress={() => setExpanded(!expanded)}
          />
        ) : null}
        <LinkText label="Ver historial de precios" icon="trending-down" onPress={() => setHistoryOpen(true)} />
        {links.map((l) => (
          <StoreLinkRow key={l.storeId} link={l} onOpen={openLink} />
        ))}
      </View>
      <PriceHistorySheet group={historyOpen ? group : null} visible={historyOpen} onClose={() => setHistoryOpen(false)} />
      <StoreVisitSheet url={visit?.url ?? null} storeId={visit?.storeId ?? 'mercadolibre'} storeName={visit?.storeName ?? 'Mercado Libre'} onClose={() => setVisit(null)} />
    </Card>
  );
}

/** Silueta de un producto mientras responden las tiendas. */
export function GroupCardSkeleton() {
  return (
    <Card style={styles.group}>
      <View style={styles.head}>
        <Skeleton style={styles.skThumb} />
        <View style={[styles.headText, styles.skGap]}>
          <Skeleton style={styles.skLineShort} />
          <Skeleton style={styles.skLine} />
          <Skeleton style={styles.skPrice} />
        </View>
      </View>
      <Skeleton style={styles.skRow} />
      <Skeleton style={styles.skRow} />
    </Card>
  );
}

/** Una rebaja en la cuadrícula de descuentos: la imagen manda, el porcentaje es lo primero que se lee. */
export function DealCard({ offer, style }: { offer: Offer; style?: object }) {
  return (
    <Card onPress={() => openOffer(offer)} label={`${offer.title}, ${money(offer.price, offer.currency)} en ${offer.storeName}`} style={[styles.deal, style]}>
      <View style={styles.dealImage}>
        {offer.imageUrl ? (
          <Image source={{ uri: offer.imageUrl }} style={styles.fill} contentFit="contain" transition={180} />
        ) : (
          <Icon name="bag" size={36} color={colors.bar} />
        )}
      </View>
      <View style={styles.dealBody}>
        <Txt variant="title" color={colors.deal} style={tabular}>
          {`−${offer.discountPct ?? 0}%`}
        </Txt>
        <View style={styles.dealPrices}>
          <Txt variant="heading" style={tabular}>
            {money(offer.price, offer.currency)}
          </Txt>
          {offer.listPrice ? (
            <Txt variant="caption" color={colors.inkFaint} style={[styles.strike, tabular]}>
              {money(offer.listPrice, offer.currency)}
            </Txt>
          ) : null}
        </View>
        <Txt variant="small" color={colors.inkSoft} numberOfLines={2} style={styles.dealTitle}>
          {offer.title}
        </Txt>
        <View style={styles.dealStore}>
          <StoreAvatar storeId={offer.storeId} name={offer.storeName} size={20} />
          <Txt variant="caption" color={colors.inkSoft} numberOfLines={1} style={styles.flex}>
            {offer.storeName}
          </Txt>
        </View>
      </View>
    </Card>
  );
}

export function DealCardSkeleton({ style }: { style?: object }) {
  return (
    <Card style={[styles.deal, style]}>
      <Skeleton style={styles.skDealImage} />
      <View style={[styles.dealBody, styles.skGap]}>
        <Skeleton style={styles.skPrice} />
        <Skeleton style={styles.skLine} />
        <Skeleton style={styles.skLineShort} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  pressed: { opacity: 0.6 },
  strike: { textDecorationLine: 'line-through' },

  group: { gap: space.md },
  head: { flexDirection: 'row', gap: space.lg },
  headText: { flex: 1, gap: 3, minWidth: 0 },
  thumb: { borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.md, marginTop: space.xs },
  discount: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dealChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: colors.dealSoft, borderWidth: 1, borderColor: colors.dealFill },
  bestChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 20, borderRadius: radius.pill, backgroundColor: colors.accentSoft, marginTop: 2 },
  chipText: { fontFamily: family.bold },

  saving: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.saveSoft,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rec: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingHorizontal: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.xs, alignItems: 'center' },
  storeLink: { flexDirection: 'row', alignItems: 'center', gap: space.sm },

  row: { paddingVertical: space.sm + 2, paddingHorizontal: space.sm, marginHorizontal: -space.sm, borderRadius: radius.md, gap: space.sm },
  rowHover: { backgroundColor: colors.surfaceAlt },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowName: { flex: 1, minWidth: 0 },
  rowPrice: { alignItems: 'flex-end' },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  bar: { height: 5, borderRadius: 3 },

  deal: { padding: 0, overflow: 'hidden' },
  dealImage: { aspectRatio: 1, backgroundColor: colors.surface, padding: space.lg, alignItems: 'center', justifyContent: 'center' },
  dealBody: { padding: space.md, paddingTop: 0, gap: 2 },
  dealPrices: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.sm },
  dealTitle: { minHeight: 36, marginTop: 2 },
  dealStore: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },

  skGap: { gap: space.sm },
  skThumb: { width: 104, height: 104, borderRadius: radius.md },
  skLine: { height: 14, width: '90%' },
  skLineShort: { height: 12, width: '45%' },
  skPrice: { height: 26, width: '55%', marginTop: space.xs },
  skRow: { height: 44, borderRadius: radius.md },
  skDealImage: { aspectRatio: 1, borderRadius: 0, margin: space.md, marginBottom: space.md },
});
