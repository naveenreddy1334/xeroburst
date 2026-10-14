// S14 Settings: sound, haptics, motion, text size, board connection, TV preview, account, devices, server.

import { useState } from 'react';
import { Platform, View } from 'react-native';
import Constants from 'expo-constants';
import { ROLE_LABEL, secretLabel, validateSecretFor } from '@nboard/shared';
import type { AuthTokens, DeviceSessionDTO } from '@nboard/shared';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { SubTabs } from '../../ui/SubTabs';
import { Card } from '../../ui/Card';
import { Txt } from '../../ui/Txt';
import { Toggle } from '../../ui/Toggle';
import { Segmented } from '../../ui/Chip';
import type { ThemePref } from '../../state/prefs';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Dialog } from '../../ui/Dialog';
import { Avatar } from '../../ui/Avatar';
import { CardH, X } from '../../ui/Bits';
import { Select } from '../../ui/Select';
import { usePhotos } from '../../state/photos';
import { pickPhoto } from '../../lib/pickPhoto';
import { Banner, errorText } from '../../ui/States';
import { glassLo } from '../../theme/surfaces';
import { toast } from '../../ui/Toast';
import { C } from '../../theme/tokens';
import { useDevice } from '../../theme/device';
import { usePrefs } from '../../state/prefs';
import type { TransportMode } from '../../state/prefs';
import { useAuth } from '../../state/auth';
import { useServer } from '../../state/server';
import { api, ApiClientError, probeServer } from '../../lib/api';
import { useGet, useInvalidate } from '../../lib/queries';
import { cue } from '../../lib/feedback';
import { fmtDateTime } from '../../lib/format';

