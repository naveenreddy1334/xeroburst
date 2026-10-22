// Home is Analytics, exactly as in the design: players and games at the left, gauges and charts at the right.
// The earlier dashboard (streak, program, activity) is kept on the Overview route.

import { Redirect } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { useAuth } from '../../state/auth';
import { AnalyticsScreen } from '../../ui/AnalyticsScreen';
import { useDevice } from '../../theme/device';

export default function Home() {
  const { tv } = useDevice();
  const role = useAuth((s) => s.user?.role);
  if (role === 'PLAYER') return <Redirect href={'/modules' as never} />; // Analytics is for coaches and above
  return (
    <Screen testID="screen-dashboard" scroll={!tv} fill={tv} maxWidth={100000}>
      <AnalyticsScreen />
    </Screen>
  );
}