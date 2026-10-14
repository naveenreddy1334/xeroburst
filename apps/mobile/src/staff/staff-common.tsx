import { View } from 'react-native';
import { Banner } from '../ui/States';

export const TV_READONLY = 'Open this page on a phone, tablet or laptop to make changes.';

export function ReadOnlyBanner() {
  return <Banner>{TV_READONLY}</Banner>;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** LOGIN_FAILED -> "Login failed" */
export function humanise(s: string): string {
  const t = s.replace(/[_\-.]+/g, ' ').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function Row({ children, gap = 10 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }}>{children}</View>;
}
