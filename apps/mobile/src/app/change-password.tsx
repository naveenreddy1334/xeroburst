// S03 Change password. Required at first sign-in and after a reset.

import { useState } from 'react';
import { Screen } from '../ui/Screen';
import { Txt } from '../ui/Txt';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner } from '../ui/States';
import { C } from '../theme/tokens';
import { useAuth } from '../state/auth';
import { api, ApiClientError } from '../lib/api';
import { validateSecretFor, secretLabel } from '@nboard/shared';
import type { AuthTokens } from '@nboard/shared';
import { toast } from '../ui/Toast';

export default function ChangePassword() {
  const user = useAuth((s) => s.user);
  const role = user?.role ?? 'PLAYER';
  const label = secretLabel(role);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const bad = validateSecretFor(role, next);
    if (!cur) return setErr(`Enter your current ${label.toLowerCase()}.`);
    if (bad) return setErr(bad);
    if (next !== again) return setErr(`The two new ${label.toLowerCase()}s do not match.`);
    if (next === cur) return setErr(`Choose a ${label.toLowerCase()} different from the current one.`);
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<Partial<AuthTokens>>('/me/password', { current_secret: cur, new_secret: next });
      if (r?.access_token && r.refresh_token) await useAuth.getState().applyTokens(r as AuthTokens);
      await useAuth.getState().loadMe();
      toast(`${label} changed.`, 'success');
    } catch (e) {
      setErr(e instanceof ApiClientError ? (e.fields.new_secret ?? e.fields.current_secret ?? e.message) : 'Could not change it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen center maxWidth={460} testID="screen-change-password">
      <Txt v="h1">Choose a new {label.toLowerCase()}</Txt>
      <Banner icon="key" color={C.highlight}>{`Hi ${user?.display_name ?? ''}. Your ${label.toLowerCase()} was set by someone else, so set your own before you continue.`}</Banner>
      <Field label={`Current ${label.toLowerCase()}`} value={cur} onChangeText={setCur} secure autoFocus preferredFocus />
      <Field label={`New ${label.toLowerCase()}`} value={next} onChangeText={setNext} secure hint={role === 'PLAYER' ? '6 or more digits. Not a simple run like 123456.' : '10 or more characters with letters and a number.'} keyboardType={role === 'PLAYER' ? 'number-pad' : undefined} tvKeyboard={role === 'PLAYER' ? 'numeric' : 'full'} />
      <Field label={`New ${label.toLowerCase()} again`} value={again} onChangeText={setAgain} secure error={err} onSubmit={save} keyboardType={role === 'PLAYER' ? 'number-pad' : undefined} tvKeyboard={role === 'PLAYER' ? 'numeric' : 'full'} />
      <Button label="Save and continue" size="lg" full loading={busy} onPress={save} />
      <Button label="Sign out" variant="ghost" icon="logout" onPress={() => useAuth.getState().logout()} />
    </Screen>
  );
}
