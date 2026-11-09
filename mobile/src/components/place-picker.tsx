import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/lib/api';
import { useSettings } from '@/lib/settings';
import { colors, radius, space } from '@/theme';

import { Icon } from './icons';
import { Button, ServerProblem, Skeleton, Txt } from './ui';

function Option({ label, detail, selected, onPress }: { label: string; detail?: string; selected: boolean; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.option, hover && styles.optionHover, selected && styles.optionOn]}>
      {selected ? <Icon name="check" size={16} color={colors.brand} strokeWidth={3} /> : null}
      <View>
        <Txt variant={selected ? 'label' : 'body'} color={selected ? colors.brandDeep : colors.ink}>
          {label}
        </Txt>
        {detail ? (
          <Txt variant="caption" color={colors.inkSoft}>
            {detail}
          </Txt>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Elegir país y, si se quiere, estado. Se usa en la bienvenida y en Ajustes. */
export function PlacePicker({ doneLabel }: { doneLabel: string }) {
  const saved = useSettings();
  const [country, setCountry] = useState(saved.country);
  const [state, setState] = useState(saved.state);
  const [justSaved, setJustSaved] = useState(false);
  const countries = useQuery({ queryKey: ['countries', saved.serverUrl], queryFn: api.countries });

  if (countries.isPending) {
    return (
      <View style={styles.wrap}>
        <Skeleton style={styles.skTitle} />
        <View style={styles.grid}>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} style={styles.skOption} />
          ))}
        </View>
      </View>
    );
  }
  if (countries.isError) return <ServerProblem error={countries.error} onRetry={() => void countries.refetch()} />;

  // Con un solo país disponible no hay nada que elegir: queda marcado.
  const chosen = country ?? (countries.data.length === 1 ? countries.data[0]!.code : null);
  const current = countries.data.find((c) => c.code === chosen);
  const dirty = chosen !== saved.country || state !== saved.state;

  return (
    <View style={styles.wrap}>
      <Txt variant="overline" color={colors.inkFaint}>
        País
      </Txt>
      <View style={styles.grid}>
        {countries.data.map((c) => (
          <Option
            key={c.code}
            label={c.name}
            detail={`${c.activeStores} tiendas`}
            selected={c.code === chosen}
            onPress={() => {
              setCountry(c.code);
              setState(null);
              setJustSaved(false);
            }}
          />
        ))}
      </View>

      {current ? (
        <>
          <Txt variant="overline" color={colors.inkFaint} style={styles.section}>
            Estado · opcional
          </Txt>
          <Txt variant="small" color={colors.inkSoft}>
            Hoy los precios en línea son los mismos en todo el país. Tu estado queda guardado para cuando las tiendas publiquen precio o existencia por zona.
          </Txt>
          <View style={styles.grid}>
            <Option
              label="Todo el país"
              selected={state === null}
              onPress={() => {
                setState(null);
                setJustSaved(false);
              }}
            />
            {current.states.map((s) => (
              <Option
                key={s.code}
                label={s.name}
                selected={s.code === state}
                onPress={() => {
                  setState(s.code);
                  setJustSaved(false);
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.footer}>
        <Button
          label={justSaved && !dirty ? 'Guardado' : doneLabel}
          icon={justSaved && !dirty ? 'check' : undefined}
          onPress={() => {
            if (!chosen) return;
            saved.setPlace(chosen, state);
            setJustSaved(true);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  section: { marginTop: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  optionHover: { borderColor: colors.bar },
  optionOn: { borderColor: colors.brand, backgroundColor: colors.tint },
  footer: { marginTop: space.lg, alignItems: 'flex-start' },
  skTitle: { height: 14, width: 80 },
  skOption: { height: 44, width: 130, borderRadius: radius.md },
});
