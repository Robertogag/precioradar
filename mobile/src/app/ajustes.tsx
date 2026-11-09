import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PlacePicker } from '@/components/place-picker';
import { Button, Card, Screen, Toggle, Txt, usePageStyle } from '@/components/ui';
import { resolveServerUrl } from '@/lib/api';
import { useSettings } from '@/lib/settings';
import { colors, family, radius, space } from '@/theme';

export default function SettingsScreen() {
  const serverUrl = useSettings((s) => s.serverUrl);
  const setServerUrl = useSettings((s) => s.setServerUrl);
  const shareSeen = useSettings((s) => s.shareSeen);
  const setShareSeen = useSettings((s) => s.setShareSeen);
  const page = usePageStyle();
  const [draft, setDraft] = useState(serverUrl);
  const [saved, setSaved] = useState(false);
  const [focused, setFocused] = useState(false);
  const queryClient = useQueryClient();

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[page, styles.page]}>
        <Txt variant="display">Ajustes</Txt>

        <View style={styles.section}>
          <View>
            <Txt variant="heading">Dónde compras</Txt>
            <Txt variant="small" color={colors.inkSoft}>
              Define qué tiendas se consultan.
            </Txt>
          </View>
          <Card>
            <PlacePicker doneLabel="Guardar lugar" />
          </Card>
        </View>

        <View style={styles.section}>
          <View>
            <Txt variant="heading">Mercado Libre</Txt>
            <Txt variant="small" color={colors.inkSoft}>
              Mercado Libre no le da sus precios a PrecioRadar, pero sí te los muestra a ti.
            </Txt>
          </View>
          <Card style={styles.serverCard}>
            <Toggle label="Compartir el precio que veo al abrir Mercado Libre en la app" value={shareSeen === true} onChange={() => setShareSeen(shareSeen !== true)} />
            <Txt variant="small" color={colors.inkSoft}>
              Cuando abres un producto de Mercado Libre dentro de la app, se lee el precio que te enseña la página y se comparte con los demás usuarios con la fecha en que lo viste. No se envía nada más de tu cuenta ni de tu teléfono.
            </Txt>
          </Card>
        </View>

        <View style={styles.section}>
          <View>
            <Txt variant="heading">Servidor</Txt>
            <Txt variant="small" color={colors.inkSoft}>{`En uso: ${resolveServerUrl(serverUrl)}`}</Txt>
          </View>
          <Card style={styles.serverCard}>
            <Txt variant="small" color={colors.inkSoft}>
              Normalmente no hay que tocarlo: la app encuentra sola al servidor. Escribe una dirección solo si lo moviste a otro equipo.
            </Txt>
            <View style={styles.serverRow}>
              <TextInput
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  setSaved(false);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="http://192.168.1.50:4000"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="Dirección del servidor"
                style={[styles.input, focused && styles.inputFocused, webNoOutline]}
              />
              <Button
                label={saved ? 'Guardado' : 'Guardar'}
                icon={saved ? 'check' : undefined}
                kind="soft"
                onPress={() => {
                  setServerUrl(draft);
                  setSaved(true);
                  void queryClient.invalidateQueries();
                }}
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

const styles = StyleSheet.create({
  page: { paddingTop: space.xl, gap: space.xl, maxWidth: 860 },
  section: { gap: space.md },
  serverCard: { gap: space.md },
  serverRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: {
    flex: 1,
    minWidth: 220,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: family.medium,
    fontSize: 15,
  },
  inputFocused: { borderColor: colors.brand },
});
