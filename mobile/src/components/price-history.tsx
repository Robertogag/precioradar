import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { api } from '@/lib/api';
import { labelIndexes, monotonePath, niceTicks } from '@/lib/chart';
import { money, plural } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { colors, family, radius, space, tabular } from '@/theme';

import type { ProductGroup } from '../../../shared/contracts';
import { type HistorySeries, type SeriesSelection, defaultSelection, eligibleSeries, orderSeries, toggleSeries } from '../../../shared/history-series';
import { Icon } from './icons';
import { Button, LinkText, Segmented, Skeleton, StoreAvatar, Txt } from './ui';

/** Paleta categórica validada (daltonismo y contraste): un color por tienda, en orden fijo. */
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
/** Con pocas series el área bajo la curva ayuda a leer; con muchas, se encima y estorba. */
const AREAS_UP_TO = 2;

type Preset = 'd7' | 'd30' | 'd90' | 'y1' | 'all' | 'custom';
const PRESET_DAYS: Record<'d7' | 'd30' | 'd90' | 'y1', number> = { d7: 7, d30: 30, d90: 90, y1: 365 };
/** Los cinco atajos caben en una fila de celular; elegir fechas va como liga aparte. */
const PRESETS: { value: Exclude<Preset, 'custom'>; label: string }[] = [
  { value: 'd7', label: '7d' },
  { value: 'd30', label: '30d' },
  { value: 'd90', label: '90d' },
  { value: 'y1', label: '1 año' },
  { value: 'all', label: 'Todo' },
];

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
const todayMx = () => dayFmt.format(new Date());
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
function fmtDay(day: string, long = false): string {
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-MX', long ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

/** Diferencia entre el último precio y el anterior de la misma tienda; null si solo hay un dato. */
const change = (points: { price: number }[]): number | null => (points.length >= 2 ? points[points.length - 1]!.price - points[points.length - 2]!.price : null);

/** ▼ bajó (verde), ▲ subió (rojo), = igual (gris), frente al precio anterior. */
function DeltaText({ value, currency, compact = false }: { value: number | null; currency: string; compact?: boolean }) {
  if (value === null) return null;
  const dir = value < 0 ? 'down' : value > 0 ? 'up' : 'flat';
  const color = dir === 'down' ? colors.save : dir === 'up' ? colors.danger : colors.inkFaint;
  const symbol = dir === 'down' ? '▼' : dir === 'up' ? '▲' : '=';
  return (
    <Txt variant="caption" color={color} style={tabular}>
      {compact || dir === 'flat' ? symbol : `${symbol} ${money(Math.abs(value), currency)}`}
    </Txt>
  );
}

const H = 250;
const PAD = { top: 16, right: 16, bottom: 28, left: 58 };

/**
 * Historial de precios del grupo: una curva por tienda sobre los días que tienen datos (no sobre el calendario,
 * para que los huecos no aplasten la gráfica), mínimo y máximo a la vista, toque por día y tabla.
 */
function HistoryBody({ group, currency }: { group: ProductGroup; currency: string }) {
  const country = useSettings((s) => s.country) ?? 'MX';
  const today = todayMx();
  const [preset, setPreset] = useState<Preset>('d90');
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const [includeBundles, setIncludeBundles] = useState(false);
  /** Lo que el usuario mostró u ocultó, válido solo para este conjunto de series (`sig`); si cambian, vuelve lo de entrada. */
  const [override, setOverride] = useState<{ sig: string; sel: SeriesSelection } | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [picked, setPicked] = useState<number | null>(null);
  const [width, setWidth] = useState(360);

  const coverage = useQuery({ queryKey: ['coverage', country], queryFn: () => api.coverage(country) });
  const since = coverage.data?.since ?? null;
  const customOk = isDay(custom.from) && isDay(custom.to) && custom.from <= custom.to;
  const range =
    preset === 'all'
      ? { from: since ?? today, to: today }
      : preset === 'custom'
        ? customOk
          ? custom
          : { from: addDays(today, -29), to: today }
        : { from: addDays(today, -(PRESET_DAYS[preset] - 1)), to: today };

  const ids = useMemo(() => group.offers.map((o) => o.id), [group]);
  const history = useQuery({
    queryKey: ['history', country, ids.join(','), range.from, range.to],
    queryFn: () => api.history(ids, country, range.from, range.to),
  });

  // Series por precio (la más barata primero); de entrada solo el producto solo en las 6 tiendas más baratas.
  const series = useMemo(() => orderSeries(history.data?.items ?? [], group.offers), [history.data, group]);
  const eligible = useMemo(() => eligibleSeries(series, includeBundles), [series, includeBundles]);
  const bundles = series.filter((s) => s.bundle).length;
  const sig = `${includeBundles}|${series.map((s) => s.key).join(',')}`;
  const sel = override?.sig === sig ? override.sel : defaultSelection(series, includeBundles);
  const toggle = (key: string) => setOverride({ sig, sel: toggleSeries(sel, eligible, key) });
  const visible = eligible.filter((s) => sel.shown.includes(s.key));
  const color = (s: HistorySeries) => PALETTE[((sel.slots[s.key] ?? 1) - 1) % PALETTE.length]!;
  const label = (s: HistorySeries) => (s.bundle ? `${s.storeName} · paquete` : s.storeName);

  // Eje X categórico: solo los días con algún dato, repartidos parejo.
  const days = useMemo(() => [...new Set(visible.flatMap((s) => s.item.points.map((p) => p.date)))].sort(), [visible]);
  const dayAt = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);
  const n = days.length;
  const W = width;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const sx = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const allPoints = visible.flatMap((s) => s.item.points.map((p) => ({ s, p }))).sort((a, b) => a.p.price - b.p.price);
  const pMin = allPoints.length ? allPoints[0]!.p.price : 0;
  const pMax = allPoints.length ? allPoints[allPoints.length - 1]!.p.price : 1;
  const padY = Math.max((pMax - pMin) * 0.12, pMax * 0.03);
  const y0 = Math.max(0, pMin - padY);
  const y1 = pMax + padY;
  const sy = (price: number) => PAD.top + (1 - (price - y0) / (y1 - y0)) * innerH;
  const yTicks = niceTicks(y0, y1, 3).filter((v) => v > y0 && v < y1);
  const labels = labelIndexes(n, W < 400 ? 4 : 7);
  const lowest = allPoints[0];
  const highest = allPoints[allPoints.length - 1];
  const latest = visible.map((s) => ({ s, p: s.item.points[s.item.points.length - 1]! })).sort((a, b) => a.p.price - b.p.price)[0];
  const shortMoney = (v: number) => (v >= 10_000 ? `$${Math.round(v / 1000)}k` : money(v, currency));

  function onTouch(e: GestureResponderEvent) {
    if (n === 0) return;
    const px = e.nativeEvent.locationX;
    let best = 0;
    let dist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(sx(i) - px);
      if (d < dist) {
        dist = d;
        best = i;
      }
    }
    setPicked(best);
  }

  const sinceText = since && since !== today ? `Hay precios guardados desde el ${fmtDay(since, true)}.` : 'Los precios se empezaron a guardar hoy.';

  return (
    <View style={styles.body}>
      <Txt variant="overline" color={colors.inkFaint}>
        Periodo
      </Txt>
      {preset === 'custom' ? null : <Segmented options={PRESETS} value={preset} onChange={setPreset} />}
      {preset === 'custom' ? (
        <View style={styles.dates}>
          <TextInput value={custom.from} onChangeText={(v) => setCustom({ ...custom, from: v })} placeholder="AAAA-MM-DD" placeholderTextColor={colors.inkFaint} style={styles.dateInput} accessibilityLabel="Desde" />
          <Txt color={colors.inkFaint}>–</Txt>
          <TextInput value={custom.to} onChangeText={(v) => setCustom({ ...custom, to: v })} placeholder="AAAA-MM-DD" placeholderTextColor={colors.inkFaint} style={styles.dateInput} accessibilityLabel="Hasta" />
        </View>
      ) : null}
      <LinkText label={preset === 'custom' ? 'Volver a los últimos 90 días' : 'Elegir fechas'} icon={preset === 'custom' ? 'x' : 'chevron-right'} onPress={() => setPreset(preset === 'custom' ? 'd90' : 'custom')} />

      {history.isPending ? (
        <Skeleton style={{ height: H, borderRadius: radius.md }} />
      ) : history.isError ? (
        <Txt color={colors.inkSoft} style={styles.empty}>
          No se pudo cargar el historial.
        </Txt>
      ) : series.length === 0 ? (
        <Txt color={colors.inkSoft} style={styles.empty}>
          {`Todavía no hay historial de este producto en el periodo elegido. Los precios se guardan cada vez que alguien lo busca y cada madrugada; vuelve en unos días. ${sinceText}`}
        </Txt>
      ) : (
        <View style={styles.chart}>
          <View style={styles.chartHead}>
            <View style={styles.chartTitle}>
              <Icon name="trending-down" size={18} color={colors.ink} />
              <Txt variant="label">Historial de precios</Txt>
            </View>
            {lowest && highest ? (
              <View style={styles.stats}>
                <Txt variant="small" color={colors.inkSoft}>
                  Mín{' '}
                  <Txt variant="small" color={colors.accentDeep} style={styles.bold}>
                    {money(lowest.p.price, currency)}
                  </Txt>
                </Txt>
                <Txt variant="small" color={colors.inkSoft}>
                  Máx{' '}
                  <Txt variant="small" color={colors.danger} style={styles.bold}>
                    {money(highest.p.price, currency)}
                  </Txt>
                </Txt>
              </View>
            ) : null}
          </View>

          <View style={styles.legend}>
            {eligible.map((s) => {
              const on = sel.shown.includes(s.key);
              return (
                <Pressable key={s.key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => toggle(s.key)} style={[styles.leg, !on && styles.legOff]}>
                  {on ? (
                    <View style={[styles.swatch, { backgroundColor: color(s) }]} />
                  ) : (
                    <Txt variant="small" color={colors.brand} style={styles.legPlus}>
                      +
                    </Txt>
                  )}
                  <StoreAvatar storeId={s.item.storeId} name={s.storeName} size={20} dimmed={!on} />
                  <Txt variant="small" color={on ? colors.ink : colors.inkSoft}>
                    {s.storeName}
                    {s.bundle ? (
                      <Txt variant="small" color={colors.inkFaint}>
                        {' · paquete'}
                      </Txt>
                    ) : null}
                  </Txt>
                  <Txt variant="small" color={colors.inkSoft} style={tabular}>
                    {money(s.item.last, currency)}
                  </Txt>
                  <DeltaText value={change(s.item.points)} currency={currency} />
                </Pressable>
              );
            })}
            {bundles > 0 ? (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: includeBundles }} onPress={() => setIncludeBundles((v) => !v)} style={[styles.leg, styles.legToggle]}>
                <Txt variant="small" color={colors.brand}>
                  {includeBundles ? 'Quitar paquetes' : `Incluir paquetes (${bundles})`}
                </Txt>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.viewRow}>
            <Segmented
              options={[
                { value: 'chart', label: 'Gráfica' },
                { value: 'table', label: 'Tabla' },
              ]}
              value={view}
              onChange={setView}
            />
          </View>

          {view === 'chart' ? (
            <View onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(280, Math.round(e.nativeEvent.layout.width)))}>
              <Pressable onPress={onTouch} accessibilityRole="image" accessibilityLabel="Gráfica del historial de precios">
                <Svg width={W} height={H}>
                  <Defs>
                    {visible.map((s) => (
                      <LinearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={color(s)} stopOpacity={0.28} />
                        <Stop offset="1" stopColor={color(s)} stopOpacity={0} />
                      </LinearGradient>
                    ))}
                  </Defs>
                  {yTicks.map((v) => (
                    <G key={v}>
                      <Line x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} stroke={colors.line} strokeWidth={1} />
                      <SvgText x={PAD.left - 6} y={sy(v) + 4} fontSize={11} fontFamily={family.semibold} fill={colors.inkFaint} textAnchor="end">
                        {shortMoney(v)}
                      </SvgText>
                    </G>
                  ))}
                  {labels.map((i) => (
                    <SvgText key={days[i]} x={sx(i)} y={H - 8} fontSize={11} fontFamily={family.semibold} fill={colors.inkFaint} textAnchor="middle">
                      {fmtDay(days[i]!)}
                    </SvgText>
                  ))}
                  {picked !== null ? <Line x1={sx(picked)} x2={sx(picked)} y1={PAD.top} y2={H - PAD.bottom} stroke={colors.inkFaint} strokeDasharray="3 3" /> : null}
                  {visible.map((s) => {
                    const pts = s.item.points.map((p) => ({ x: sx(dayAt.get(p.date) ?? 0), y: sy(p.price) }));
                    const path = monotonePath(pts);
                    const base = H - PAD.bottom;
                    return (
                      <G key={s.key}>
                        {pts.length > 1 && visible.length <= AREAS_UP_TO ? (
                          <Path d={`${path} L${pts[pts.length - 1]!.x},${base} L${pts[0]!.x},${base} Z`} fill={`url(#g-${s.key})`} />
                        ) : null}
                        {pts.length > 1 ? <Path d={path} stroke={color(s)} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
                        {s.item.points.map((p, i) => (
                          <Circle key={p.date} cx={pts[i]!.x} cy={pts[i]!.y} r={picked === dayAt.get(p.date) ? 6 : 4} fill={color(s)} stroke={colors.surfaceAlt} strokeWidth={2} />
                        ))}
                      </G>
                    );
                  })}
                </Svg>
              </Pressable>
              {picked !== null ? (
                <View style={styles.tip}>
                  <Txt variant="label">{fmtDay(days[picked]!, true)}</Txt>
                  {visible.map((s) => {
                    const p = s.item.points.find((x) => x.date === days[picked]);
                    return p ? (
                      <View key={s.key} style={styles.tipRow}>
                        <View style={[styles.swatch, { backgroundColor: color(s) }]} />
                        <Txt variant="small" style={styles.flex}>
                          {label(s)}
                        </Txt>
                        <Txt variant="label" style={tabular}>
                          {money(p.price, currency)}
                        </Txt>
                      </View>
                    ) : null;
                  })}
                </View>
              ) : (
                <Txt variant="caption" color={colors.inkFaint} style={styles.hint}>
                  Toca la gráfica para ver el precio de un día. Toca una tienda para ocultarla.
                </Txt>
              )}
            </View>
          ) : (
            <View style={styles.table}>
              <View style={[styles.tr, styles.th]}>
                <Txt variant="caption" color={colors.inkSoft} style={styles.tdDate}>
                  Fecha
                </Txt>
                {visible.map((s) => (
                  <Txt key={s.key} variant="caption" color={colors.inkSoft} style={styles.td} numberOfLines={1}>
                    {label(s)}
                  </Txt>
                ))}
              </View>
              {[...days].reverse().map((d) => (
                <View key={d} style={styles.tr}>
                  <Txt variant="small" style={styles.tdDate}>
                    {fmtDay(d)}
                  </Txt>
                  {visible.map((s) => {
                    const p = s.item.points.find((x) => x.date === d);
                    const isMin = p && lowest && p.price === lowest.p.price;
                    // Frente al día anterior con dato de esa tienda: ▼ bajó, ▲ subió, = igual.
                    const k = dayAt.get(d) ?? 0;
                    const prevDay = days[k - 1];
                    const prev = prevDay ? s.item.points.find((x) => x.date === prevDay) : undefined;
                    return (
                      <Txt key={s.key} variant="small" color={isMin ? colors.accentDeep : colors.ink} style={[styles.td, tabular, isMin && styles.bold]}>
                        {p ? money(p.price, currency) : '—'}
                        {p && prev ? ' ' : ''}
                        {p && prev ? <DeltaText value={p.price - prev.price} currency={currency} compact /> : null}
                      </Txt>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          <View style={styles.summary}>
            {latest ? <Txt variant="small" color={colors.inkSoft}>{`Último precio más bajo: ${money(latest.p.price, currency)} en ${label(latest.s)} (${fmtDay(latest.p.date, true)}).`}</Txt> : null}
            {lowest ? <Txt variant="small" color={colors.inkSoft}>{`Mínimo del periodo: ${money(lowest.p.price, currency)} el ${fmtDay(lowest.p.date, true)} en ${label(lowest.s)}.`}</Txt> : null}
            <Txt variant="small" color={colors.inkSoft}>{`${plural(n, 'día con datos', 'días con datos')} · ${sinceText}`}</Txt>
          </View>
        </View>
      )}
    </View>
  );
}

/** Hoja a pantalla completa con el historial de un producto. */
export function PriceHistorySheet({ group, visible, onClose }: { group: ProductGroup | null; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.sheet, { paddingTop: Math.max(insets.top, space.md) }]}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <Txt variant="overline" color={colors.inkFaint}>
              Historial de precios
            </Txt>
            {group ? (
              <Txt variant="heading" numberOfLines={2}>
                {group.title}
              </Txt>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={10} style={styles.close}>
            <Icon name="x" size={20} color={colors.inkSoft} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
          {group ? <HistoryBody group={group} currency={group.best.currency} /> : null}
          <View style={styles.footer}>
            <Button label="Cerrar" kind="soft" onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontFamily: family.bold },
  sheet: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: space.lg, gap: space.lg },
  body: { gap: space.md },
  dates: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dateInput: { flex: 1, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, color: colors.ink, fontFamily: family.medium, fontSize: 15 },
  empty: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space.md },
  chart: { gap: space.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: space.md },
  chartHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  chartTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stats: { flexDirection: 'row', gap: space.lg },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  legOff: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  legPlus: { width: 12, textAlign: 'center', lineHeight: 14 },
  legToggle: { borderStyle: 'dashed' },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  viewRow: { maxWidth: 220 },
  tip: { marginTop: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, gap: 4, borderWidth: 1, borderColor: colors.line },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hint: { marginTop: space.sm, textAlign: 'center' },
  table: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: space.sm },
  th: { backgroundColor: colors.surfaceAlt },
  tdDate: { width: 72 },
  td: { flex: 1, textAlign: 'right' },
  summary: { gap: 4 },
  footer: { alignItems: 'flex-start' },
});