export default function Settings() {
  const { tv } = useDevice();
  const prefs = usePrefs();
  const user = useAuth((s) => s.user)!;
  const server = useServer((s) => s.url);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [test, setTest] = useState<string | null>(null);
  const devices = useGet<{ items: DeviceSessionDTO[] }>('/me/sessions');
  const inv = useInvalidate();
  const label = secretLabel(user.role);

  async function testServer() {
    setTest('Testing…');
    try {
      const t0 = Date.now();
      const info = await probeServer(server!);
      setTest(`Connected to ${info.name} ${info.version} in ${Date.now() - t0} ms.`);
    } catch {
      setTest('Could not reach the server.');
    }
  }

  const boardOpts = [
    { value: 'mock', label: 'Simulated board' },
    { value: 'bridge', label: 'USB serial (via laptop)' },
    { value: 'ble', label: 'Bluetooth' },
    { value: 'auto', label: 'Auto' },
  ];
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [conf, setConf] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [pwBusy, setPwBusy] = useState(false);
  const setPhoto = usePhotos((s) => s.set);
  const lbl = label.toLowerCase();

  async function savePw() {
    const e: Record<string, string> = {};
    if (!cur) e.cur = `Enter your current ${lbl}.`;
    const bad = validateSecretFor(user.role, next);
    if (bad) e.next = bad;
    if (!e.next && conf !== next) e.conf = `${label}s do not match.`;
    setErrs(e);
    if (Object.keys(e).length) return;
    setPwBusy(true);
    try {
      const r = await api.post<Partial<AuthTokens>>('/me/password', { current_secret: cur, new_secret: next });
      if (r?.access_token && r.refresh_token) await useAuth.getState().applyTokens(r as AuthTokens);
      toast(`Your ${lbl} was changed.`, 'success');
      setCur(''); setNext(''); setConf('');
    } catch (er) {
      setErrs(er instanceof ApiClientError ? { cur: er.fields.current_secret ?? '', next: er.fields.new_secret ?? (er.fields.current_secret ? '' : er.message) } : { next: 'Could not change it.' });
    } finally {
      setPwBusy(false);
    }
  }

  const cell = { width: tv ? '49.2%' : '100%', flexGrow: tv ? 0 : 1, minWidth: 0 } as const;
  const { u } = useDevice();

  return (
    <Screen testID="screen-settings" maxWidth={100000}>
      <SubTabs active="settings" />
      <Header eyebrow={ROLE_LABEL[user.role]} title="Settings" />
      <View style={{ height: u * 0.75 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u }}>
        <View style={cell}>
          <Card>
            <CardH>Profile</CardH>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: u }}>
              <Avatar name={user.display_name} size={u * 5} fs={1.1 * 15 * 1.4} photoKey="me" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <X s={1} w="b" numberOfLines={1}>{user.display_name}</X>
                <X s={0.88} c={C.sub}>{ROLE_LABEL[user.role]}</X>
                <View style={{ marginTop: u * 0.5 }}>
                  <Button size="sm" variant="secondary" label="Add profile photo" onPress={async () => { const d = await pickPhoto(); if (d) { setPhoto('me', d); toast('Photo updated on this device.', 'success'); } }} />
                </View>
              </View>
            </View>
          </Card>
        </View>
        <View style={cell}>
          <Card>
            <CardH>Change {lbl}</CardH>
            <Field label={`Current ${lbl}`} required secure value={cur} onChangeText={setCur} error={errs.cur} />
            <Field label={`New ${lbl}`} required secure value={next} onChangeText={setNext} error={errs.next} keyboardType={user.role === 'PLAYER' ? 'number-pad' : undefined} />
            <Field label={`Confirm new ${lbl}`} required secure value={conf} onChangeText={setConf} error={errs.conf} keyboardType={user.role === 'PLAYER' ? 'number-pad' : undefined} onSubmit={() => void savePw()} />
            <Button full label="Save and continue" loading={pwBusy} onPress={() => void savePw()} />
          </Card>
        </View>
        <View style={cell}>
          <Card>
            <CardH>Board connection</CardH>
            <Select label="Board connection" value={prefs.transportMode} onChange={(v) => prefs.setPref('transportMode', v as TransportMode)} options={boardOpts} />
            <View style={{ marginTop: u * 0.75 }}>
              <Button full variant="secondary" label="Test connection" onPress={() => void testServer()} />
            </View>
            {test ? <X s={0.8} c={test.startsWith('Connected') ? C.success : C.sub} style={{ marginTop: u * 0.5 }}>{test}</X> : null}
            <X s={0.78} c={C.faint} style={{ marginTop: u * 0.5 }}>Auto tries Bluetooth, then the laptop. Bluetooth needs the installed app (not Expo Go). The simulated board needs no hardware.</X>
          </Card>
        </View>
        <View style={cell}>
          <Card>
            <CardH>Session</CardH>
            <Button full variant="danger" label="Sign out" onPress={() => setSignOutOpen(true)} testID="signout-btn" />
          </Card>
        </View>
        <View style={cell}>
          <Card>
            <CardH>Feel</CardH>
            <View style={{ gap: u * 0.875 }}>
              <Toggle label="Sound" hint="Beeps and cues during rounds" value={prefs.sound} onChange={(v) => { prefs.setPref('sound', v); if (v) cue('hit'); }} />
              <Toggle label="Haptics" hint="Vibration on hits and misses" value={prefs.haptics} onChange={(v) => prefs.setPref('haptics', v)} />
              <Toggle label="Reduce motion" hint="Fewer animations and pulses" value={prefs.reduceMotion} onChange={(v) => prefs.setPref('reduceMotion', v)} />
              {prefs.transportMode === 'mock' || prefs.transportMode === 'auto' ? <Toggle label="Demo bot" hint="In Demo Mode a bot presses the buttons so you can watch a whole round" value={prefs.demoBot} onChange={(v) => prefs.setPref('demoBot', v)} /> : null}
              <View style={{ gap: u * 0.375 }}>
                <X s={0.85} c={C.sub}>Text size</X>
                <Segmented value={prefs.textSize} onChange={(v) => prefs.setPref('textSize', v)} options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }]} />
              </View>
              <View style={{ gap: u * 0.375 }}>
                <X s={0.85} c={C.sub}>Appearance</X>
                <Segmented<ThemePref> value={prefs.theme} onChange={(v) => prefs.setPref('theme', v)} options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
              </View>
              {Platform.OS !== 'web' && !Platform.isTV ? <Toggle label="Preview the TV layout" hint="Shows the big-screen layout on this device" value={prefs.tvPreview} onChange={(v) => prefs.setPref('tvPreview', v)} /> : null}
            </View>
          </Card>
        </View>
        <View style={cell}>
          <Card>
            <CardH>Signed-in devices</CardH>
            <View style={{ gap: u * 0.5 }}>
              {(devices.data?.items ?? []).map((d) => (
                <View key={d.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, borderRadius: u * 1.25, paddingHorizontal: u, paddingVertical: u * 0.625 }, glassLo()]}>
                  <View style={{ flex: 1 }}>
                    <X s={1} w="b">{d.device_label ?? d.platform ?? 'Device'}</X>
                    <X s={0.8} c={C.sub}>{d.current ? 'This device · ' : ''}Last used {fmtDateTime(d.last_used_at ?? d.created_at)}</X>
                  </View>
                  {!d.current ? <Button label="Sign out" variant="secondary" size="sm" onPress={async () => { try { await api.del(`/me/sessions/${d.id}`); void inv('/me/sessions'); } catch (e) { toast(errorText(e), 'error'); } }} /> : null}
                </View>
              ))}
              {devices.isLoading ? <X s={0.85} c={C.sub}>Loading…</X> : null}
            </View>
          </Card>
        </View>
        <View style={cell}>
          <Card>
            <CardH>Server</CardH>
            <X s={0.9} w="s">{server?.replace(/^https?:\/\//, '')}</X>
            <X s={0.8} c={C.sub} style={{ marginTop: u * 0.5 }}>To use a different server, sign out and choose Change server.</X>
          </Card>
        </View>
      </View>
      <X s={0.78} c={C.faint} style={{ textAlign: 'center' }}>XeroBurst {Constants.expoConfig?.version ?? '1.0.0'} · {Platform.OS}{Platform.isTV ? ' tv' : ''}</X>
      <Dialog visible={signOutOpen} title="Sign out?" message="You will need your ID and PIN or password to sign in again." confirmLabel="Sign out" danger onConfirm={() => { setSignOutOpen(false); void useAuth.getState().logout(); }} onCancel={() => setSignOutOpen(false)} />
      <Banner icon="shield" color={C.faint}>Your rounds are stored on the coach's laptop. Nothing is sent to the internet.</Banner>
    </Screen>
  );
}
