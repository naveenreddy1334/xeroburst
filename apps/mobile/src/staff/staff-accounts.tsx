// Shared body of the Coaches and Admins screens, laid out like the design: a head with "New coach/admin", an inline create form,
// and one card per account (photo, contact lines, Reset password, Mark inactive with a reason / Reactivate).
// Kept from before: edit details, revoke sessions, role change and the "can create coaches" grant.

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { LOGIN_ID_PATTERN, ROLE_LABEL, canCreateRole, canManageRole } from '@nboard/shared';
import type { CreatedStaffResponse, HubDTO, Permission, Role, UserDTO } from '@nboard/shared';
import { Screen } from '../ui/Screen';
import { Header } from '../ui/Header';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Chip';
import { Dialog } from '../ui/Dialog';
import { Field } from '../ui/Field';
import { Toggle } from '../ui/Toggle';
import { Txt } from '../ui/Txt';
import { Avatar } from '../ui/Avatar';
import { CardH, Empty, Pill, X } from '../ui/Bits';
import { RequirePermission } from '../ui/RequirePermission';
import { ErrorBlock, LoadingBlock, errorText } from '../ui/States';
import { toast } from '../ui/Toast';
import { C } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { api, ApiClientError } from '../lib/api';
import { useGet, useInvalidate, usePaged } from '../lib/queries';
import { Select } from '../ui/Select';
import { useAuth, useCan } from '../state/auth';
import { usePresetHub } from '../state/shell';
import { useCredentials } from '../state/ui';
import { usePhotos } from '../state/photos';
import { pickPhoto } from '../lib/pickPhoto';
import { fmtTime } from './staff-common';
import { checkStaffCore, numOrUndef } from '../lib/validate';

interface Props {
  role: 'COACH' | 'ADMIN';
  title: string;
  noun: string;
  permission: Permission;
  backPath: string;
}

type Dlg = null | 'edit' | 'reset' | 'revoke';
const isLocked = (u: UserDTO) => !!u.locked_until && new Date(u.locked_until).getTime() > Date.now();

export function StaffAccounts(props: Props) {
  return (
    <RequirePermission any={[props.permission]}>
      <Inner {...props} />
    </RequirePermission>
  );
}

function Inner({ role, title, noun, backPath }: Props) {
  const { u, tv } = useDevice();
  const router = useRouter();
  const me = useAuth((s) => s.user);
  const permissions = useAuth((s) => s.permissions);
  const can = useCan();
  const actor = useMemo(() => ({ role: (me?.role ?? 'PLAYER') as Role, permissions }), [me?.role, permissions]);
  const list = usePaged<UserDTO>('/users', { role, limit: 50 });
  const [creating, setCreating] = useState(role === 'COACH' && !!usePresetHub.getState().id);
  const canCreate = canCreateRole(actor, role);

  return (
    <Screen refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} testID={`screen-${role.toLowerCase()}s`} maxWidth={100000}>
      <Header
        eyebrow={role === 'COACH' ? 'Super Admin and Admin' : 'Super Admin only'}
        title={title}
        subtitle="Name, email, phone and age are required. No weight is needed."
        right={canCreate ? <Button label={`New ${noun}`} onPress={() => setCreating(!creating)} /> : undefined}
      />
      <View style={{ height: u * 0.75 }} />
      {creating ? <CreateCard role={role} noun={noun} backPath={backPath} onClose={() => setCreating(false)} pushCredentials={() => router.push('/players/credentials' as never)} /> : null}
      {list.isLoading ? (
        <LoadingBlock label={`Loading ${noun}s`} />
      ) : list.isError ? (
        <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
      ) : list.items.length === 0 ? (
        <Empty>No {noun}s yet.</Empty>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u }}>
          {list.items.map((x) => (
            <View key={x.id} style={{ width: tv ? '49.2%' : '100%', flexGrow: tv ? 0 : 1, minWidth: 0 }}>
              <AccountCard
                u={x}
                noun={noun}
                readOnly={!canManageRole(actor, x.role)}
                canGrant={role === 'COACH' && can('MANAGE_COACHES')}
                canChangeRole={me?.role === 'SUPER_ADMIN' && role === 'ADMIN'}
                backPath={backPath}
                pushCredentials={() => router.push('/players/credentials' as never)}
              />
            </View>
          ))}
        </View>
      )}
      {list.hasNextPage ? <Button label="Load more" variant="secondary" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}
    </Screen>
  );
}

