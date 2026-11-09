import { type ReactNode, useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiFailure } from '@/lib/api';
import { useLayout } from '@/lib/layout';
import { storeBrand, storeInitials } from '@/lib/store-brand';
import { STORE_LOGOS } from '@/lib/store-logos';
import { Image } from 'expo-image';
import { colors, family, radius, shadow, space, type } from '@/theme';

import { Icon, type IconName } from './icons';

const nativeDriver = Platform.OS !== 'web';

type Variant = keyof typeof type;

export function Txt({ variant = 'body', color = colors.ink, style, ...rest }: TextProps & { variant?: Variant; color?: string }) {
  return <Text {...rest} style={[type[variant], { color }, style]} />;
}

/** Marco de pantalla. En celular respeta la muesca; en computadora la barra de arriba ya ocupa ese lugar. */
export function Screen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  return <View style={[styles.screen, { paddingTop: wide ? 0 : insets.top }]}>{children}</View>;
}

/** Márgenes y ancho máximo del contenido de una pantalla, según el tamaño de la ventana. */
export function usePageStyle(): ViewStyle {
  const { gutter, maxWidth } = useLayout();
  return { width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: gutter, paddingBottom: space.xxxl };
}

/** Tarjeta. Si se puede tocar, se levanta al pasar el cursor y cede al presionarla. */
export function Card({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  const [hover, setHover] = useState(false);
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [styles.card, hover && styles.cardHover, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  );
}

export function Button({ label, onPress, kind = 'primary', icon }: { label: string; onPress: () => void; kind?: 'primary' | 'soft'; icon?: IconName }) {
  const fg = kind === 'primary' ? colors.onAccent : colors.brand;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, kind === 'primary' ? styles.buttonPrimary : styles.buttonSoft, pressed && styles.pressed]}>
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Txt variant="label" color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Texto que se toca (ver todos, mostrar más…). */
export function LinkText({ label, onPress, icon }: { label: string; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Txt variant="label" color={colors.brand}>
        {label}
      </Txt>
      {icon ? <Icon name={icon} size={16} color={colors.brand} /> : null}
    </Pressable>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Txt variant="heading">{title}</Txt>
      {action}
    </View>
  );
}

/** Opciones excluyentes en una fila (orden de resultados). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && styles.segmentOn]}>
            <Txt variant={selected ? 'label' : 'body'} color={selected ? colors.ink : colors.inkSoft} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Interruptor con su etiqueta. */
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={onChange} style={styles.toggle}>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
      <Txt variant="small" color={value ? colors.ink : colors.inkSoft}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** La tienda de un vistazo: su logotipo oficial sobre blanco; si no hay logotipo, su inicial sobre su color. */
export function StoreAvatar({ storeId, name, size = 32, dimmed }: { storeId: string; name: string; size?: number; dimmed?: boolean }) {
  const logo = STORE_LOGOS[storeId];
  if (logo) {
    return (
      <View style={[styles.avatar, styles.avatarLogo, { width: size, height: size, borderRadius: size * 0.3, opacity: dimmed ? 0.35 : 1 }]}>
        <Image source={logo} style={{ width: size * 0.78, height: size * 0.78 }} contentFit="contain" />
      </View>
    );
  }
  const brand = storeBrand(storeId);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size * 0.3, backgroundColor: dimmed ? colors.surfaceAlt : brand.bg },
      ]}>
      <Text style={{ fontFamily: family.extrabold, fontSize: size * 0.4, color: dimmed ? colors.inkFaint : brand.fg }}>{storeInitials(name)}</Text>
    </View>
  );
}

const BRAND_MARK = require('../../assets/images/brand-mark.png') as number;

/** Marca PrecioRadar: el logotipo real (visual aid/logo.png), solo la etiqueta azul con el radar y el carrito. */
export function Logo({ size = 36 }: { size?: number }) {
  return <Image source={BRAND_MARK} style={{ width: size, height: size }} contentFit="contain" accessibilityLabel="PrecioRadar" />;
}

