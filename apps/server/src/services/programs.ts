import type { GameSlug, PlayerProgramDTO, ProgramDTO } from '@nboard/shared';
import type { Ctx } from '../ctx.js';
import { newId } from '../db/seed.js';

interface ProgRow {
  id: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  is_template: number;
  retired: number;
  created_at: string;
}

const PROG_SQL = `SELECT p.id, p.name, p.owner_id, u.display_name AS owner_name, p.is_template, p.retired, p.created_at
                    FROM programs p LEFT JOIN users u ON u.id = p.owner_id`;

export function programStages(ctx: Ctx, programId: string) {
  const stages = ctx.db
    .prepare('SELECT id, stage_no, label FROM program_stages WHERE program_id = ? ORDER BY stage_no')
    .all(programId) as { id: number; stage_no: number; label: string }[];
  const sg = ctx.db.prepare(
    'SELECT g.slug FROM program_stage_games sg JOIN games g ON g.id = sg.game_id WHERE sg.stage_id = ? ORDER BY g.sort_order',
  );
  return stages.map((s) => ({
    stage_no: s.stage_no,
    label: s.label,
    games: (sg.all(s.id) as { slug: GameSlug }[]).map((r) => r.slug),
  }));
}

function toDTO(ctx: Ctx, r: ProgRow): ProgramDTO {
  return {
    id: r.id,
    name: r.name,
    owner_id: r.owner_id,
    owner_name: r.owner_name,
    is_template: !!r.is_template,
    retired: !!r.retired,
    stages: programStages(ctx, r.id),
    players_using: (ctx.db.prepare('SELECT COUNT(*) c FROM player_programs WHERE program_id = ?').get(r.id) as { c: number }).c,
    created_at: r.created_at,
  };
}

export function getProgram(ctx: Ctx, id: string): ProgramDTO | null {
  const r = ctx.db.prepare(`${PROG_SQL} WHERE p.id = ?`).get(id) as ProgRow | undefined;
  return r ? toDTO(ctx, r) : null;
}

/** Admins see all; a Coach sees their own and shared (no owner) programs. */
export function listPrograms(ctx: Ctx, coachId: string | null): ProgramDTO[] {
  const rows = (
    coachId
      ? ctx.db.prepare(`${PROG_SQL} WHERE p.owner_id IS NULL OR p.owner_id = ? ORDER BY p.is_template DESC, p.name`).all(coachId)
      : ctx.db.prepare(`${PROG_SQL} ORDER BY p.is_template DESC, p.name`).all()
  ) as ProgRow[];
  return rows.map((r) => toDTO(ctx, r));
}

export interface ProgramInput {
  name: string;
  is_template?: boolean;
  retired?: boolean;
  stages: { label: string; games: GameSlug[] }[];
}

export function createProgram(ctx: Ctx, input: ProgramInput, ownerId: string | null, createdBy: string): string {
  const id = `prog_${newId()}`;
  ctx.db
    .prepare('INSERT INTO programs (id, name, owner_id, is_template, retired, created_by, created_at) VALUES (?,?,?,?,0,?,?)')
    .run(id, input.name, ownerId, input.is_template ? 1 : 0, createdBy, new Date().toISOString());
  writeStages(ctx, id, input.stages);
  return id;
}

export function writeStages(ctx: Ctx, programId: string, stages: ProgramInput['stages']): void {
  // Stages are replaced as a whole; the stage numbers are the order given.
  ctx.db.prepare('DELETE FROM program_stages WHERE program_id = ?').run(programId);
  const ins = ctx.db.prepare('INSERT INTO program_stages (program_id, stage_no, label) VALUES (?,?,?)');
  const link = ctx.db.prepare('INSERT OR IGNORE INTO program_stage_games (stage_id, game_id) VALUES (?,(SELECT id FROM games WHERE slug = ?))');
  stages.forEach((s, i) => {
    const sid = Number(ins.run(programId, i + 1, s.label).lastInsertRowid);
    for (const g of new Set(s.games)) link.run(sid, g);
  });
}

export function playerProgram(ctx: Ctx, playerId: string): PlayerProgramDTO | null {
  const pp = ctx.db.prepare('SELECT program_id, current_stage, started_at FROM player_programs WHERE player_id = ?').get(playerId) as
    | { program_id: string; current_stage: number; started_at: string }
    | undefined;
  if (!pp) return null;
  const program = getProgram(ctx, pp.program_id);
  if (!program) return null;
  const count = program.stages.length;
  return {
    program,
    current_stage: pp.current_stage,
    stage_count: count,
    progress_pct: count ? Math.round((pp.current_stage / count) * 100) : 0,
    started_at: pp.started_at,
  };
}
