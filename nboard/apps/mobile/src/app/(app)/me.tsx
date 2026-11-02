// A player's own progress page: streak and goal and pace. Fees live on their own Pay page.

import { View } from 'react-native';
import { useAuth } from '../../state/auth';
import { useDevice } from '../../theme/device';
import { RequirePermission } from '../../ui/RequirePermission';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { ProgressPanels } from '../../ui/PlayerPanels';

function Me() {
  const { u, wide } = useDevice();
  const me = useAuth((s) => s.user);
  if (!me) return null;
  return (
    <View>
      <Header eyebrow="My progress" title={me.display_name} subtitle="Your streak and your goal for this week or month." />
      <View style={{ height: u * 0.75 }} />
      <ProgressPanels playerId={me.id} side={wide} />
    </View>
  );
}

export default function MyProgress() {
  return (
    <RequirePermission any={['VIEW_OWN_RESULTS']}>
      <Screen testID="screen-me" maxWidth={100000}>
        <Me />
      </Screen>
    </RequirePermission>
  );
}