function AccountCard({ u: acct, noun, readOnly, canGrant, canChangeRole, backPath, pushCredentials }: { u: UserDTO; noun: string; readOnly: boolean; canGrant: boolean; canChangeRole: boolean; backPath: string; pushCredentials: () => void }) {
  const { u } = useDevice();
  const inv = useInvalidate();
  const setPhoto = usePhotos((s) => s.set);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [deact, setDeact] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [name, setName] = useState(acct.display_name);
  const [email, setEmail] = useState(acct.email ?? '');
  const [phone, setPhone] = useState(acct.phone ?? '');
  const [age, setAge] = useState(acct.age == null ? '' : String(acct.age));
  const [hub, setHub] = useState(acct.hub?.id ?? '');
  const [editErrs, setEditErrs] = useState<Record<string, string>>({});
  const canHub = useCan()('MANAGE_HUBS') && acct.role === 'COACH';
  const hubs = useGet<{ items: HubDTO[] }>('/hubs', undefined, { enabled: canHub });
  const hubOpts = [{ value: '', label: 'No hub' }, ...(hubs.data?.items ?? []).filter((h) => h.is_active || h.id === acct.hub?.id).map((h) => ({ value: h.id, label: h.name }))];
  const locked = isLocked(acct);
  const canCreateCoaches = acct.grants.includes('CREATE_COACHES');

  const patch = useMutation({ mutationFn: (b: Record<string, unknown>) => api.patch<UserDTO>(`/users/${acct.id}`, b) });
  const perms = useMutation({ mutationFn: (v: boolean) => api.put(`/users/${acct.id}/permissions`, { create_coaches: v }) });
  const reset = useMutation({ mutationFn: () => api.post<{ temp_password: string }>(`/users/${acct.id}/reset-credentials`) });
  const revoke = useMutation({ mutationFn: () => api.post(`/users/${acct.id}/revoke-sessions`) });
  const fail = (e: unknown) => toast(errorText(e), 'error');
  const refresh = () => void inv('/users');
  const savePatch = (b: Record<string, unknown>, ok: string, done?: () => void) =>
    patch.mutate(b, {
      onSuccess: () => { toast(ok, 'success'); refresh(); done?.(); },
      onError: (e) => { if (e instanceof ApiClientError && Object.keys(e.fields).length) setEditErrs(e.fields); else fail(e); setDlg(null); },
    });

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75 }}>
        <Avatar name={acct.display_name} size={u * 2.75} fs={0.85 * 15} photoKey={acct.login_id} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <X s={1} w="b" numberOfLines={1}>{acct.display_name}</X>
          <X s={0.78} c={C.sub} numberOfLines={1}>{acct.login_id}</X>
        </View>
        <Pill t={acct.is_active ? 'good' : 'off'}>{acct.is_active ? 'Active' : 'Inactive'}</Pill>
      </View>
      {acct.role === 'COACH' ? <View style={{ marginTop: u * 0.5, flexDirection: 'row' }}><Pill>{acct.hub ? acct.hub.name : 'No hub yet'}</Pill></View> : null}
      <View style={{ marginTop: u * 0.75 }}>
        <X s={0.9} c={C.sub} style={{ lineHeight: u * 1.4 * 0.9 * 1.4 }}>{acct.email ?? 'no email on file'}</X>
        <X s={0.9} c={C.sub} style={{ lineHeight: u * 1.4 * 0.9 * 1.4 }}>{acct.phone ?? 'no phone on file'} · age {acct.age ?? '--'}</X>
        {locked ? <X s={0.8} c={C.warning}>Locked until {fmtTime(acct.locked_until)}</X> : null}
      </View>

      {readOnly ? null : (
        <>
          {acct.is_active ? (
            deact ? (
              <View style={{ marginTop: u * 0.75 }}>
                <Field label="Reason for inactive" required multiline value={reason} onChangeText={(v) => { setReason(v); setReasonErr(''); }} placeholder={noun === 'coach' ? 'e.g. On leave until 1 Nov' : 'e.g. On leave'} error={reasonErr} autoCapitalize="sentences" />
                <View style={{ flexDirection: 'row', gap: u * 0.5 }}>
                  <View style={{ flex: 1 }}>
                    <Button size="sm" variant="danger" full label="Mark inactive" loading={patch.isPending} onPress={() => (reason.trim().length < 3 ? setReasonErr('Enter a reason, for example injury or away until a date.') : savePatch({ is_active: false, reason: reason.trim() }, 'Marked inactive.', () => { setDeact(false); setReason(''); }))} />
                  </View>
                  <Button size="sm" variant="ghost" label="Cancel" onPress={() => setDeact(false)} />
                </View>
              </View>
            ) : (
              <View style={{ marginTop: u * 0.75, flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
                <Button size="sm" variant="secondary" label="Change photo" onPress={async () => { const d = await pickPhoto(); if (d) { setPhoto(acct.login_id, d); toast('Photo updated on this device.', 'success'); } }} />
                <Button size="sm" variant="secondary" label="Reset password" onPress={() => setDlg('reset')} />
                <Button size="sm" variant="danger" label="Mark inactive" onPress={() => setDeact(true)} />
                <Button size="sm" variant="secondary" label="Edit details" onPress={() => { setName(acct.display_name); setEmail(acct.email ?? ''); setPhone(acct.phone ?? ''); setAge(acct.age == null ? '' : String(acct.age)); setHub(acct.hub?.id ?? ''); setEditErrs({}); setDlg('edit'); }} />
                <Button size="sm" variant="secondary" label="Revoke sessions" onPress={() => setDlg('revoke')} />
              </View>
            )
          ) : (
            <View style={{ marginTop: u * 0.75, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5 }}>
              <X s={0.88} c={C.sub} style={{ flexShrink: 1 }}>Reason: {acct.inactive_reason ?? '--'}</X>
              <Button size="sm" variant="secondary" label="Reactivate" loading={patch.isPending} onPress={() => savePatch({ is_active: true }, 'Reactivated.')} />
            </View>
          )}
          {canChangeRole && (acct.role === 'ADMIN' || acct.role === 'COACH') ? (
            <View style={{ marginTop: u * 0.75, gap: u * 0.25 }}>
              <X s={0.78} w="b" c={C.faint}>Role</X>
              <Segmented<'ADMIN' | 'COACH'> value={acct.role as 'ADMIN' | 'COACH'} onChange={(r) => r !== acct.role && savePatch({ role: r }, `Now ${ROLE_LABEL[r]}.`)} options={[{ value: 'ADMIN', label: 'Admin' }, { value: 'COACH', label: 'Coach' }]} />
            </View>
          ) : null}
          {canGrant ? (
            <View style={{ marginTop: u * 0.75 }}>
              <Toggle label="Can create coaches" hint="Lets this coach add other coach accounts." value={canCreateCoaches} disabled={perms.isPending} onChange={(v) => perms.mutate(v, { onSuccess: () => { toast(v ? 'Granted.' : 'Removed.', 'success'); refresh(); }, onError: fail })} />
            </View>
          ) : null}
        </>
      )}

      <Dialog visible={dlg === 'edit'} title="Edit details" confirmLabel="Save" loading={patch.isPending} onCancel={() => setDlg(null)} onConfirm={() => {
        const e = checkStaffCore({ display_name: name, email, phone, age }, acct.role === 'ADMIN' ? 'ADMIN' : 'COACH');
        setEditErrs(e);
        if (Object.keys(e).length) return;
        savePatch({ display_name: name.trim(), email: email.trim(), phone: phone.trim(), age: numOrUndef(age), ...(canHub ? { hub_id: hub || null } : {}) }, 'Details saved.', () => setDlg(null));
      }}>
        <Txt v="small">Fields marked * are required.</Txt>
        <Field label="Display name" required value={name} onChangeText={setName} error={editErrs.display_name} maxLength={80} autoCapitalize="words" />
        <Field label="Email" required value={email} onChangeText={setEmail} error={editErrs.email} keyboardType="email-address" maxLength={120} />
        <Field label="Phone" required value={phone} onChangeText={setPhone} error={editErrs.phone} keyboardType="phone-pad" tvKeyboard="numeric" maxLength={30} />
        <Field label="Age" required value={age} onChangeText={setAge} error={editErrs.age} keyboardType="number-pad" tvKeyboard="numeric" maxLength={3} />
        {canHub ? <Select label="Hub" value={hub} onChange={setHub} options={hubOpts} /> : null}
      </Dialog>
      <Dialog visible={dlg === 'reset'} danger title={`Reset password for ${acct.display_name}?`} message="A new temporary password is made and shown once. The old one stops working." confirmLabel="Reset" loading={reset.isPending} onCancel={() => setDlg(null)} onConfirm={() =>
        reset.mutate(undefined, {
          onSuccess: (r) => {
            setDlg(null);
            useCredentials.getState().show({ kind: 'staff', name: acct.display_name, loginId: acct.login_id, secret: r.temp_password, secretLabel: 'Temporary password', note: 'They must change it at first sign-in.', back: backPath });
            refresh();
            pushCredentials();
          },
          onError: (e) => { setDlg(null); fail(e); },
        })
      } />
      <Dialog visible={dlg === 'revoke'} danger title="Sign out everywhere?" message={`${acct.display_name} is signed out of every device. Their ${noun} account stays active.`} confirmLabel="Revoke" loading={revoke.isPending} onCancel={() => setDlg(null)} onConfirm={() =>
        revoke.mutate(undefined, { onSuccess: () => { setDlg(null); toast('Sessions revoked.', 'success'); }, onError: (e) => { setDlg(null); fail(e); } })
      } />
    </Card>
  );
}

