import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppNav } from '@/components/nav';
import { PlacePicker } from '@/components/place-picker';
import { Card, Logo, Screen, Txt, usePageStyle } from '@/components/ui';
import { useSettings } from '@/lib/settings';
import { brand, colors, space } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000, refetchOnWindowFocus: false } },
});

/** Primera vez: se elige país (y estado si se quiere) antes de entrar. */
function Welcome() {
  const page = usePageStyle();
  return (
    <Screen>
      <ScrollView contentContainerStyle={[page, styles.welcome]}>
        <View style={styles.welcomeBrand}>
          <Logo size={56} />
          <Txt variant="title">
            {brand.nameParts[0]}
            <Txt variant="title" color={colors.brand}>
              {brand.nameParts[1]}
            </Txt>
          </Txt>
        </View>
        <View style={styles.welcomeText}>
          <Txt variant="display">{brand.tagline}</Txt>
          <Txt color={colors.inkSoft}>Busca lo que quieres comprar y ve al instante en qué tienda sale más barato. Primero dinos dónde compras.</Txt>
        </View>
        <Card>
          <PlacePicker doneLabel="Empezar" />
        </Card>
      </ScrollView>
    </Screen>
  );
}

export default function RootLayout() {
  const hydrated = useSettings((s) => s.hydrated);
  const country = useSettings((s) => s.country);
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (Platform.OS === 'web') document.title = `${brand.name} · ${brand.tagline}`;
  }, []);

  // Si la tipografía no carga (sin red, por ejemplo) la app abre igual con la del sistema.
  const ready = hydrated && (fontsLoaded || fontError !== null);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={DefaultTheme}>
        <StatusBar style="dark" />
        {!ready ? <View style={styles.blank} /> : country ? <AppNav /> : <Welcome />}
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.bg },
  welcome: { maxWidth: 760, paddingTop: space.xxl, gap: space.xl },
  welcomeText: { gap: space.sm },
  welcomeBrand: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
