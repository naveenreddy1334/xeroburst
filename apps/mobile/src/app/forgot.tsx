// Forgot password. A player's request goes to the coach; staff are told to ask an admin (the server has no email).

import { useState } from 'react';
import { router } from 'expo-router';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { X } from '../ui/Bits';
import { AuthShell, ACard, Links } from '../ui/Auth';
import { C } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { api } from '../lib/api';

export default function Forgot() {
  const { u } = useDevice();
  const [id, setId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'player' | 'staff'>(null);

  async function go() {
    if (!id.trim()) return setErr('Enter your username or NB code.');
    setErr(null);
    setBusy(true);
    try {
      const r = await api.post<{ kind: 'player' | 'staff' }>('/auth/forgot', { login_id: id.trim() });
      setDone(r.kind);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell testID="screen-forgot">
      <ACard>
        <X s={1.25} w="x" style={{ marginBottom: u * 0.5 }}>Forgot password</X>
        {done ? (
          <>
            <X c={C.sub} style={{ marginBottom: u * 0.75 }}>
              {done === 'player' ? 'Your request was sent to your coach. They will give you a new PIN.' : 'Ask your Super Admin or Admin to reset your password. They can issue a new one from the Coaches or Admins page.'}
            </X>
            <Button label="Back to sign in" full onPress={() => router.replace('/login')} />
          </>
        ) : (
          <>
            <X c={C.sub} style={{ marginBottom: u * 0.75 }}>Enter your username or NB code.</X>
            <Field label="Username or NB code" required value={id} onChangeText={setId} placeholder="coach.ravi or NB-0007" onSubmit={go} returnKeyType="go" preferredFocus testID="forgot-id" error={err} />
            <Button label="Continue" full loading={busy} onPress={go} />
            <Links items={[['Back to sign in', () => router.replace('/login')]]} />
          </>
        )}
      </ACard>
    </AuthShell>
  );
}
