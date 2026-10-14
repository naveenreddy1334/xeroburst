import { describe, expect, it } from 'vitest';
import { dayNumber, localMidnightUtc, localParts, rangeWindow, tzOffsetMs } from '../src/util/time.js';

const IST = 'Asia/Kolkata';

describe('time zone helpers (Asia/Kolkata, UTC+5:30)', () => {
  it('offset and local parts', () => {
    expect(tzOffsetMs(Date.UTC(2026, 0, 1), IST)).toBe(5.5 * 3600_000);
    const p = localParts(Date.UTC(2026, 0, 1, 20, 0, 0), IST); // 01:30 on 2 Jan locally
    expect([p.y, p.m, p.d, p.h, p.min]).toEqual([2026, 1, 2, 1, 30]);
  });

  it('local midnight is 18:30 UTC the day before', () => {
    expect(localMidnightUtc(2026, 3, 10, IST)).toBe(Date.UTC(2026, 2, 9, 18, 30));
  });

  it('a session at 23:50 and one at 00:10 local are different days', () => {
    const a = Date.UTC(2026, 2, 10, 18, 20); // 23:50 on the 10th local
    const b = Date.UTC(2026, 2, 10, 18, 40); // 00:10 on the 11th local
    expect(dayNumber(b, IST) - dayNumber(a, IST)).toBe(1);
  });

  it('weeks start on Monday and run seven days', () => {
    const wed = Date.UTC(2026, 2, 11, 6, 0); // Wednesday 11 March 2026
    const w = rangeWindow('week', 0, wed, IST, 'monday');
    expect(w.buckets.map((b) => b.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(w.from).toBe(localMidnightUtc(2026, 3, 9, IST));
    expect(w.to - w.from).toBe(7 * 86400_000);
    const prev = rangeWindow('week', -1, wed, IST, 'monday');
    expect(prev.to).toBe(w.from);
    const sun = rangeWindow('week', 0, wed, IST, 'sunday');
    expect(sun.buckets[0]!.label).toBe('Sun');
  });

  it('month and day windows', () => {
    const t = Date.UTC(2026, 1, 15, 6, 0);
    expect(rangeWindow('month', 0, t, IST, 'monday').buckets).toHaveLength(28);
    expect(rangeWindow('month', 1, Date.UTC(2026, 0, 15), IST, 'monday').buckets).toHaveLength(28);
    expect(rangeWindow('month', -2, Date.UTC(2026, 0, 15), IST, 'monday').label).toBe('Nov 2025');
    const d = rangeWindow('day', 0, t, IST, 'monday');
    expect(d.buckets).toHaveLength(24);
    expect(d.to - d.from).toBe(86400_000);
  });

  it('handles a DST zone', () => {
    const NY = 'America/New_York';
    const w = rangeWindow('day', 0, Date.UTC(2026, 2, 8, 15, 0), NY, 'monday'); // 8 March 2026: clocks go forward
    expect(w.to - w.from).toBe(23 * 3600_000);
  });
});
