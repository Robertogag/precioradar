import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, Screen, ServerProblem, Skeleton, StoreAvatar, Txt, usePageStyle } from '@/components/ui';
import { api } from '@/lib/api';
import { plural } from '@/lib/format';
import { useLayout } from '@/lib/layout';
import { useSettings } from '@/lib/settings';
import { colors, radius, space } from '@/theme';

import type { StoreAccess, StoreInfo } from '../../../shared/contracts';

const ACCESS: Record<StoreAccess, string> = {
  'api-oficial': 'Conexión oficial',
  'catalogo-publico': 'Catálogo público',
  'pagina-web': 'Lectura de su página',
};

function StoreTile({ store }: { store: StoreInfo }) {
  const active = store.availability === 'activa';
  return (
    <View style={styles.tile}>
      <StoreAvatar storeId={store.id} name={store.name} size={40} dimmed={!active} />
      <View style={styles.tileText}>
        <Txt variant="label" color={active ? colors.ink : colors.inkSoft}>
          {store.name}
        </Txt>
        {active ? (
          <Txt variant="caption" color={colors.inkFaint}>
            {ACCESS[store.access]}
          </Txt>
        ) : null}
        {store.note ? (
          <Txt variant="small" color={colors.inkSoft} style={styles.note}>
            {store.note}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function Section({ title, hint, stores, columns }: { title: string; hint: string; stores: StoreInfo[]; columns: number }) {
  if (stores.length === 0) return null;
  return (
    <View style={styles.section}>
      <View>
        <Txt variant="heading">{title}</Txt>
        <Txt variant="small" color={colors.inkSoft}>
          {hint}
        </Txt>
      </View>
      <Card style={styles.grid}>
        {stores.map((s) => (
          <View key={s.id} style={{ width: columns > 1 ? `${100 / columns}%` : '100%' }}>
            <StoreTile store={s} />
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function StoresScreen() {
  const country = useSettings((s) => s.country) ?? 'MX';
  const serverUrl = useSettings((s) => s.serverUrl);
  const page = usePageStyle();
  const { width } = useLayout();
  const stores = useQuery({ queryKey: ['stores', serverUrl, country], queryFn: () => api.stores(country) });

  if (stores.isError) {
    return (
      <Screen>
        <ServerProblem error={stores.error} onRetry={() => void stores.refetch()} />
      </Screen>
    );
  }

  const by = (a: StoreInfo['availability']) => stores.data?.filter((s) => s.availability === a) ?? [];
  const active = by('activa');
  const total = stores.data?.length ?? 0;
  const columnsActive = width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const columnsNotes = width >= 1000 ? 2 : 1;

  return (
    <Screen>
      <ScrollView contentContainerStyle={[page, styles.page]}>
        <View>
          <Txt variant="display">Tiendas</Txt>
          <Txt color={colors.inkSoft} style={styles.sub}>
            {stores.isPending
              ? 'Cargando…'
              : `Cada búsqueda consulta ${plural(active.length, 'tienda', 'tiendas')} al mismo tiempo. Conocemos ${total}; aquí está por qué las demás todavía no entran.`}
          </Txt>
        </View>

        {stores.isPending ? (
          <Skeleton style={styles.skBlock} />
        ) : (
          <>
            <Section title="Se consultan en cada búsqueda" hint={plural(active.length, 'tienda', 'tiendas')} stores={active} columns={columnsActive} />
            <Section
              title="Falta conectarlas"
              hint="Tienen conexión oficial; solo falta configurar las llaves en el servidor."
              stores={by('requiere-credenciales')}
              columns={columnsNotes}
            />
            <Section title="Todavía no se pueden consultar" hint="No dejan leer sus precios de forma automática." stores={by('bloqueada')} columns={columnsNotes} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.xl, gap: space.xl },
  sub: { maxWidth: 640, marginTop: space.xs },
  section: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: space.sm },
  tile: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md },
  tileText: { flex: 1, minWidth: 0, gap: 1 },
  note: { marginTop: space.xs },
  skBlock: { height: 320, borderRadius: radius.xl },
});
