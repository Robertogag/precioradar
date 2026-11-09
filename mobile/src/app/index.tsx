import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons';
import { DealCard, DealCardSkeleton, GroupCard, GroupCardSkeleton } from '@/components/offer-views';
import { Card, FadeIn, LinkText, Notice, Screen, SearchField, SectionTitle, Segmented, ServerProblem, Skeleton, StoreAvatar, Toggle, Txt, usePageStyle } from '@/components/ui';
import { api } from '@/lib/api';
import { plural, storeStatusText } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { padToColumns, useLayout } from '@/lib/layout';
import { useSettings } from '@/lib/settings';
import { colors, radius, space } from '@/theme';

import type { ProductGroup, SearchResponse, SortMode, StoreRun } from '../../../shared/contracts';

const SORTS: { value: SortMode; label: string }[] = [
  { value: 'relevancia', label: 'Coincidencia' },
  { value: 'precio', label: 'Menor precio' },
  { value: 'descuento', label: 'Descuento' },
];

const IDEAS = ['iPhone 15 128GB', 'Pantalla Samsung 55', 'Nintendo Switch 2', 'AirPods Pro', 'Laptop Lenovo', 'Licuadora Oster'];

const answered = (s: StoreRun) => s.status === 'ok' || s.status === 'sin-resultados';
const rank = (s: StoreRun) => (s.status === 'ok' ? 0 : s.status === 'sin-resultados' ? 1 : 2);

/* ───────────────────────────── Inicio ───────────────────────────── */

/** "México · Jalisco": dónde compra el usuario; toca para cambiarlo. */
function PlaceLink({ centered }: { centered: boolean }) {
  const router = useRouter();
  const s = useSettings();
  const countries = useQuery({ queryKey: ['countries', s.serverUrl], queryFn: api.countries });
  const country = countries.data?.find((c) => c.code === s.country);
  const state = country?.states.find((st) => st.code === s.state);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="Cambiar lugar" onPress={() => router.push('/ajustes')} hitSlop={8} style={[styles.place, centered && styles.placeCentered]}>
      <Icon name="pin" size={15} color={colors.brand} />
      <Txt variant="small" color={colors.brandDeep}>
        {`${country?.name ?? s.country ?? ''} · ${state?.name ?? 'Todo el país'}`}
      </Txt>
    </Pressable>
  );
}

function Row({ icon, label, onPress }: { icon: 'clock' | 'search'; label: string; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.rowItem, hover && styles.rowItemHover]}>
      <Icon name={icon} size={17} color={colors.inkFaint} />
      <Txt style={styles.flex} numberOfLines={1}>
        {label}
      </Txt>
      <Icon name="arrow-up-right" size={16} color={hover ? colors.brand : colors.bar} />
    </Pressable>
  );
}

