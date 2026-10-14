// S17 Credentials shown once, for a new or reset player PIN and for staff temporary passwords.

import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { C, R, alpha } from '../../../theme/tokens';
import { useCredentials } from '../../../state/ui';
import { RequirePermission } from '../../../ui/RequirePermission';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Txt } from '../../../ui/Txt';
import { Banner } from '../../../ui/States';
import { toast } from '../../../ui/Toast';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function CredentialRow({ label, value, big }: { label: string; value: string; big?: boolean }) {
  async function copy() {
    try {
      await Clipboard.setStringAsync(value);
      toast(`${label} copied`, 'success');
    } catch {
      toast('Could not copy. Write it down instead.', 'error');
    }
  }
  return (
    <View style={{ gap: 8, backgroundColor: C.surface2, borderRadius: R.lg, borderWidth: 1.5, borderColor: alpha(C.primary, 0.5), padding: 16 }}>
      <Txt v="label">{label}</Txt>
      <Txt v="num" size={big ? 40 : 32} color={C.highlight} selectable style={{ letterSpacing: 2 }} accessibilityLabel={`${label}: ${value.split('').join(' ')}`}>
        {value}
      </Txt>
      <Button label={`Copy ${label}`} icon="copy" variant="secondary" size="sm" onPress={copy} />
    </View>
  );
}

function CredentialsCard() {
  const router = useRouter();
  const item = useCredentials((s) => s.item);

  useEffect(() => {
    if (!item) router.replace('/players' as never);
  }, [item, router]);

  if (!item) return null;

  const done = () => {
    const back = item.back;
    useCredentials.getState().clear();
    router.replace(back as never);
  };

  async function print() {
    if (!item) return;
    const html = `<html><body style="font-family:sans-serif;padding:32px"><h2>${esc(item.name)}</h2><p>${esc(item.kind === 'player' ? 'Player ID' : 'Login ID')}</p><h1 style="font-family:monospace">${esc(item.loginId)}</h1><p>${esc(item.secretLabel)}</p><h1 style="font-family:monospace">${esc(item.secret)}</h1><p>${esc(item.note ?? 'Keep this safe. It is not shown again.')}</p></body></html>`;
    try {
      if (Platform.OS === 'web') {
        const g = globalThis as unknown as { open?: (u: string, t: string) => { document: { write: (h: string) => void; close: () => void }; focus: () => void; print: () => void } | null };
        const w = g.open?.('', '_blank');
        if (!w) return toast('Allow pop-ups to print.', 'error');
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      } else {
        await Print.printAsync({ html });
      }
    } catch {
      toast('Printing is not available here.', 'error');
    }
  }

  const idLabel = item.kind === 'player' ? 'Player ID' : 'Login ID';

  return (
    <Screen maxWidth={640} testID="screen-credentials">
      <Header title={item.kind === 'player' ? 'Player credentials' : 'Temporary password'} subtitle={item.name} />
      <Banner icon="alert" color={C.warning}>{`This is shown once. Copy or print it now. ${item.secretLabel === 'PIN' ? 'You can reset the PIN later.' : 'It must be changed at first sign-in.'}`}</Banner>
      <Card style={{ gap: 14 }}>
        <CredentialRow label={idLabel} value={item.loginId} />
        <CredentialRow label={item.secretLabel} value={item.secret} big />
        {item.note ? <Txt v="small">{item.note}</Txt> : null}
      </Card>
      <Button label="Print" icon="print" variant="secondary" full onPress={print} />
      <Button label="Done" icon="check" size="lg" full preferredFocus onPress={done} />
    </Screen>
  );
}

export default function Credentials() {
  return (
    <RequirePermission any={['MANAGE_PLAYERS', 'MANAGE_COACHES', 'MANAGE_ADMINS']}>
      <CredentialsCard />
    </RequirePermission>
  );
}
