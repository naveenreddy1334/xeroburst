// Organization: hub -> academy (optional) -> branch (optional) -> coaches -> players.
// A hub can be a single location (coaches report straight to the Hub Admin) or have an academy with several branches.
// This screen shows counts and staff only, never an individual player's data.

import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ROLE_LABEL } from '@nboard/shared';
import type { CreatedStaffResponse, OrgAcademy, OrgBranch, OrgHub, OrgPerson, OrgTree, Role, UserDTO } from '@nboard/shared';
import { C, F } from '../../theme/tokens';
import { glassLo, neoIn } from '../../theme/surfaces';
import { useDevice } from '../../theme/device';
import { api } from '../../lib/api';
import { useGet } from '../../lib/queries';
import { RequirePermission } from '../../ui/RequirePermission';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { CardH, Empty, Pill, RoundChip, Seg, X } from '../../ui/Bits';
import { ErrorBlock, LoadingBlock } from '../../ui/States';
import { Icon } from '../../ui/Icon';
import { useAction } from '../../staff/players-common';
import { useCan } from '../../state/auth';
import { usePresetHub } from '../../state/shell';
import { useCredentials } from '../../state/ui';

type Filter = 'all' | 'branches' | 'single';

const names = (p: OrgPerson[]) => (p.length ? p.map((x) => x.name).join(', ') : null);

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <View>
      <X s={1.2} w="x" num>{n}</X>
      <X s={0.72} c={C.faint}>{l}</X>
    </View>
  );
}

/** Two-tap confirmation for anything that switches something off. */
function Confirm({ label, onYes, busy }: { label: string; onYes: () => void; busy?: boolean }) {
  const { u } = useDevice();
  const [ask, setAsk] = useState(false);
  if (!ask) return <Button label={label} variant="ghost" onPress={() => setAsk(true)} />;
  return (
    <View style={{ flexDirection: 'row', gap: u * 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
      <X s={0.8} c={C.warning}>Sure?</X>
      <Button label="Yes" loading={busy} onPress={() => { setAsk(false); onYes(); }} />
      <Button label="Cancel" variant="ghost" onPress={() => setAsk(false)} />
    </View>
  );
}

function BranchBlock({ b, canManage, onGo }: { b: OrgBranch; canManage: boolean; onGo: (hub: string, branch: string) => void }) {
  const { u } = useDevice();
  const act = useAction(['/org']);
  const mgr = names(b.managers);
  const coaches = b.coaches.filter((c) => c.active);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: u * 0.75, marginTop: u * 0.75, gap: u * 0.375 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5 }}>
        <X s={0.95} w="b" style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>{b.name}</X>
        <Pill t={b.is_active ? 'good' : 'off'}>{b.is_active ? 'Active' : 'Closed'}</Pill>
      </View>
      <X s={0.8} c={mgr ? C.sub : C.warning}>{mgr ? `Branch Admin: ${mgr}` : 'No Branch Admin assigned'}</X>
      <X s={0.8} c={C.sub}>{coaches.length ? `Coaches: ${names(coaches)}` : 'No coaches yet'}</X>
      <View style={{ flexDirection: 'row', gap: u * 1.5, marginTop: u * 0.25 }}>
        <Stat n={coaches.length} l="Coaches" />
        <Stat n={b.active_players} l="Active players" />
        <Stat n={Math.max(0, b.players - b.active_players)} l="Inactive" />
      </View>
      <View style={{ flexDirection: 'row', gap: u * 0.5, flexWrap: 'wrap' }}>
        <Button label="Players" variant="ghost" onPress={() => onGo(b.hub_id, b.id)} />
        {canManage && b.is_active ? <Confirm label="Close branch" busy={act.busy === b.id} onYes={() => void act.run(b.id, () => api.patch(`/org/branches/${b.id}`, { is_active: false }), 'Branch closed.')} /> : null}
        {canManage && !b.is_active ? <Button label="Reopen" variant="ghost" onPress={() => void act.run(b.id, () => api.patch(`/org/branches/${b.id}`, { is_active: true }), 'Branch reopened.')} /> : null}
      </View>
    </View>
  );
}

