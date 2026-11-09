import { TabList, TabSlot, TabTrigger, type TabTriggerSlotProps, Tabs } from 'expo-router/ui';
import { type ReactNode, useState } from 'react';
import { Pressable, type PressableProps, StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { brand, colors, radius, space } from '@/theme';

import { Icon, type IconName } from './icons';
import { Logo, Txt } from './ui';

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; wide: boolean; children: ReactNode };

function TabButton({ children, isFocused, icon, wide, ...props }: TabButtonProps) {
  const [hover, setHover] = useState(false);
  const color = isFocused ? colors.brand : hover ? colors.ink : colors.inkSoft;
  return (
    <Pressable
      {...(props as PressableProps)}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={wide ? [styles.topTab, isFocused && styles.topTabOn] : styles.bottomTab}>
      <Icon name={icon} size={wide ? 18 : 22} color={color} strokeWidth={isFocused ? 2.4 : 2} />
      <Txt variant={wide ? 'label' : 'caption'} color={color}>
        {children}
      </Txt>
    </Pressable>
  );
}

/** En computadora: barra arriba con la marca. En celular: barra abajo, al alcance del pulgar. */
function Bar({ children, wide, ...props }: ViewProps & { wide: boolean }) {
  const insets = useSafeAreaInsets();
  const { gutter, maxWidth } = useLayout();
  if (wide) {
    return (
      <View {...props} style={[styles.top, { paddingTop: insets.top }]}>
        <View style={[styles.topInner, { maxWidth, paddingHorizontal: gutter }]}>
          <Logo size={34} />
          <Txt variant="heading" style={styles.brand}>
            {brand.nameParts[0]}
            <Txt variant="heading" color={colors.brand}>
              {brand.nameParts[1]}
            </Txt>
          </Txt>
          <View style={styles.topTabs}>{children}</View>
        </View>
      </View>
    );
  }
  return (
    <View {...props} style={[styles.bottom, { paddingBottom: insets.bottom }]}>
      {children}
    </View>
  );
}

export function AppNav() {
  const { wide } = useLayout();
  return (
    <Tabs style={[styles.root, { flexDirection: wide ? 'column' : 'column-reverse' }]}>
      <TabList asChild>
        <Bar wide={wide}>
          <TabTrigger name="buscar" href="/" asChild>
            <TabButton icon="search" wide={wide}>
              Buscar
            </TabButton>
          </TabTrigger>
          <TabTrigger name="descuentos" href="/descuentos" asChild>
            <TabButton icon="percent" wide={wide}>
              Descuentos
            </TabButton>
          </TabTrigger>
          <TabTrigger name="tiendas" href="/tiendas" asChild>
            <TabButton icon="bag" wide={wide}>
              Tiendas
            </TabButton>
          </TabTrigger>
          <TabTrigger name="ajustes" href="/ajustes" asChild>
            <TabButton icon="sliders" wide={wide}>
              Ajustes
            </TabButton>
          </TabTrigger>
        </Bar>
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  slot: { flex: 1 },

  top: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: 'center' },
  topInner: { width: '100%', height: 64, flexDirection: 'row', alignItems: 'center', gap: space.md },
  brand: { marginRight: space.xl },
  topTabs: { flexDirection: 'row', gap: space.xs, marginLeft: 'auto' },
  topTab: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 40, paddingHorizontal: space.lg, borderRadius: radius.md },
  topTabOn: { backgroundColor: colors.tint },

  bottom: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  bottomTab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
});
