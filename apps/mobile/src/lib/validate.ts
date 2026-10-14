// Form validation for the mandatory fields. The rules live in @nboard/shared (the same schemas the server
// uses), so a form and the API can never disagree. These helpers only turn input text into typed values.

import { createPlayerBody, createUserBody } from '@nboard/shared';

/** Blank -> undefined (reported as "required"), a number -> the number, anything else -> NaN. */
export function numOrUndef(s: string): number | undefined {
  const t = s.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

type Issue = { path: PropertyKey[]; message: string };
function fieldsFrom(issues: Issue[], notNumber: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? '_');
    if (!out[k]) out[k] = i.message;
  }
  for (const k of notNumber) out[k] = 'Enter a valid number.';
  return out;
}

/** Name, age and weight of a player (new or edited). Returns field messages; empty means valid. */
export function checkPlayerCore(v: { display_name: string; age: string; weight: string }): Record<string, string> {
  const age = numOrUndef(v.age);
  const weight = numOrUndef(v.weight);
  const bad = [Number.isNaN(age) ? 'age' : '', Number.isNaN(weight) ? 'weight_kg' : ''].filter(Boolean);
  const r = createPlayerBody.pick({ display_name: true, age: true, weight_kg: true }).safeParse({
    display_name: v.display_name,
    age: Number.isNaN(age) ? undefined : age,
    weight_kg: Number.isNaN(weight) ? undefined : weight,
  });
  return r.success && !bad.length ? {} : fieldsFrom(r.success ? [] : (r.error.issues as Issue[]), bad);
}

/** Name, email, phone and age of a Coach or Admin account (new or edited). */
export function checkStaffCore(v: { display_name: string; email: string; phone: string; age: string }, role: 'COACH' | 'ADMIN'): Record<string, string> {
  const age = numOrUndef(v.age);
  const bad = Number.isNaN(age) ? ['age'] : [];
  const r = createUserBody.safeParse({
    login_id: 'placeholder',
    role,
    display_name: v.display_name,
    email: v.email,
    phone: v.phone,
    age: Number.isNaN(age) ? undefined : age,
  });
  const issues = r.success ? [] : (r.error.issues as Issue[]).filter((i) => i.path[0] !== 'login_id');
  return issues.length || bad.length ? fieldsFrom(issues, bad) : {};
}
