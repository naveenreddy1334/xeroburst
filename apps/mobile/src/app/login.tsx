// Sign in, in the design's glass card. Staff use a username, players an NB code and PIN.

import { useState } from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner } from '../ui/States';
import { X } from '../ui/Bits';
import { AuthShell, ACard, Links } from '../ui/Auth';
import { Wordmark } from '../ui/Logo';
import { C } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { useAuth } from '../state/auth';
import { useServer } from '../state/server';
import { ApiClientError } from '../lib/api';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MARK = require('../../assets/xeroburst-mark.png');

export function BrandBlock() {
  const { u } = useDevice();
  const w = Math.round(u * 13);
  return (
    <View style={{ alignItems: 'center', marginBottom: u * 1.5, gap: u * 0.5 }}>
      <Image source={MARK} accessibilityLabel="XeroBurst logo" style={{ width: w * 0.5 * 0.97, height: w * 0.5 }} resizeMode="contain" />
      <Wordmark height={w * 0.14} />
    </View>
  );
}

export default function Login() {
  const { u } = useDevice();
  const notice = useAuth((s) => s.notice);
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<{ id?: string; secret?: string; form?: string }>({});

  async function submit() {
    const e: typeof errs = {};
    if (!id.trim()) e.id = 'Enter your username or NB code.';
    if (!secret) e.secret = 'Enter your password or PIN.';
    setErrs(e);
    if (e.id || e.secret) return;
    setBusy(true);
    try {
      await useAuth.getState().login(id, secret);
    } catch (x) {
      if (x instanceof ApiClientError && x.code === 'ACCOUNT_LOCKED') {
        const s = Number(x.details?.retry_after ?? 0);
        setErrs({ form: `Too many tries. Wait ${s >= 60 ? `${Math.ceil(s / 60)} minutes` : `${s} seconds`}, or ask your coach to reset it.` });
      } else setErrs({ form: x instanceof Error ? x.message : 'Sign-in failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell deco testID="screen-login">
      <ACard>
        <BrandBlock />
        <X s={1.25} w="x" style={{ textAlign: 'center', marginBottom: u * 0.25 }}>Sign in</X>
        <X s={0.9} c={C.sub} style={{ textAlign: 'center', marginBottom: u * 1.25 }}>Staff use a username. Players use an NB code and PIN.</X>
        {notice ? <Banner icon="clock" color={C.highlight}>{notice}</Banner> : null}
        <Field label="Username or NB code" required value={id} onChangeText={setId} placeholder="coach.ravi or NB-0007" autoComplete="username" tvKeyboard="full" returnKeyType="next" preferredFocus testID="login-id" error={errs.id} />
        <Field label="Password or PIN" required value={secret} onChangeText={setSecret} secure autoComplete="current-password" tvKeyboard="full" onSubmit={submit} returnKeyType="go" testID="login-secret" error={errs.secret ?? errs.form} />
        <Button label="Sign in" full loading={busy} onPress={submit} testID="login-btn" />
        <Links items={[['Forgot password?', () => router.push('/forgot')], ['Connect to server', () => useServer.getState().setUrl(null)]]} />
      </ACard>
    </AuthShell>
  );
}
