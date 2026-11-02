export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** Whole rupees, Indian digit grouping: 1,50,000. */
export function rupees(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}
/** "12 Oct 2026" from an ISO instant. */
export function fmtFull(iso: string | null | undefined): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
