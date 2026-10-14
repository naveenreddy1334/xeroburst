// S23 System: server status, board, settings, backup, devices, doctor.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import type { BackupResponse, DeviceSessionDTO, PublicSettings, SystemInfo } from '@nboard/shared';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { SubTabs } from '../../ui/SubTabs';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Chip';
import { Pill } from '../../ui/Bits';
import { Dialog } from '../../ui/Dialog';
import { Field } from '../../ui/Field';
import { Toggle } from '../../ui/Toggle';
import { Icon } from '../../ui/Icon';
import { CardH, Empty, Facts, X } from '../../ui/Bits';
import { glassLo } from '../../theme/surfaces';
import { RequirePermission } from '../../ui/RequirePermission';
import { ErrorBlock, LoadingBlock, errorText } from '../../ui/States';
import { toast } from '../../ui/Toast';
import { C } from '../../theme/tokens';
import { useDevice } from '../../theme/device';
import { api, ApiClientError } from '../../lib/api';
import { useGet, useInvalidate } from '../../lib/queries';
import { useAuth } from '../../state/auth';
import { useServer } from '../../state/server';
import { fmtTime } from '../../staff/staff-common';

export default function System() {
  return (
    <RequirePermission any={['MANAGE_SYSTEM']}>
      <SystemScreen />
    </RequirePermission>
  );
}

function SystemScreen() {
  const { u, tv } = useDevice();
  const serverUrl = useServer((s) => s.url);
  const info = useGet<SystemInfo>('/system/info', undefined, { refetchInterval: 5000 });
  const settings = useGet<PublicSettings>('/system/settings');
  const devices = useGet<{ items: DeviceSessionDTO[] }>('/system/devices');
  const refreshAll = () => { void info.refetch(); void settings.refetch(); void devices.refetch(); };
  const cell = { width: tv ? '49.2%' : '100%', flexGrow: tv ? 0 : 1, minWidth: 0 } as const;
  let host = serverUrl ?? '--';
  let port = '--';
  try { const x = new URL(serverUrl ?? ''); host = x.hostname; port = x.port || (x.protocol === 'https:' ? '443' : '80'); } catch { /* keep placeholders */ }

  return (
    <Screen refreshing={info.isRefetching && !info.isLoading} onRefresh={refreshAll} testID="screen-system" maxWidth={100000}>
      <SubTabs active="system" />
      <Header eyebrow="Server and devices" title="System" />
      <View style={{ height: u * 0.75 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u }}>
        <View style={cell}>
          <Card>
            <CardH>Server</CardH>
            {info.isLoading ? <LoadingBlock label="Reading the server" /> : info.isError || !info.data ? <ErrorBlock error={info.error} onRetry={() => void info.refetch()} /> : (
              <Facts items={[['Address', host], ['Port', port], ['Version', info.data.version], ['Firmware', info.data.board.firmware ?? '--'], ['Buttons', info.data.board.buttons != null ? String(info.data.board.buttons) : '--'], ['Server time', new Date(info.data.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })]]} />
            )}
            {!tv ? <BackupBlock /> : null}
          </Card>
        </View>
        <View style={cell}>
          <Card>
            <CardH>Settings</CardH>
            {settings.isLoading ? <LoadingBlock /> : settings.isError || !settings.data ? <ErrorBlock error={settings.error} onRetry={() => void settings.refetch()} /> : <SettingsCard data={settings.data} readOnly={false} />}
          </Card>
        </View>
      </View>
      <Card>
        <CardH>Signed-in devices</CardH>
        {devices.isLoading ? <LoadingBlock /> : devices.isError || !devices.data ? <ErrorBlock error={devices.error} onRetry={() => void devices.refetch()} /> : <DevicesList items={devices.data.items} readOnly={false} />}
      </Card>
      {info.data ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u }}>
          <View style={cell}><BoardCard info={info.data} /></View>
          <View style={cell}><Doctor info={info.data} /></View>
        </View>
      ) : null}
    </Screen>
  );
}