/** Campo de búsqueda: lupa, texto, borrar y botón de ir. */
export function SearchField({
  value,
  onChangeText,
  onSubmit,
  onClear,
  large,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  large?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, large && styles.fieldLarge, large && shadow.field, focused && styles.fieldFocused]}>
      <Icon name="search" size={large ? 22 : 20} color={focused ? colors.brand : colors.inkFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="¿Qué quieres comprar?"
        placeholderTextColor={colors.inkFaint}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Producto a buscar"
        style={[styles.fieldInput, large && styles.fieldInputLarge, webNoOutline]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={onClear} hitSlop={10} style={styles.fieldClear}>
          <Icon name="x" size={16} color={colors.inkSoft} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Buscar"
        onPress={onSubmit}
        style={({ pressed }) => [styles.fieldGo, large && styles.fieldGoLarge, pressed && styles.pressed]}>
        <Icon name="arrow-right" size={20} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

/** Bloque gris que late mientras llega el contenido real; conserva la forma de lo que va a aparecer. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useState(() => new Animated.Value(0.55))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: nativeDriver }),
        Animated.timing(pulse, { toValue: 0.55, duration: 650, useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[styles.skeleton, style, { opacity: pulse }]} />;
}

/** Entrada suave de un elemento; `index` escalona los de una lista. */
export function FadeIn({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 320, delay: Math.min(index, 8) * 45, useNativeDriver: nativeDriver }).start();
  }, [progress, index]);
  return (
    <Animated.View
      style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

export function Notice({ icon = 'search', title, children, action }: { icon?: IconName; title: string; children?: string; action?: ReactNode }) {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeIcon}>
        <Icon name={icon} size={26} color={colors.brand} />
      </View>
      <Txt variant="heading" style={styles.center}>
        {title}
      </Txt>
      {children ? (
        <Txt color={colors.inkSoft} style={styles.center}>
          {children}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

/** Error al hablar con el servidor, dicho con lo que el usuario puede hacer al respecto. */
export function ServerProblem({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const failure = error instanceof ApiFailure ? error : null;
  const retry = <Button label="Intentar de nuevo" icon="refresh" onPress={onRetry} />;
  if (failure && !failure.unreachable) {
    return (
      <Notice icon="alert" title="No se pudo buscar" action={retry}>
        {failure.message}
      </Notice>
    );
  }
  return (
    <Notice icon="alert" title="Sin conexión con el servidor" action={retry}>
      {`Se intentó en ${failure?.serverUrl ?? 'la dirección configurada'}. Revisa que el servidor esté encendido y que este equipo esté en la misma red. La dirección se cambia en Ajustes.`}
    </Notice>
  );
}

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, ...shadow.card },
  cardHover: { ...shadow.raised, transform: [{ translateY: -2 }] },
  pressed: { opacity: 0.7 },
  center: { textAlign: 'center' },

  button: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.md, flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSoft: { backgroundColor: colors.tint },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },

  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 2 },
  segment: { flex: 1, minHeight: 40, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.surface, ...shadow.card },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  toggleTrack: { width: 40, height: 24, borderRadius: 12, backgroundColor: colors.bar, padding: 2 },
  toggleTrackOn: { backgroundColor: colors.brand },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface },
  toggleThumbOn: { marginLeft: 16 },

  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarLogo: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingLeft: space.lg,
    paddingRight: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  fieldLarge: { minHeight: 64, borderRadius: radius.xl, paddingRight: 8, borderColor: colors.surface },
  fieldFocused: { borderColor: colors.brand },
  fieldInput: { flex: 1, minWidth: 0, height: 48, color: colors.ink, fontFamily: family.medium, fontSize: 16 },
  fieldInputLarge: { fontSize: 18, height: 56 },
  fieldClear: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  fieldGo: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  fieldGoLarge: { width: 48, height: 48, borderRadius: radius.lg },

  skeleton: { backgroundColor: colors.track, borderRadius: radius.sm },

  notice: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md, maxWidth: 520, alignSelf: 'center' },
  noticeIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
});
