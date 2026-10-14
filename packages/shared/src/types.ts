// Response shapes of the server API. Both server and app import these so they cannot disagree.

import type { GameSlug, GameState } from './games';
import type { AttentionItem, Insight, InsightsResult, LevelPerf, PerfSummary } from './insights';
import type { PrimaryMetricKey, Summary } from './metrics';
import type { Permission, Role } from './permissions';

export type ISODate = string;

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

// ---- Auth and accounts --------------------------------------------------------------------------

export interface UserDTO {
  id: string;
  login_id: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: ISODate;
  last_login_at: ISODate | null;
  /** Individual grants, for example CREATE_COACHES on a Coach */
  grants: Permission[];
  /** Staff contact details (required when the account is created; older accounts may not have them yet) */
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  /** Why the account was marked inactive (only while inactive) */
  inactive_reason?: string | null;
  /** The hub this person belongs to (Coach and Player; Admins have none) */
  hub?: HubRef | null;
  /** Coaches only */
  players_count?: number;
  locked_until?: ISODate | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  /** seconds */
  expires_in: number;
}

export interface AuthResponse extends AuthTokens {
  user: UserDTO;
  permissions: Permission[];
  must_change_password: boolean;
}

export interface PublicSettings {
  org_name: string;
  timezone: string;
  week_start: 'monday' | 'sunday';
  idle_timeout_min: number;
  player_logout_after_result: boolean;
}

export interface MeResponse {
  user: UserDTO;
  permissions: Permission[];
  must_change_password: boolean;
  player: { player_code: string; coach: { id: string; name: string } | null } | null;
  settings: PublicSettings;
}

export interface CreatedStaffResponse {
  user: UserDTO;
  /** Shown once. The user must change it at first login. */
  temp_password: string;
}

export interface DeviceSessionDTO {
  id: string;
  user_id: string;
  user_name: string;
  device_label: string | null;
  platform: string | null;
  created_at: ISODate;
  last_used_at: ISODate | null;
  expires_at: ISODate;
  current: boolean;
}

// ---- Board ---------------------------------------------------------------------------------------

export interface BoardStatus {
  mode: 'serial' | 'sim' | 'none';
  connected: boolean;
  port: string | null;
  firmware: string | null;
  buttons: number | null;
  busy: boolean;
  held_by: { name: string; since: ISODate } | null;
}

export interface SystemInfo {
  name: string;
  version: string;
  api_version: number;
  min_app_version: string;
  org_name: string;
  time: ISODate;
  board: BoardStatus;
}

// ---- Players, access and programs -----------------------------------------------------------------

export interface ProgramStageDTO {
  stage_no: number;
  label: string;
  games: GameSlug[];
}

export interface ProgramDTO {
  id: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  is_template: boolean;
  retired: boolean;
  stages: ProgramStageDTO[];
  players_using: number;
  created_at: ISODate;
}

export interface PlayerProgramDTO {
  program: ProgramDTO;
  current_stage: number;
  stage_count: number;
  progress_pct: number;
  started_at: ISODate;
}

export interface AccessItem {
  game: GameSlug;
  state: GameState;
  level_cap: number | null;
  target_sessions: number | null;
  target_level: number | null;
  target_accuracy: number | null;
  /** Set by hand; program changes do not touch it */
  manual: boolean;
  unlocked_at: ISODate | null;
  completed_at: ISODate | null;
}

export interface HubRef {
  id: string;
  name: string;
}

export interface HubDTO extends HubRef {
  city: string | null;
  is_active: boolean;
  created_at: ISODate;
  coaches: number;
  players: number;
  active_players: number;
}

export interface HubPerson {
  id: string;
  name: string;
  code: string | null;
  role: 'COACH' | 'PLAYER';
  active: boolean;
  /** Days present in the window */
  days_present: number;
  /** Days present as a share of the window, 0 to 100 */
  attendance_pct: number;
  last_seen: ISODate | null;
  rounds: number;
  accuracy: number | null;
}

