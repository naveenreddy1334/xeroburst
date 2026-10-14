// S01 Connect to server. Address field, QR scan, recent servers, a connection test.

import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AuthShell, ACard } from '../ui/Auth';
import { X } from '../ui/Bits';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Txt } from '../ui/Txt';
import { C, R } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { normalizeServerUrl, useServer } from '../state/server';
import { probeServer } from '../lib/api';

export default function Connect() {
  const { tv, u } = useDevice();
  const recent = useServer((s) => s.recent);
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const [perm, askPerm] = useCameraPermissions();

  // Opened from the laptop's own address (http://laptop:8080)? Then this page already is the server.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
    const origin = location.origin;
    void probeServer(origin, 2500)
      .then((info) => {
        if (/^(xeroburst|nboard)/i.test(info.name)) useServer.getState().setUrl(origin);
      })
      .catch(() => {});
  }, []);

  async function connect(raw: string) {
    const url = normalizeServerUrl(raw);
    if (!url) return setErr('That does not look like an address. Example: 192.168.1.20:8080');
    setBusy(true);
    setErr(null);
    try {
      const info = await probeServer(url);
      if (!/^(xeroburst|nboard)/i.test(info.name)) throw new Error('not XeroBurst');
      useServer.getState().setUrl(url);
    } catch {
      setErr(
        Platform.OS === 'web' && typeof location !== 'undefined' && location.protocol === 'https:'
          ? 'This page is secure (https) but the server is not. Open the app from the laptop address instead.'
          : 'Could not reach a XeroBurst server there. Check that the laptop server is running and that this device is on the same Wi-Fi.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function openScan() {
    const p = perm?.granted ? perm : await askPerm();
    if (p?.granted) setScan(true);
    else setErr('Camera permission is off. Type the address instead, or allow the camera in Settings.');
  }

  return (
    <AuthShell testID="screen-connect">
      <ACard>
        <X s={1.25} w="x" style={{ marginBottom: u * 0.25 }}>Connect to your server</X>
        <X s={0.9} c={C.sub} style={{ marginBottom: u }}>Enter the address shown on the laptop running XeroBurst.</X>
        <Field label="Server address" required value={addr} onChangeText={setAddr} placeholder="192.168.1.20:8080" keyboardType="url" tvKeyboard="address" onSubmit={() => connect(addr)} returnKeyType="go" preferredFocus testID="server-address" error={err} />
        <Button label="Connect" full loading={busy} onPress={() => connect(addr)} testID="connect-btn" />
        {!tv && Platform.OS !== 'web' ? <Button label="Scan the QR code" variant="secondary" full onPress={openScan} /> : null}
        {recent.length ? (
          <View style={{ gap: u * 0.5, marginTop: u * 0.75 }}>
            <X s={0.72} w="b" up c={C.faint}>Recent</X>
            {recent.map((r) => (
              <Card key={r} tone="lo" pad={0.75} onPress={() => connect(r)} accessibilityLabel={`Connect to ${r}`}>
                <X s={0.9} w="s" num>{r.replace(/^https?:\/\//, '')}</X>
              </Card>
            ))}
          </View>
        ) : null}
      </ACard>

      <Modal visible={scan} animationType="slide" onRequestClose={() => setScan(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              setScan(false);
              setAddr(data);
              void connect(data);
            }}
          />
          <View style={{ position: 'absolute', top: 54, left: 20, right: 20, alignItems: 'center', gap: 12 }}>
            <View style={{ backgroundColor: C.scrim, padding: 12, borderRadius: R.md }}>
              <Txt v="bodyStrong" align="center">Point the camera at the QR code on the laptop</Txt>
            </View>
          </View>
          <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20 }}>
            <Button label="Cancel" variant="secondary" full onPress={() => setScan(false)} />
          </View>
        </View>
      </Modal>
    </AuthShell>
  );
}
