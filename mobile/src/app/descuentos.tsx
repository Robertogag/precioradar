import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DealCard, DealCardSkeleton } from '@/components/offer-views';
import { FadeIn, Notice, Screen, ServerProblem, StoreAvatar, Txt, usePageStyle } from '@/components/ui';
import { api } from '@/lib/api';
import { plural } from '@/lib/format';
import { padToColumns, useLayout } from '@/lib/layout';
import { useSettings } from '@/lib/settings';
import { colors, radius, space } from '@/theme';

import type { Offer } from '../../../shared/contracts';

/** Filtro por tienda: "Todas" y una opción por cada tienda con rebajas. */
function StoreFilter({ label, storeId, selected, onPress }: { label: string; storeId?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.filter, selected && styles.filterOn]}>
      {storeId ? <StoreAvatar storeId={storeId} name={label} size={22} /> : null}
      <Txt variant={selected ? 'label' : 'body'} color={selected ? colors.brandDeep : colors.inkSoft}>
        {label}
      </Txt>
    </Pressable>
  );
}

export default function DealsScreen() {
  const country = useSettings((s) => s.country) ?? 'MX';
  const serverUrl = useSettings((s) => s.serverUrl);
  const page = usePageStyle();
  const { dealColumns } = useLayout();
  const [store, setStore] = useState<string | null>(null);
  const deals = useQuery({ queryKey: ['deals', serverUrl, country], queryFn: () => api.deals(country) });

  if (deals.isError) {
    return (
      <Screen>
        <ServerProblem error={deals.error} onRetry={() => void deals.refetch()} />
      </Screen>
    );
  }

  const all = deals.data?.offers ?? [];
  const storesWithDeals = [...new Map(all.map((o) => [o.storeId, o.storeName])).entries()];
  const visible = store ? all.filter((o) => o.storeId === store) : all;

  const header = (
    <View style={styles.header}>
      <View>
        <Txt variant="display">Descuentos de hoy</Txt>
        <Txt color={colors.inkSoft} style={styles.sub}>
          {deals.isPending
            ? 'Buscando lo más rebajado…'
            : `${plural(visible.length, 'rebaja', 'rebajas')}, de mayor a menor. El porcentaje es contra el precio anterior que publica cada tienda.`}
        </Txt>
      </View>
      {storesWithDeals.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filtersBleed}>
          <StoreFilter label="Todas" selected={store === null} onPress={() => setStore(null)} />
          {storesWithDeals.map(([id, name]) => (
            <StoreFilter key={id} label={name} storeId={id} selected={store === id} onPress={() => setStore(id)} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <FlatList<Offer | null>
        key={dealColumns}
        numColumns={dealColumns}
        data={deals.isPending ? Array<null>(dealColumns * 3).fill(null) : padToColumns(visible, dealColumns)}
        keyExtractor={(o, i) => o?.id ?? `hueco-${i}`}
        renderItem={({ item, index }) =>
          item ? (
            <FadeIn index={index % dealColumns} style={styles.cell}>
              <DealCard offer={item} />
            </FadeIn>
          ) : deals.isPending ? (
            <DealCardSkeleton style={styles.cell} />
          ) : (
            <View style={styles.cell} />
          )
        }
        columnWrapperStyle={styles.columns}
        contentContainerStyle={[page, styles.list]}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Notice icon="percent" title="Sin descuentos por ahora">
            Ninguna tienda respondió con rebajas en este momento. Vuelve a intentar en un rato.
          </Notice>
        }
        onRefresh={() => void deals.refetch()}
        refreshing={deals.isRefetching}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: space.xl, gap: space.md },
  header: { gap: space.lg, marginBottom: space.sm },
  sub: { maxWidth: 640, marginTop: space.xs },
  columns: { gap: space.md, alignItems: 'flex-start' },
  cell: { flex: 1 },
  filtersBleed: { marginHorizontal: -space.lg },
  filters: { gap: space.sm, paddingHorizontal: space.lg },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  filterOn: { borderColor: colors.brand, backgroundColor: colors.tint },
});
