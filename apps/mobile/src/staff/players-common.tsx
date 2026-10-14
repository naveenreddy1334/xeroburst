// Small shared pieces for the staff screens: players, programs, activity and overview.

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { GAMES, GAME_SLUGS } from '@nboard/shared';
import type { GameSlug, GameState, IconName } from '@nboard/shared';
import { C } from '../theme/tokens';
import { ApiClientError } from '../lib/api';
import { useInvalidate } from '../lib/queries';
import { Badge, Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Txt } from '../ui/Txt';
import { Banner, errorText } from '../ui/States';
import { toast } from '../ui/Toast';
import { useFocus } from '../ui/useFocus';

export const TV_NOTICE = 'Open this page on a phone, tablet or laptop to make changes.';

export function TvNotice() {
  return <Banner icon="eye" color={C.highlight}>{TV_NOTICE}</Banner>;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '--';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Column basis for card grids (works with flexWrap and gap 12). */
export function gridStyle(cols: number) {
  const basis = cols >= 4 ? '23.5%' : cols === 2 ? '48.5%' : '100%';
  return { flexGrow: 1, flexBasis: basis, maxWidth: basis } as const;
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function IconButton({ icon, label, onPress, rotate, color = C.text, disabled }: { icon: IconName; label: string; onPress: () => void; rotate?: number; color?: string; disabled?: boolean }) {
  const { focused, handlers } = useFocus();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      {...handlers}
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.surface2,
        borderWidth: focused ? 2.5 : 1.5,
        borderColor: focused ? C.primary : C.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}>
        <Icon name={icon} size={20} color={color} />
      </View>
    </Pressable>
  );
}

/** The four games as chips in their accent colours. */
export function GameChips({ value, onToggle }: { value: GameSlug[]; onToggle?: (g: GameSlug) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {GAME_SLUGS.map((s) => (
        <Chip key={s} label={GAMES[s].name} icon={GAMES[s].icon} color={GAMES[s].accent} selected={value.includes(s)} onPress={onToggle ? () => onToggle(s) : undefined} />
      ))}
    </View>
  );
}

export function GameBadges({ games }: { games: GameSlug[] }) {
  if (!games.length) return <Txt v="small">No games</Txt>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {games.map((g) => (
        <Badge key={g} label={GAMES[g].name} icon={GAMES[g].icon} color={GAMES[g].accent} />
      ))}
    </View>
  );
}

export function StateBadge({ state }: { state: GameState }) {
  if (state === 'locked') return <Badge label="Locked" icon="lock" color={C.lockedText} />;
  if (state === 'completed') return <Badge label="Completed" icon="trophy" color={C.highlight} />;
  return <Badge label="Unlocked" icon="check" color={C.success} />;
}

/** Field messages that no input shows (everything except the listed keys). */
export function FieldErrors({ fields, skip = [] }: { fields: Record<string, string>; skip?: string[] }) {
  const rest = Object.entries(fields).filter(([k]) => !skip.includes(k));
  if (!rest.length) return null;
  return (
    <View style={{ gap: 4 }}>
      {rest.map(([k, m]) => (
        <Txt key={k} v="small" color={C.danger}>
          {m}
        </Txt>
      ))}
    </View>
  );
}

/**
 * Runs a write: tracks which action is busy, toasts errors, keeps field messages from a 422,
 * and refreshes the listed path prefixes afterwards.
 */
export function useAction(prefixes: string[]) {
  const inv = useInvalidate();
  const [busy, setBusy] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function run<T>(key: string, fn: () => Promise<T>, ok?: string): Promise<{ ok: true; value: T } | { ok: false }> {
    setBusy(key);
    setFields({});
    try {
      const value = await fn();
      await inv(...prefixes);
      if (ok) toast(ok, 'success');
      return { ok: true, value };
    } catch (e) {
      setFields(e instanceof ApiClientError ? e.fields : {});
      toast(errorText(e), 'error');
      return { ok: false };
    } finally {
      setBusy(null);
    }
  }
  return { run, busy, fields, clearFields: () => setFields({}) };
}
