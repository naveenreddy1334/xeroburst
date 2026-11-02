// A player's own fees: what is due, Pay now with UPI, card or net banking, the month by month list and the payment history.
// This is its own page so money is never mixed in with training progress.

import { View } from 'react-native';
import { useAuth } from '../../state/auth';
import { RequirePermission } from '../../ui/RequirePermission';
import { Screen } from '../../ui/Screen';
import { Header } from '../../ui/Header';
import { BillingCard } from '../../ui/PlayerPanels';
import { useDevice } from '../../theme/device';

function Pay() {
  const { u } = useDevice();
  const me = useAuth((s) => s.user);
  if (!me) return null;
  return (
    <View>
      <Header eyebrow="Fees" title="Pay" subtitle="What you owe XeroBurst, how to pay it, and every payment so far." />
      <View style={{ height: u * 0.75 }} />
      <View style={{ maxWidth: u * 48 }}><BillingCard playerId={me.id} /></View>
    </View>
  );
}

export default function PayPage() {
  return (
    <RequirePermission any={['VIEW_OWN_RESULTS']}>
      <Screen testID="screen-pay">
        <Pay />
      </Screen>
    </RequirePermission>
  );
}
