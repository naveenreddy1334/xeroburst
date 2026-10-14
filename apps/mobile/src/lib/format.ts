export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