export interface HubSummary {
  hub: HubDTO;
  days: number;
  players_active: number;
  players_inactive: number;
  coach_attendance_pct: number | null;
  player_attendance_pct: number | null;
  rounds: number;
  accuracy: number | null;
  avg_rt: number | null;
  /** Share of attendance rows that came from each source (auto, nfc, biometric, manual) */
  sources: Record<string, number>;
  coaches: HubPerson[];
  players: HubPerson[];
  series: { day: string; coaches: number; players: number }[];
}

export interface HubCompareRow {
  hub: HubRef;
  coaches: number;
  players: number;
  players_active: number;
  coach_attendance_pct: number | null;
  player_attendance_pct: number | null;
  rounds: number;
  accuracy: number | null;
  avg_rt: number | null;
}

export interface PlayerHistoryRow {
  id: string;
  started_at: string;
  game: string;
  level: number;
  status: string;
  accuracy: number | null;
  avg_rt: number | null;
  hits: number;
  misses: number;
}

export interface PlayerListItem {
  hub?: HubRef | null;
  id: string;
  player_code: string;
  display_name: string;
  age: number | null;
  status: 'active' | 'inactive';
  inactive_reason?: string | null;
  /** The player asked for a new PIN from the sign-in screen */
  pin_reset_requested?: boolean;
  coach: { id: string; name: string } | null;
  games_unlocked: number;
  games_total: number;
  stage: number | null;
  stage_count: number | null;
  progress_pct: number | null;
  program_name: string | null;
  last_session_at: ISODate | null;
  /** Completed-round summary: the same definitions the statistics and reports use. */
  perf: PerfSummary;
}

export interface PlayerDetail extends PlayerListItem {
  weight_kg: number | null;
  notes: string | null;
  created_at: ISODate;
  access: AccessItem[];
  program: PlayerProgramDTO | null;
  is_locked: boolean;
}

export interface CreatedPlayerResponse {
  player: PlayerDetail;
  /** Shown once on the credentials card */
  credentials: { login_id: string; pin: string };
}

export interface ResetPlayerResponse {
  credentials: { login_id: string; pin: string };
}

// ---- Games and sessions --------------------------------------------------------------------------

export interface BestDTO {
  level: number;
  value: number;
  metric: PrimaryMetricKey;
  achieved_at: ISODate;
}

export interface GameDTO {
  slug: GameSlug;
  name: string;
  tagline: string;
  accent: string;
  min_level: number;
  max_level: number;
  state: GameState;
  /** Highest level this user may select */
  level_cap: number;
  sessions_count: number;
  bests: BestDTO[];
  last_played_at: ISODate | null;
  target: { sessions: number; level: number; accuracy: number; done: number } | null;
}

export interface ModuleDTO {
  key: string;
  name: string;
  enabled: boolean;
  coming_soon: boolean;
}

export interface HowToDTO {
  slug: GameSlug;
  name: string;
  steps: { lit: number[]; tap?: number; caption: string }[];
}

export type SessionStatus = 'started' | 'completed' | 'aborted' | 'interrupted';

export interface SessionDTO {
  id: string;
  user_id: string;
  player_name?: string;
  player_code?: string;
  game: GameSlug;
  level: number;
  /** nboard, nbase, ncourt or npad */
  module_key?: string;
  transport: string | null;
  board_fw: string | null;
  started_at: ISODate;
  ended_at: ISODate | null;
  status: SessionStatus;
  score: number | null;
  summary: Summary | null;
  is_pb: boolean;
}

export interface CreateSessionResponse {
  session: { id: string; game: GameSlug; level: number; started_at: ISODate };
  level_cap: number;
  /** One use, valid 60 seconds, for the WebSocket bridge */
  board_ticket: string;
  ticket_expires_in: number;
  board: BoardStatus;
}

export interface MetricDelta {
  key: PrimaryMetricKey;
  label: string;
  unit: string;
  lower_is_better: boolean;
  value: number | null;
  previous: number | null;
  change: number | null;
  better: boolean | null;
}

