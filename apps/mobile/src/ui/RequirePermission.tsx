import type { ReactNode } from 'react';
import type { Permission } from '@nboard/shared';
import { useAuth } from '../state/auth';
import { Screen } from './Screen';
import { Header } from './Header';
import { EmptyBlock } from './States';

/** Hides a screen from roles that lack the permission. The server enforces it too; this is the friendly face. */
export function RequirePermission({ any, children }: { any: Permission[]; children: ReactNode }) {
  const permissions = useAuth((s) => s.permissions);
  if (any.some((p) => permissions.includes(p))) return <>{children}</>;
  return (
    <Screen>
      <Header title="Not available" back />
      <EmptyBlock icon="lock" title="You do not have access to this page" message="Ask an administrator if you need it." />
    </Screen>
  );
}