function Home({ text, setText, submit }: { text: string; setText: (t: string) => void; submit: (q: string) => void }) {
  const router = useRouter();
  const s = useSettings();
  const page = usePageStyle();
  const { wide, dealColumns } = useLayout();
  const country = s.country ?? 'MX';
  const stores = useQuery({ queryKey: ['stores', s.serverUrl, country], queryFn: () => api.stores(country) });
  const deals = useQuery({ queryKey: ['deals', s.serverUrl, country], queryFn: () => api.deals(country) });
  const active = stores.data?.filter((st) => st.availability === 'activa') ?? [];
  // Sugerencias mientras escribe: modelos conocidos y lo que otros ya buscaron; se piden tras una pausa, no en cada tecla.
  const typed = useDebounced(text.trim(), 250);
  const suggest = useQuery({
    queryKey: ['suggest', s.serverUrl, country, typed],
    queryFn: () => api.suggest(typed, country),
    enabled: typed.length >= 2,
  });
  const suggestions = typed.length >= 2 ? (suggest.data?.suggestions ?? []).slice(0, 6) : [];
  // En computadora, sin búsquedas recientes al lado, las ideas se reparten en tres columnas.
  const ideasGrid = wide && s.recent.length === 0;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.homeScroll}>
      <View style={styles.hero}>
        <View pointerEvents="none" style={[styles.blob, styles.blobA]} />
        <View pointerEvents="none" style={[styles.blob, styles.blobB]} />
        <View style={[page, styles.heroInner, wide && styles.heroInnerWide]}>
          <PlaceLink centered={wide} />
          <Txt variant="display" style={wide && styles.heroTitleWide}>
            Encuentra el{' '}
            <Txt variant="display" color={colors.brand} style={wide && styles.heroTitleWide}>
              mejor precio
            </Txt>
          </Txt>
          <Txt color={colors.inkSoft} style={[styles.heroSub, wide && styles.center]}>
            {active.length > 0
              ? `Una búsqueda, ${active.length} tiendas. Te decimos en cuál sale más barato y cuánto ahorras.`
              : 'Una búsqueda, todas las tiendas. Te decimos en cuál sale más barato y cuánto ahorras.'}
          </Txt>
          <View style={styles.heroField}>
            <SearchField large value={text} onChangeText={setText} onSubmit={() => submit(text)} onClear={() => setText('')} />
          </View>
          {suggestions.length > 0 ? (
            <Card style={[styles.listCard, styles.suggestCard]}>
              {suggestions.map((sg) => (
                <Row key={sg.text} icon="search" label={sg.text} onPress={() => submit(sg.text)} />
              ))}
            </Card>
          ) : null}
          {active.length > 0 ? (
            <Pressable accessibilityRole="link" accessibilityLabel="Ver las tiendas" onPress={() => router.push('/tiendas')} style={[styles.heroStores, wide && styles.heroStoresWide]}>
              {active.map((st) => (
                <StoreAvatar key={st.id} storeId={st.id} name={st.name} size={wide ? 30 : 24} />
              ))}
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={[page, styles.homeBody]}>
        <View style={[styles.homeCols, wide && styles.homeColsWide]}>
          {s.recent.length > 0 ? (
            <View style={styles.homeCol}>
              <SectionTitle title="Tus búsquedas" action={<LinkText label="Borrar" onPress={s.forgetRecent} />} />
              <Card style={styles.listCard}>
                {s.recent.slice(0, 6).map((r) => (
                  <Row key={r} icon="clock" label={r} onPress={() => submit(r)} />
                ))}
              </Card>
            </View>
          ) : null}
          <View style={styles.homeCol}>
            <SectionTitle title="Ideas para empezar" />
            <Card style={[styles.listCard, ideasGrid && styles.listCardGrid]}>
              {IDEAS.map((idea) => (
                <View key={idea} style={ideasGrid ? styles.third : undefined}>
                  <Row icon="search" label={idea} onPress={() => submit(idea)} />
                </View>
              ))}
            </Card>
          </View>
        </View>

        {deals.isError ? null : (
          <View style={styles.homeSection}>
            <SectionTitle title="Descuentos de hoy" action={<LinkText label="Ver todos" icon="arrow-right" onPress={() => router.push('/descuentos')} />} />
            {wide ? (
              <View style={styles.dealsRow}>
                {deals.isPending
                  ? Array.from({ length: dealColumns }, (_, i) => <DealCardSkeleton key={i} style={styles.cell} />)
                  : deals.data.offers.slice(0, dealColumns).map((o) => <DealCard key={o.id} offer={o} style={styles.cell} />)}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} style={styles.carouselBleed}>
                {deals.isPending
                  ? Array.from({ length: 6 }, (_, i) => <DealCardSkeleton key={i} style={styles.carouselItem} />)
                  : deals.data.offers.slice(0, 12).map((o) => <DealCard key={o.id} offer={o} style={styles.carouselItem} />)}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/* ─────────────────────────── Resultados ─────────────────────────── */

/** Qué tiendas tienen el producto y qué pasó con las demás. Los monogramas en color son las que sí lo tienen. */
function StoresStrip({ stores }: { stores: StoreRun[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...stores].sort((a, b) => rank(a) - rank(b));
  const withPrice = stores.filter((s) => s.status === 'ok').length;
  const failed = stores.filter((s) => !answered(s)).length;
  return (
    <Card style={styles.strip}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.stripHead}>
        <View style={styles.flex}>
          <Txt variant="label">{`${withPrice} de ${plural(stores.length, 'tienda lo tiene', 'tiendas lo tienen')}`}</Txt>
          {failed > 0 ? (
            <Txt variant="caption" color={colors.warn}>
              {`${plural(failed, 'tienda no respondió', 'tiendas no respondieron')}: puede haber un precio mejor ahí.`}
            </Txt>
          ) : null}
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkSoft} />
      </Pressable>
      {open ? (
        <View>
          {sorted.map((s) => (
            <View key={s.storeId} style={styles.stripRow}>
              <StoreAvatar storeId={s.storeId} name={s.storeName} size={26} dimmed={s.status !== 'ok'} />
              <Txt style={styles.flex} color={s.status === 'ok' ? colors.ink : colors.inkSoft}>
                {s.storeName}
              </Txt>
              <Txt variant="small" color={s.status === 'ok' ? colors.save : answered(s) ? colors.inkFaint : colors.warn}>
                {s.status === 'ok' ? plural(s.count, 'precio', 'precios') : storeStatusText[s.status]}
              </Txt>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.stripAvatars}>
          {sorted.map((s) => (
            <StoreAvatar key={s.storeId} storeId={s.storeId} name={s.storeName} size={26} dimmed={s.status !== 'ok'} />
          ))}
        </View>
      )}
    </Card>
  );
}

/** Modelos hermanos y variantes de lo buscado (iPhone 15 → 15 Pro, 128GB / 256GB…): para saltar a comparar el exacto. */
function RelatedChips({ query, onPick }: { query: string; onPick: (q: string) => void }) {
  const s = useSettings();
  const related = useQuery({ queryKey: ['suggest', s.serverUrl, s.country, query], queryFn: () => api.suggest(query, s.country ?? 'MX') });
  const items = related.data?.related ?? [];
  if (items.length === 0) return null;
  return (
    <View style={styles.relatedWrap}>
      <Txt variant="overline" color={colors.inkFaint}>
        Compara también
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.related} style={styles.carouselBleed}>
        {items.map((r) => (
          <Pressable key={r.text} accessibilityRole="button" onPress={() => onPick(r.text)} style={styles.relatedChip}>
            <Txt variant="small">{r.text}</Txt>
            <Icon name="arrow-right" size={14} color={colors.brand} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ResultsHeader({ data, onSearch }: { data: SearchResponse; onSearch: (q: string) => void }) {
  const s = useSettings();
  const { wide } = useLayout();
  const showAcc = s.includeAccessories || data.hiddenAccessories > 0;
  const showRef = s.includeRefurbished || data.hiddenRefurbished > 0;
  const exactLabel = s.exact && data.hiddenInexact > 0 ? `Solo el producto exacto (${data.hiddenInexact} variantes fuera)` : 'Solo el producto exacto';
  return (
    <View style={styles.resultsHeader}>
      <View>
        <Txt variant="title">{`“${data.query}”`}</Txt>
        <Txt color={colors.inkSoft}>{`${plural(data.groups.length, 'producto', 'productos')} · ${plural(data.totalOffers, 'precio', 'precios')}`}</Txt>
      </View>
      <RelatedChips query={data.query} onPick={onSearch} />
      <View style={[styles.controls, wide && styles.controlsWide]}>
        <View style={wide ? styles.sortWide : undefined}>
          <Segmented options={SORTS} value={s.sort} onChange={s.setSort} />
        </View>
        <View style={styles.toggles}>
            <Toggle label={exactLabel} value={s.exact} onChange={s.toggleExact} />
            {showAcc ? (
              <Toggle
                label={s.includeAccessories ? 'Accesorios' : `Accesorios (${data.hiddenAccessories})`}
                value={s.includeAccessories}
                onChange={s.toggleAccessories}
              />
            ) : null}
            {showRef ? (
              <Toggle
                label={s.includeRefurbished ? 'Reacondicionados' : `Reacondicionados (${data.hiddenRefurbished})`}
                value={s.includeRefurbished}
                onChange={s.toggleRefurbished}
              />
            ) : null}
          </View>
      </View>
      <StoresStrip stores={data.stores} />
    </View>
  );
}

function ResultsLoading({ query }: { query: string }) {
  const page = usePageStyle();
  const { resultColumns } = useLayout();
  return (
    <ScrollView contentContainerStyle={[page, styles.list]}>
      <View style={styles.resultsHeader}>
        <View>
          <Txt variant="title">{`“${query}”`}</Txt>
          <Txt color={colors.inkSoft}>Consultando las tiendas…</Txt>
        </View>
        <Skeleton style={styles.skControls} />
      </View>
      <View style={styles.skGrid}>
        {Array.from({ length: resultColumns * 3 }, (_, i) => (
          <View key={i} style={{ width: resultColumns > 1 ? '48.8%' : '100%' }}>
            <GroupCardSkeleton />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export default function SearchScreen() {
  const s = useSettings();
  const page = usePageStyle();
  const { resultColumns } = useLayout();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  const search = useQuery({
    queryKey: ['search', s.serverUrl, s.country, s.state, query, s.sort, s.includeAccessories, s.includeRefurbished, s.exact],
    queryFn: () =>
      api.search({
        query,
        country: s.country ?? 'MX',
        state: s.state,
        sort: s.sort,
        includeAccessories: s.includeAccessories,
        includeRefurbished: s.includeRefurbished,
        exact: s.exact,
      }),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
  });

  function submit(value: string) {
    const clean = value.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) return;
    Keyboard.dismiss();
    setText(clean);
    setQuery(clean);
    s.remember(clean);
  }

  function clear() {
    setText('');
    setQuery('');
  }

  if (query.length < 2) {
    return (
      <Screen>
        <Home text={text} setText={setText} submit={submit} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.searchBar}>
        <View style={[page, styles.searchBarInner]}>
          <SearchField value={text} onChangeText={setText} onSubmit={() => submit(text)} onClear={clear} />
        </View>
      </View>

      {search.isPending ? (
        <ResultsLoading query={query} />
      ) : search.isError ? (
        <ServerProblem error={search.error} onRetry={() => void search.refetch()} />
      ) : (
        <FlatList<ProductGroup | null>
          key={resultColumns}
          numColumns={resultColumns}
          data={padToColumns(search.data.groups, resultColumns)}
          keyExtractor={(g, i) => g?.key ?? `hueco-${i}`}
          renderItem={({ item, index }) =>
            item ? (
              <FadeIn index={index} style={styles.cell}>
                <GroupCard group={item} />
              </FadeIn>
            ) : (
              <View style={styles.cell} />
            )
          }
          columnWrapperStyle={resultColumns > 1 ? styles.columns : undefined}
          ListHeaderComponent={<ResultsHeader data={search.data} onSearch={submit} />}
          ListEmptyComponent={
            <Notice title="Ninguna tienda lo tiene con ese nombre">
              Prueba con menos palabras, o con la marca y el modelo. Si hay accesorios o reacondicionados ocultos, actívalos arriba.
            </Notice>
          }
          contentContainerStyle={[page, styles.list]}
          keyboardShouldPersistTaps="handled"
          onRefresh={() => void search.refetch()}
          refreshing={search.isRefetching}
          style={search.isPlaceholderData ? styles.stale : undefined}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  homeScroll: { paddingBottom: space.xxl },
  hero: { backgroundColor: colors.tint, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999 },
  blobA: { width: 320, height: 320, top: -170, right: -110, backgroundColor: colors.accentSoft, opacity: 0.75 },
  blobB: { width: 220, height: 220, bottom: -130, left: -70, backgroundColor: colors.accent, opacity: 0.18 },
  heroInner: { paddingTop: space.xl, paddingBottom: space.xl, gap: space.sm },
  heroInnerWide: { paddingTop: space.xxxl, paddingBottom: space.xxl, maxWidth: 860, alignItems: 'center' },
  heroTitleWide: { fontSize: 52, lineHeight: 58, letterSpacing: -1.8, textAlign: 'center' },
  heroSub: { maxWidth: 520 },
  heroField: { alignSelf: 'stretch', marginTop: space.md },
  heroStores: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md },
  heroStoresWide: { justifyContent: 'center', gap: space.sm },
  center: { textAlign: 'center' },
  placeCentered: { alignSelf: 'center' },
  listCardGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  third: { width: '33.33%' },
  dealsRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  place: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: space.xs },

  homeBody: { paddingTop: space.xl, gap: space.xl, paddingBottom: 0 },
  homeCols: { gap: space.xl },
  homeColsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  homeCol: { flex: 1, gap: space.md },
  homeSection: { gap: space.md },
  listCard: { paddingVertical: space.sm, paddingHorizontal: space.sm },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 46, paddingHorizontal: space.md, borderRadius: radius.md },
  rowItemHover: { backgroundColor: colors.surfaceAlt },
  carouselBleed: { marginHorizontal: -space.lg },
  carousel: { gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  carouselItem: { width: 178 },
  suggestCard: { alignSelf: 'stretch', marginTop: space.sm },
  relatedWrap: { gap: space.xs },
  related: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  relatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },

  searchBar: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  searchBarInner: { paddingVertical: space.md, paddingBottom: space.md },
  list: { paddingTop: space.lg, gap: space.lg },
  columns: { gap: space.lg, alignItems: 'flex-start' },
  cell: { flex: 1 },
  stale: { opacity: 0.45 },

  resultsHeader: { gap: space.lg },
  controls: { gap: space.md },
  controlsWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortWide: { width: 440 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, rowGap: space.xs },

  strip: { gap: space.md, padding: space.md, paddingHorizontal: space.lg },
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stripAvatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 40 },

  skControls: { height: 48, borderRadius: radius.md },
  skGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, justifyContent: 'space-between' },
});