export interface FinishResponse {
  session: SessionDTO;
  previous: SessionDTO | null;
  is_pb: boolean;
  delta: MetricDelta | null;
  /** Set when this session met the game's target and the game became Completed */
  state_change: GameState | null;
}

// ---- Analytics -----------------------------------------------------------------------------------

export type AnalyticsRange = 'day' | 'week' | 'month';

export interface AnalyticsResponse {
  range: AnalyticsRange;
  offset: number;
  label: string;
  from: string;
  to: string;
  timezone: string;
  game: GameSlug | null;
  totals: {
    sessions: number;
    hits: number;
    /** every event that was not a correct hit; hits + misses = events */
    misses: number;
    avg_rt: number | null;
    best_game: GameSlug | null;
    time_trained_ms: number;
    accuracy: number | null;
  };
  previous: { sessions: number; hits: number; misses: number; avg_rt: number | null; time_trained_ms: number };
  series: { key: string; label: string; sessions: number; hits: number; misses: number; avg_rt: number | null; time_ms: number }[];
  per_game: {
    game: GameSlug;
    sessions: number;
    avg_rt: number | null;
    best_value: number | null;
    metric: PrimaryMetricKey;
    /** change in median RT against the previous equal period; negative is faster */
    improvement_pct: number | null;
    fatigue_pct: number | null;
  }[];
  streak: { current: number; longest: number };
  pbs: { game: GameSlug; level: number; value: number; metric: PrimaryMetricKey; achieved_at: ISODate }[];
}

export interface OverviewResponse {
  total_players: number;
  active_players_week: number;
  sessions_week: number;
  sessions_prev_week: number;
  hits_week: number;
  avg_rt_week: number | null;
  avg_rt_prev_week: number | null;
  series: { key: string; label: string; sessions: number }[];
  by_game: { game: GameSlug; sessions: number }[];
}

export interface ActivityItem {
  id: string;
  player_id: string;
  player_name: string;
  player_code: string;
  game: GameSlug;
  level: number;
  status: SessionStatus;
  score: number | null;
  primary: number | null;
  ended_at: ISODate | null;
  is_pb: boolean;
}

export interface MyProgressResponse {
  games: GameDTO[];
  program: PlayerProgramDTO | null;
  bests: { game: GameSlug; level: number; value: number; metric: PrimaryMetricKey; achieved_at: ISODate }[];
  streak: { current: number; longest: number };
}

// ---- Audit and system ------------------------------------------------------------------------------

export interface AuditEntryDTO {
  id: number;
  ts: ISODate;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  source_ip: string | null;
}

export interface BackupResponse {
  file: string;
  bytes: number;
  created_at: ISODate;
}


// ---- Performance profile and insights --------------------------------------------------------------------------

export interface PerformancePoint {
  id: string;
  started_at: ISODate;
  game: GameSlug;
  level: number;
  accuracy: number;
  hits: number;
  misses: number;
  avg_rt: number | null;
  /** Fastest single reaction of the round */
  best_rt: number | null;
}

/** One player's performance profile: everything the coach needs on one page. */
export interface PerformanceResponse {
  summary: PerfSummary;
  /** Last rounds in time order, oldest first, for the trend charts. */
  trend: PerformancePoint[];
  levels: LevelPerf[];
  /** Last five rounds against the five before, per metric. Null while there is not enough history. */
  comparison: {
    recent: { rounds: number; accuracy: number | null; avg_rt: number | null };
    previous: { rounds: number; accuracy: number | null; avg_rt: number | null };
  } | null;
  insights: InsightsResult;
}

export interface OrgPerformanceResponse {
  players: number;
  active_players_30d: number;
  rounds_30d: number;
  accuracy_30d: number | null;
  avg_rt_30d: number | null;
  by_game: { game: GameSlug; rounds: number; accuracy: number | null; avg_rt: number | null }[];
  attention: AttentionItem[];
  insights: Insight[];
  /** True when the figures cover only the players assigned to the signed-in Coach. */
  scoped: boolean;
}
