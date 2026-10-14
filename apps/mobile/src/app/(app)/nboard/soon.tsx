// A module with nothing in it yet (nBase, nCourt, nPad): an honest empty page, not a dead tile.

import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { EmptyBlock } from '../../../ui/States';
import { RequirePermission } from '../../../ui/RequirePermission';

const NAMES: Record<string, string> = { nbase: 'nBase', ncourt: 'nCourt', npad: 'nPad' };

export default function ModuleSoon() {
  const { m } = useLocalSearchParams<{ m?: string }>();
  const name = NAMES[m ?? ''] ?? 'Module';
  return (
    <RequirePermission any={['PLAY_GAME']}>
      <Screen testID="screen-module-empty">
        <Header title={name} subtitle="Module" back="/modules" />
        <EmptyBlock icon="board" title="Nothing here yet" message={`${name} has no games or tools yet. They will appear here when they are added.`} />
      </Screen>
    </RequirePermission>
  );
}
