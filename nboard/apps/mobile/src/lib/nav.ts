import type { MenuId } from '@nboard/shared';
import type { IconName } from '@nboard/shared';

export const MENU: Record<MenuId, { label: string; href: string; icon: IconName }> = {
  business: { label: 'Overview', href: '/business', icon: 'analytics' },
  dashboard: { label: 'Analytics', href: '/', icon: 'analytics' },
  modules: { label: 'Modules', href: '/modules', icon: 'modules' },
  progress: { label: 'Progress', href: '/me', icon: 'trophy' },
  pay: { label: 'Pay', href: '/pay', icon: 'wallet' },
  players: { label: 'Players', href: '/players', icon: 'players' },
  programs: { label: 'Programs', href: '/programs', icon: 'programs' },
  results: { label: 'Results', href: '/results', icon: 'results' },
  coaches: { label: 'Coaches', href: '/coaches', icon: 'coaches' },
  hubs: { label: 'Hubs', href: '/hubs', icon: 'hubs' },
  organization: { label: 'Organization', href: '/organization', icon: 'board' },
  finance: { label: 'Finance', href: '/finance', icon: 'chart' },
  admins: { label: 'Admins', href: '/admins', icon: 'admins' },
  audit: { label: 'Audit log', href: '/audit', icon: 'audit' },
  system: { label: 'System', href: '/system', icon: 'system' },
  settings: { label: 'Settings', href: '/settings', icon: 'settings' },
};