function AcademyBlock({ a, canManage, onGo }: { a: OrgAcademy; canManage: boolean; onGo: (hub: string, branch: string) => void }) {
  const { u } = useDevice();
  const act = useAction(['/org']);
  return (
    <View style={{ marginTop: u, gap: u * 0.25 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5 }}>
        <X s={0.72} up c={C.faint}>Academy</X>
        <X s={1} w="b" style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>{a.name}</X>
        <Pill t={a.is_active ? 'good' : 'off'}>{a.is_active ? 'Active' : 'Closed'}</Pill>
      </View>
      <X s={0.8} c={C.sub}>{a.branches.length} {a.branches.length === 1 ? 'branch' : 'branches'} · {a.coaches} coaches · {a.players} players</X>
      {a.branches.length === 0 ? <Empty>This academy has no branches yet.</Empty> : a.branches.map((b) => <BranchBlock key={b.id} b={b} canManage={canManage} onGo={onGo} />)}
      {canManage && a.is_active && a.branches.length === 0 ? (
        <Confirm label="Close academy" busy={act.busy === a.id} onYes={() => void act.run(a.id, () => api.patch(`/org/academies/${a.id}`, { is_active: false }), 'Academy closed.')} />
      ) : null}
    </View>
  );
}

function HubCard({ h, open, toggle, canManage, onAdd, onGo }: { h: OrgHub; open: boolean; toggle: () => void; canManage: boolean; onAdd: (hub: OrgHub) => void; onGo: (hub: string, branch?: string) => void }) {
  const { u } = useDevice();
  const mgr = names(h.managers);
  const branchCount = h.branches.length + h.academies.reduce((n, a) => n + a.branches.length, 0);
  // A single-branch hub with no Hub Admin is run by that branch's Branch Admin, which is how the chart draws it.
  const soloAdmin = !mgr && branchCount === 1 ? names([...h.branches, ...h.academies.flatMap((a) => a.branches)].flatMap((b) => b.managers)) : '';
  return (
    <Card onPress={toggle} accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${h.name}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75 }}>
        <View style={{ width: u * 2.5, height: u * 2.5, borderRadius: u, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryDim }}>
          <Icon name="hubs" size={u * 1.3} color={C.highlight} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <X s={1.05} w="b" numberOfLines={2}>{h.name}</X>
          <X s={0.8} c={mgr || soloAdmin ? C.sub : C.warning} numberOfLines={2}>{mgr ? `Hub Admin: ${mgr}` : soloAdmin ? `Branch Admin: ${soloAdmin}` : 'No Hub Admin assigned'}</X>
        </View>
        <Pill t={h.is_active ? 'good' : 'off'}>{h.is_active ? 'Active' : 'Closed'}</Pill>
        <Icon name={open ? 'chevronDown' : 'chevron'} size={u * 1.1} color={C.faint} />
      </View>
      <View style={{ flexDirection: 'row', gap: u * 1.5, marginTop: u * 0.75, flexWrap: 'wrap' }}>
        <Stat n={h.academies.length} l="Academies" />
        <Stat n={branchCount} l="Branches" />
        <Stat n={h.coaches} l="Coaches" />
        <Stat n={h.active_players} l="Active players" />
      </View>
      {open ? (
        <View onStartShouldSetResponder={() => true} style={{ marginTop: u * 0.5 }}>
          <View style={{ flexDirection: 'row', gap: u * 0.5, flexWrap: 'wrap', marginTop: u * 0.5 }}>
            <Button label="Players" variant="ghost" onPress={() => onGo(h.id)} />
            {canManage ? <Button label="Add…" onPress={() => onAdd(h)} /> : null}
          </View>
          {h.structure === 'single' ? (
            <View style={{ marginTop: u * 0.75 }}>
              <Empty>No academies or branches. Coaches report straight to the Hub Admin.</Empty>
            </View>
          ) : null}
          {h.academies.map((a) => <AcademyBlock key={a.id} a={a} canManage={canManage} onGo={(hub, br) => onGo(hub, br)} />)}
          {h.branches.length ? (
            <View style={{ marginTop: u }}>
              <X s={0.72} up c={C.faint}>Branches without an academy</X>
              {h.branches.map((b) => <BranchBlock key={b.id} b={b} canManage={canManage} onGo={(hub, br) => onGo(hub, br)} />)}
            </View>
          ) : null}
          <View style={{ marginTop: u, borderTopWidth: 1, borderTopColor: C.border, paddingTop: u * 0.75 }}>
            <X s={0.72} up c={C.faint}>Coaches directly under the hub</X>
            <X s={0.85} c={C.sub}>{h.direct_coaches.length ? names(h.direct_coaches) : 'None'}</X>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

type Mode = 'academy' | 'branch' | 'new' | 'assign';

function AddPanel({ hub, tree, onClose }: { hub: OrgHub; tree: OrgTree; onClose: () => void }) {
  const { u } = useDevice();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('branch');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('COACH');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const act = useAction(['/org', '/users', '/hubs', '/players']);
  const branches = [...hub.branches, ...hub.academies.flatMap((a) => a.branches)].filter((b) => b.is_active);
  const staff = useGet<{ items: UserDTO[] }>('/users', { role });
  const candidates = (staff.data?.items ?? []).filter((x) => x.is_active && (x.hub?.id !== hub.id || (x.branch?.id ?? null) !== branchId));
  void tree;
  const needsBranch = role === 'BRANCH_MANAGER';

  async function save() {
    if (mode === 'academy') {
      const r = await act.run('go', () => api.post('/org/academies', { hub_id: hub.id, name: name.trim() }), 'Academy created.');
      if (r.ok) onClose();
    } else if (mode === 'branch') {
      const r = await act.run('go', () => api.post('/org/branches', { hub_id: hub.id, academy_id: academyId, name: name.trim(), city: city.trim() || null }), 'Branch created.');
      if (r.ok) onClose();
    } else if (mode === 'new') {
      const body = { login_id: login.trim().toLowerCase(), display_name: name.trim(), role, email: email.trim(), phone: phone.trim(), age: Number(age), hub_id: hub.id, branch_id: role === 'HUB_MANAGER' ? null : branchId };
      const r = await act.run('go', () => api.post<CreatedStaffResponse>('/users', body), 'Account created.');
      if (r.ok) {
        // The temporary password is shown once, full screen, with copy and print, like every other new account.
        useCredentials.getState().show({ kind: 'staff', name: r.value.user.display_name, loginId: r.value.user.login_id, secret: r.value.temp_password, secretLabel: 'Temporary password', note: 'They must change it at first sign-in.', back: '/organization' });
        onClose();
        router.push('/players/credentials' as never);
      }
    } else if (pick) {
      const r = await act.run('go', () => api.post('/org/assign', { user_id: pick, hub_id: hub.id, branch_id: role === 'HUB_MANAGER' ? null : branchId }), 'Assigned.');
      if (r.ok) onClose();
    }
  }

  const err = act.fields;
  return (
    <Card style={{ marginBottom: u }}>
      <CardH em={hub.name}>Add to this hub</CardH>
      <Seg<Mode> items={[['branch', 'Branch'], ['academy', 'Academy'], ['new', 'New person'], ['assign', 'Assign existing']]} value={mode} onChange={(m) => setMode(m)} />
      <View style={{ height: u * 0.75 }} />
      {mode === 'academy' || mode === 'branch' ? (
        <View>
          <Field label={mode === 'academy' ? 'Academy name' : 'Branch name'} required value={name} onChangeText={setName} error={err.name} autoCapitalize="words" maxLength={80} />
          {mode === 'branch' ? (
            <View style={{ gap: u * 0.5, marginBottom: u * 0.75 }}>
              <Field label="City" value={city} onChangeText={setCity} autoCapitalize="words" maxLength={80} />
              {hub.academies.length ? (
                <View style={{ gap: u * 0.375 }}>
                  <X s={0.8} c={C.sub}>Academy (optional)</X>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
                    <RoundChip label="None" on={academyId === null} onPress={() => setAcademyId(null)} />
                    {hub.academies.filter((a) => a.is_active).map((a) => <RoundChip key={a.id} label={a.name} on={academyId === a.id} onPress={() => setAcademyId(a.id)} />)}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: u * 0.5, marginBottom: u * 0.75 }}>
          <X s={0.8} c={C.sub}>Role</X>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
            {(['HUB_MANAGER', 'BRANCH_MANAGER', 'COACH'] as Role[]).map((r) => <RoundChip key={r} label={ROLE_LABEL[r]} on={role === r} onPress={() => { setRole(r); setPick(null); }} />)}
          </View>
          {role !== 'HUB_MANAGER' ? (
            <View style={{ gap: u * 0.375 }}>
              <X s={0.8} c={C.sub}>{needsBranch ? 'Branch (required)' : 'Branch (leave on Hub for none)'}</X>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
                {!needsBranch ? <RoundChip label="Hub (no branch)" on={branchId === null} onPress={() => setBranchId(null)} /> : null}
                {branches.map((b) => <RoundChip key={b.id} label={b.name} on={branchId === b.id} onPress={() => setBranchId(b.id)} />)}
              </View>
              {needsBranch && branches.length === 0 ? <X s={0.8} c={C.warning}>Create a branch first.</X> : null}
            </View>
          ) : null}
          {mode === 'new' ? (
            <View>
              <Field label="Full name" required value={name} onChangeText={setName} error={err.display_name} autoCapitalize="words" />
              <Field label="Login ID" required value={login} onChangeText={setLogin} error={err.login_id} hint="3 to 32 letters, digits, dot, dash or underscore" />
              <Field label="Email" required value={email} onChangeText={setEmail} error={err.email} keyboardType="email-address" />
              <Field label="Phone" required value={phone} onChangeText={setPhone} error={err.phone} keyboardType="phone-pad" />
              <Field label="Age" required value={age} onChangeText={setAge} error={err.age} keyboardType="number-pad" />
            </View>
          ) : (
            <View style={{ gap: u * 0.375 }}>
              <X s={0.8} c={C.sub}>Choose who to assign. They move only when you press Assign.</X>
              {staff.isLoading ? <LoadingBlock label="Loading" /> : candidates.length === 0 ? <Empty>No one available for this role.</Empty> : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
                  {candidates.map((c) => <RoundChip key={c.id} label={`${c.display_name}${c.hub ? ` · ${c.hub.name}` : ' · unassigned'}`} on={pick === c.id} onPress={() => setPick(c.id)} />)}
                </View>
              )}
            </View>
          )}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: u * 0.5 }}>
        <Button label={mode === 'assign' ? 'Assign' : 'Create'} loading={act.busy === 'go'} onPress={save} />
        <Button label="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

/** Search and filter in one bar: a pill-shaped search box and the three filters as chips with counts. */
function Toolbar({ q, setQ, filter, setFilter, counts }: { q: string; setQ: (v: string) => void; filter: Filter; setFilter: (f: Filter) => void; counts: Record<Filter, number> }) {
  const { u, wide, tv } = useDevice();
  const [focus, setFocus] = useState(false);
  const chips: [Filter, string][] = [['all', 'All'], ['branches', 'With branches'], ['single', 'Single location']];
  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: u * 0.75 }}>
      {tv ? (
        <View style={{ flex: 1 }}><Field label="Search" value={q} onChangeText={setQ} placeholder="Hub, branch, admin or coach" /></View>
      ) : (
        <View style={[{ flex: wide ? 1 : undefined, maxWidth: wide ? u * 36 : undefined, flexDirection: 'row', alignItems: 'center', gap: u * 0.6, height: u * 2.9, paddingHorizontal: u, borderRadius: 999, borderWidth: 1, borderColor: focus ? C.primary : 'transparent' }, glassLo(), neoIn(u)]}>
          <Icon name="search" size={u * 1.15} color={focus ? C.highlight : C.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="Search hub, branch, admin or coach"
            placeholderTextColor={C.faint}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search hubs"
            selectionColor={C.primary}
            style={[{ flex: 1, color: C.text, fontFamily: F.bodyMed, fontSize: u * 0.95, paddingVertical: 0 }, { outlineStyle: 'none' } as object]}
          />
          {q ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQ('')}>
              <Icon name="close" size={u * 1.05} color={C.sub} />
            </Pressable>
          ) : null}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: u * 0.5, flexWrap: 'wrap' }}>
        {chips.map(([k, l]) => <RoundChip key={k} label={`${l}  ${counts[k]}`} on={filter === k} onPress={() => setFilter(k)} />)}
      </View>
    </View>
  );
}

function OrgScreen() {
  const { u, wide } = useDevice();
  const router = useRouter();
  const can = useCan();
  const canManage = can('MANAGE_ORG');
  const tree = useGet<OrgTree>('/org/tree');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const data = tree.data;

  const hubs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.hubs ?? []).filter((h) => {
      if (filter === 'branches' && h.structure === 'single') return false;
      if (filter === 'single' && h.structure !== 'single') return false;
      if (!needle) return true;
      const hay = [h.name, h.city ?? '', ...h.managers.map((m) => m.name), ...h.direct_coaches.map((c) => c.name),
        ...h.academies.flatMap((a) => [a.name, ...a.branches.flatMap((b) => [b.name, ...b.managers.map((m) => m.name), ...b.coaches.map((c) => c.name)])]),
        ...h.branches.flatMap((b) => [b.name, ...b.managers.map((m) => m.name), ...b.coaches.map((c) => c.name)])].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [data, q, filter]);

  // A hub's players: the Super Admin sees them on the hub page (they have no Players list); other roles open Players for that hub.
  const go = (hub: string) => {
    if (can('MANAGE_HUBS')) { router.push(`/hubs/${hub}` as never); return; }
    usePresetHub.getState().set(hub);
    router.push('/players' as never);
  };
  const t = data?.totals;
  const adder = data?.hubs.find((h) => h.id === adding) ?? null;

  return (
    <View>
      <Header eyebrow="Structure" title="Organization" subtitle="Hubs, academies, branches and the people who run them. Counts only; no player data is shown here." />
      <View style={{ height: u * 0.75 }} />
      {tree.isLoading ? <LoadingBlock label="Loading organization" /> : tree.isError ? <ErrorBlock error={tree.error} onRetry={() => void tree.refetch()} /> : !data || data.hubs.length === 0 ? (
        <Empty>No hubs yet. Create a hub on the Hubs page, then build its structure here.</Empty>
      ) : (
        <View style={{ gap: u }}>
          {t ? (
            <Card>
              <View style={{ flexDirection: 'row', gap: u * 1.75, flexWrap: 'wrap' }}>
                <Stat n={t.hubs} l="Hubs" />
                <Stat n={t.academies} l="Academies" />
                <Stat n={t.branches} l="Branches" />
                <Stat n={t.coaches} l="Coaches" />
                <Stat n={t.active_players} l="Active players" />
              </View>
            </Card>
          ) : null}
          <Toolbar q={q} setQ={setQ} filter={filter} setFilter={setFilter} counts={{ all: data.hubs.length, branches: data.hubs.filter((h) => h.structure !== 'single').length, single: data.hubs.filter((h) => h.structure === 'single').length }} />
          {adder ? <AddPanel hub={adder} tree={data} onClose={() => setAdding(null)} /> : null}
          {hubs.length === 0 ? <Empty>Nothing matches.</Empty> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u, alignItems: 'flex-start' }}>
              {hubs.map((h) => (
                <View key={h.id} style={{ width: wide ? '49.2%' : '100%', flexGrow: wide ? 0 : 1, minWidth: 0 }}>
                  <HubCard h={h} open={!!openIds[h.id]} toggle={() => setOpenIds((s) => ({ ...s, [h.id]: !s[h.id] }))} canManage={canManage} onAdd={(x) => setAdding(x.id)} onGo={(hub) => go(hub)} />
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function Organization() {
  return (
    <RequirePermission any={['VIEW_ORG']}>
      <Screen testID="screen-organization" maxWidth={100000}>
        <OrgScreen />
      </Screen>
    </RequirePermission>
  );
}