function BoardCard({ info }: { info: SystemInfo }) {
  const { u } = useDevice();
  const b = info.board;
  const modeLabel = b.mode === 'serial' ? 'USB board' : b.mode === 'sim' ? 'Practice board' : 'No board';
  return (
    <Card>
      <CardH em="updates every 5 seconds">Board</CardH>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5, marginBottom: u * 0.75 }}>
        <Pill t={b.connected ? 'good' : 'warn'}>{b.connected ? 'Connected' : 'Not connected'}</Pill>
        <Pill>{modeLabel}</Pill>
        {b.busy ? <Pill t="warn">Busy</Pill> : null}
      </View>
      <Facts items={[['Port', b.port ?? '--'], ['Firmware', b.firmware ?? '--'], ['Buttons', b.buttons != null ? String(b.buttons) : '--']]} />
      {b.busy && b.held_by ? <X s={0.8} c={C.sub} style={{ marginTop: u * 0.5 }}>In use by {b.held_by.name} since {fmtTime(b.held_by.since)}</X> : null}
    </Card>
  );
}

function Doctor({ info }: { info: SystemInfo }) {
  const { u } = useDevice();
  const b = info.board;
  const checks: { ok: boolean; title: string; hint?: string }[] = [
    { ok: true, title: 'Server reachable', hint: `Running ${info.name} ${info.version}.` },
    b.mode === 'sim'
      ? { ok: true, title: 'Practice board running', hint: 'Games work without hardware. Plug in the real board and restart the server to use it.' }
      : b.connected
        ? { ok: true, title: 'Board connected', hint: b.port ? `On ${b.port}.` : undefined }
        : { ok: false, title: 'Board not connected', hint: 'Plug the board in with USB and restart the server, or run npm run server:sim for a practice board.' },
    b.connected && b.buttons != null
      ? { ok: true, title: `${b.buttons} buttons detected` }
      : { ok: false, title: 'Button count unknown', hint: 'It appears once a board answers.' },
  ];
  return (
    <Card>
      <CardH>Doctor</CardH>
      <View style={{ gap: u * 0.625 }}>
        {checks.map((c, i) => (
          <View key={i} style={[{ flexDirection: 'row', gap: u * 0.75, alignItems: 'flex-start', borderRadius: u * 1.25, paddingHorizontal: u, paddingVertical: u * 0.625 }, glassLo()]}>
            <Icon name={c.ok ? 'check' : 'alert'} size={u * 1.25} color={c.ok ? C.success : C.warning} />
            <View style={{ flex: 1 }}>
              <X s={0.9} w="b">{c.title}</X>
              {c.hint ? <X s={0.8} c={C.sub}>{c.hint}</X> : null}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function SettingsCard({ data }: { data: PublicSettings; readOnly: boolean }) {
  const { u } = useDevice();
  const inv = useInvalidate();
  const [org, setOrg] = useState(data.org_name);
  const [tz, setTz] = useState(data.timezone);
  const [week, setWeek] = useState<PublicSettings['week_start']>(data.week_start);
  const [idle, setIdle] = useState(String(data.idle_timeout_min));
  const [out, setOut] = useState(data.player_logout_after_result);
  const [errs, setErrs] = useState<Record<string, string>>({});
  useEffect(() => {
    setOrg(data.org_name);
    setTz(data.timezone);
    setWeek(data.week_start);
    setIdle(String(data.idle_timeout_min));
    setOut(data.player_logout_after_result);
  }, [data]);
  const save = useMutation({ mutationFn: (b: Partial<PublicSettings>) => api.put<PublicSettings>('/system/settings', b) });

  function submit() {
    const n = Number(idle);
    if (!Number.isInteger(n) || n < 1 || n > 240) return setErrs({ idle_timeout_min: 'Enter minutes from 1 to 240.' });
    if (org.trim().length < 2) return setErrs({ org_name: 'Enter a name of at least 2 characters.' });
    setErrs({});
    save.mutate({ org_name: org.trim(), timezone: tz.trim(), week_start: week, idle_timeout_min: n, player_logout_after_result: out }, {
      onSuccess: () => { toast('Settings saved.', 'success'); void inv('/system', '/me'); void useAuth.getState().loadMe().catch(() => {}); },
      onError: (e) => { if (e instanceof ApiClientError && Object.keys(e.fields).length) setErrs(e.fields); else toast(errorText(e), 'error'); },
    });
  }

  return (
    <View>
      <Field label="Organisation name" required value={org} onChangeText={setOrg} error={errs.org_name} autoCapitalize="words" maxLength={80} />
      <Field label="Idle sign-out (minutes)" required value={idle} onChangeText={(t) => setIdle(t.replace(/\D/g, ''))} keyboardType="number-pad" tvKeyboard="numeric" error={errs.idle_timeout_min} maxLength={3} />
      <Field label="Time zone" value={tz} onChangeText={setTz} error={errs.timezone} hint="For example Asia/Kolkata" />
      <View style={{ gap: u * 0.375, marginBottom: u * 0.75 }}>
        <X s={0.85} c={C.sub}>Week starts on</X>
        <Segmented<PublicSettings['week_start']> value={week} onChange={setWeek} options={[{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u, marginBottom: u }}>
        <X s={1} w="b" style={{ flex: 1 }}>Sign players out after a result</X>
        <Toggle value={out} onChange={setOut} label="" />
      </View>
      <Button full label="Save settings" loading={save.isPending} onPress={submit} />
    </View>
  );
}

function BackupBlock() {
  const { u } = useDevice();
  const [result, setResult] = useState<BackupResponse | null>(null);
  const backup = useMutation({ mutationFn: () => api.post<BackupResponse>('/system/backup') });
  return (
    <View style={{ marginTop: u * 0.75 }}>
      <Button full variant="secondary" label="Create backup" loading={backup.isPending} onPress={() => backup.mutate(undefined, { onSuccess: (r) => { setResult(r); toast('Backup created.', 'success'); }, onError: (e) => toast(errorText(e), 'error') })} />
      {result ? <X s={0.78} c={C.sub} style={{ marginTop: u * 0.5 }}>{result.file} · {(result.bytes / 1024).toFixed(1)} KB, {fmtTime(result.created_at)}</X> : null}
    </View>
  );
}

function DevicesList({ items, readOnly }: { items: DeviceSessionDTO[]; readOnly: boolean }) {
  const { u } = useDevice();
  const meId = useAuth((s) => s.user?.id);
  const inv = useInvalidate();
  const [target, setTarget] = useState<DeviceSessionDTO | null>(null);
  const del = useMutation({ mutationFn: (id: string) => api.del(`/me/sessions/${id}`) });

  if (!items.length) return <Empty>No signed-in devices.</Empty>;
  return (
    <>
      <View style={{ gap: u * 0.5 }}>
        {items.map((d) => (
          <View key={d.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, borderRadius: u * 1.25, paddingHorizontal: u, paddingVertical: u * 0.625 }, glassLo()]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <X s={1} w="b" numberOfLines={1}>{d.device_label ?? 'Unknown device'}</X>
              <X s={0.8} c={C.sub} numberOfLines={1}>{d.current ? 'This device · ' : ''}{d.user_name}{d.platform ? ` · ${d.platform}` : ''} · {fmtTime(d.last_used_at ?? d.created_at)}</X>
            </View>
            {!readOnly && d.user_id === meId ? <Button size="sm" variant="secondary" label="Sign out" onPress={() => setTarget(d)} /> : null}
          </View>
        ))}
      </View>
      <Dialog
        visible={!!target}
        danger
        title="Sign out this device?"
        message={target?.current ? 'This is the device you are using. You will be signed out.' : `${target?.device_label ?? 'That device'} will need to sign in again.`}
        confirmLabel="Sign out"
        loading={del.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          if (!target) return;
          const t = target;
          del.mutate(t.id, {
            onSuccess: () => { setTarget(null); toast('Signed out.', 'success'); void inv('/system/devices'); if (t.current) void useAuth.getState().logout(); },
            onError: (e) => { setTarget(null); toast(errorText(e), 'error'); },
          });
        }}
      />
    </>
  );
}