function CreateCard({ role, noun, backPath, onClose, pushCredentials }: { role: 'COACH' | 'ADMIN'; noun: string; backPath: string; onClose: () => void; pushCredentials: () => void }) {
  const { u, tv } = useDevice();
  const inv = useInvalidate();
  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [hub, setHub] = useState(usePresetHub.getState().id ?? '');
  const canHub = useCan()('MANAGE_HUBS') && role === 'COACH';
  const hubs = useGet<{ items: HubDTO[] }>('/hubs', undefined, { enabled: canHub });
  const hubOpts = [{ value: '', label: 'No hub yet' }, ...(hubs.data?.items ?? []).filter((h) => h.is_active).map((h) => ({ value: h.id, label: h.name }))];
  const [errs, setErrs] = useState<Record<string, string>>({});
  const create = useMutation({ mutationFn: (b: { login_id: string; display_name: string; role: Role; email: string; phone: string; age: number; hub_id?: string }) => api.post<CreatedStaffResponse>('/users', b) });

  function submit() {
    const id = loginId.trim().toLowerCase();
    const e: Record<string, string> = {};
    if (!LOGIN_ID_PATTERN.test(id)) e.login_id = 'Use 3 to 32 lowercase letters, digits, dot, dash or underscore.';
    Object.assign(e, checkStaffCore({ display_name: name, email, phone, age }, role));
    setErrs(e);
    if (Object.keys(e).length) return;
    create.mutate({ login_id: id, display_name: name.trim(), role, email: email.trim(), phone: phone.trim(), age: numOrUndef(age) as number, ...(canHub && hub ? { hub_id: hub } : {}) }, {
      onSuccess: (r) => {
        void inv('/users');
        usePresetHub.getState().set(null);
        onClose();
        useCredentials.getState().show({ kind: 'staff', name: r.user.display_name, loginId: r.user.login_id, secret: r.temp_password, secretLabel: 'Temporary password', note: 'They must change it at first sign-in.', back: backPath });
        pushCredentials();
      },
      onError: (er) => { if (er instanceof ApiClientError && Object.keys(er.fields).length) setErrs(er.fields); else toast(errorText(er), 'error'); },
    });
  }
  return (
    <Card style={{ marginBottom: u }}>
      <CardH em="all fields required">New {noun}</CardH>
      <Field label="Login ID" required value={loginId} onChangeText={(t) => setLoginId(t.toLowerCase())} error={errs.login_id} maxLength={32} placeholder="for example asha.k" />
      <Field label="Full name" required value={name} onChangeText={setName} error={errs.display_name} autoCapitalize="words" maxLength={80} />
      <Field label="Email" required value={email} onChangeText={setEmail} error={errs.email} keyboardType="email-address" maxLength={120} />
      <View style={{ flexDirection: tv ? 'row' : 'column', gap: tv ? u * 0.75 : 0 }}>
        <View style={{ flex: 1 }}><Field label="Phone" required value={phone} onChangeText={setPhone} error={errs.phone} keyboardType="phone-pad" tvKeyboard="numeric" maxLength={30} /></View>
        <View style={{ flex: 1 }}><Field label="Age" required value={age} onChangeText={setAge} error={errs.age} keyboardType="number-pad" tvKeyboard="numeric" maxLength={3} onSubmit={submit} /></View>
      </View>
      {canHub ? (
        <View style={{ gap: u * 0.375, marginBottom: u * 0.75 }}>
          <X s={0.85} c={C.sub}>Hub</X>
          <Select label="Hub" value={hub} onChange={setHub} options={hubOpts} />
        </View>
      ) : null}
      <Button full label={`Create ${noun}`} loading={create.isPending} onPress={submit} />
    </Card>
  );
}