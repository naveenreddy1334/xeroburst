import { ActivityIndicator, View } from 'react-native';
import type { IconName } from '@nboard/shared';
import { ApiClientError } from '../lib/api';
import { C, R, alpha } from '../theme/tokens';
import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { Txt } from './Txt';

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={{ padding: 40, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={C.highlight} size="large" />
      <Txt v="small">{label}...</Txt>
    </View>
  );
}

export function errorText(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiClientError && error.code === 'NETWORK';
  return (
    <Card style={{ alignItems: 'center', gap: 10, padding: 24 }}>
      <Icon name={offline ? 'wifi' : 'alert'} size={32} color={C.warning} />
      <Txt v="h3" align="center">
        {offline ? 'Cannot reach the server' : 'That did not work'}
      </Txt>
      <Txt v="small" align="center">
        {errorText(error)}
      </Txt>
      {onRetry ? <Button label="Try again" variant="secondary" icon="refresh" onPress={onRetry} /> : null}
    </Card>
  );
}

export function EmptyBlock({ icon = 'list', title, message, action }: { icon?: IconName; title: string; message?: string; action?: { label: string; onPress: () => void; icon?: IconName } }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, padding: 28, borderRadius: R.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.border }}>
      <Icon name={icon} size={32} color={C.lockedText} />
      <Txt v="h3" align="center">
        {title}
      </Txt>
      {message ? (
        <Txt v="small" align="center">
          {message}
        </Txt>
      ) : null}
      {action ? <Button label={action.label} icon={action.icon} onPress={action.onPress} /> : null}
    </View>
  );
}

/** Shows a pending-upload or offline banner. */
export function Banner({ icon = 'alert', color = C.warning, children }: { icon?: IconName; color?: string; children: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: alpha(C.warning, 0.1), borderRadius: R.md, borderWidth: 1.5, borderColor: color, padding: 12 }}>
      <Icon name={icon} size={20} color={color} />
      <Txt v="small" color={C.text} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}
