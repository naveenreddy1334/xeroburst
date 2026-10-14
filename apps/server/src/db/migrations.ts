// Versioned migrations, tracked with PRAGMA user_version. The server refuses to start when the
// database is newer than this code (section 16.3). Add a new entry to the end to change the schema.

export const MIGRATIONS: string[] = [
  /* 1 */ `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    login_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','COACH','PLAYER')),
    password_hash TEXT NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    lock_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE role_permissions (
    role TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (role, permission)
  );

  CREATE TABLE user_permission_grants (
    user_id TEXT NOT NULL REFERENCES users(id),
    permission TEXT NOT NULL,
    granted_by TEXT,
    granted_at TEXT NOT NULL,
    PRIMARY KEY (user_id, permission)
  );

  CREATE TABLE player_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    player_code TEXT NOT NULL UNIQUE,
    coach_id TEXT NOT NULL REFERENCES users(id),
    age INTEGER,
    weight_kg REAL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
  );
  CREATE INDEX idx_player_coach ON player_profiles(coach_id);

  CREATE TABLE modules (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE games (
    id INTEGER PRIMARY KEY,
    module_key TEXT NOT NULL REFERENCES modules(key),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    min_level INTEGER NOT NULL DEFAULT 1,
    max_level INTEGER NOT NULL DEFAULT 10,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE player_game_access (
    player_id TEXT NOT NULL REFERENCES users(id),
    game_id INTEGER NOT NULL REFERENCES games(id),
    state TEXT NOT NULL DEFAULT 'locked' CHECK (state IN ('locked','unlocked','completed')),
    level_cap INTEGER,
    target_sessions INTEGER,
    target_level INTEGER,
    target_accuracy REAL,
    manual INTEGER NOT NULL DEFAULT 0,
    unlocked_at TEXT,
    unlocked_by TEXT,
    completed_at TEXT,
    PRIMARY KEY (player_id, game_id)
  );

  CREATE TABLE programs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT REFERENCES users(id),
    is_template INTEGER NOT NULL DEFAULT 0,
    retired INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE program_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    stage_no INTEGER NOT NULL,
    label TEXT NOT NULL,
    UNIQUE (program_id, stage_no)
  );

  CREATE TABLE program_stage_games (
    stage_id INTEGER NOT NULL REFERENCES program_stages(id) ON DELETE CASCADE,
    game_id INTEGER NOT NULL REFERENCES games(id),
    PRIMARY KEY (stage_id, game_id)
  );

  CREATE TABLE player_programs (
    player_id TEXT PRIMARY KEY REFERENCES users(id),
    program_id TEXT NOT NULL REFERENCES programs(id),
    current_stage INTEGER NOT NULL DEFAULT 1,
    started_at TEXT NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    game_id INTEGER NOT NULL REFERENCES games(id),
    level INTEGER NOT NULL,
    transport TEXT,
    board_fw TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed','aborted','interrupted')),
    score REAL,
    summary_json TEXT,
    is_pb INTEGER NOT NULL DEFAULT 0,
    created_server_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_user_game ON sessions(user_id, game_id, started_at);
  CREATE INDEX idx_sessions_started ON sessions(started_at);

  CREATE TABLE hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    target_btn INTEGER,
    pressed_btn INTEGER,
    rt_ms INTEGER,
    correct INTEGER NOT NULL,
    distractor INTEGER NOT NULL DEFAULT 0,
    t_ms INTEGER NOT NULL,
    len INTEGER,
    step INTEGER
  );
  CREATE INDEX idx_hits_session ON hits(session_id);

  CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    refresh_hash TEXT NOT NULL,
    prev_refresh_hash TEXT,
    device_label TEXT,
    platform TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE INDEX idx_auth_refresh ON auth_sessions(refresh_hash);
  CREATE INDEX idx_auth_prev ON auth_sessions(prev_refresh_hash);
  CREATE INDEX idx_auth_user ON auth_sessions(user_id);

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    detail_json TEXT,
    source_ip TEXT
  );
  CREATE INDEX idx_audit_ts ON audit_log(ts);

  -- The audit log is append-only: no edits, no deletes (section 14).
  CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
  CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: product renamed to XeroBurst. Only touches rows still holding the old default names.
  `
  UPDATE settings SET value = 'XeroBurst' WHERE key = 'org_name' AND value = 'nBoard';
  UPDATE modules SET name = 'Reaction Board' WHERE key = 'nboard' AND name = 'nBoard';
  `,
  // 3: staff contact details (required for new Coach/Admin accounts; existing rows stay valid with NULLs)
  // and the module a round was played in (existing rounds are nboard).
  `
  ALTER TABLE users ADD COLUMN email TEXT;
  ALTER TABLE users ADD COLUMN phone TEXT;
  ALTER TABLE users ADD COLUMN age INTEGER;
  ALTER TABLE sessions ADD COLUMN module_key TEXT NOT NULL DEFAULT 'nboard';
  `,
  // 4: a coach or admin can record a round for a player (Assess). user_id stays the player; recorded_by is the staff member.
  `
  ALTER TABLE sessions ADD COLUMN recorded_by TEXT;
  `,
  // 5: why an account was marked inactive (shown on the profile, cleared on reactivation).
  `
  ALTER TABLE users ADD COLUMN inactive_reason TEXT;
  `,
  // 6: a player can ask for a new PIN from the sign-in screen; the coach sees the request and clears it by issuing one.
  `
  ALTER TABLE player_profiles ADD COLUMN pin_reset_requested INTEGER NOT NULL DEFAULT 0;
  `,
  // 7: hubs (training locations). Each coach and player belongs to at most one hub; attendance is recorded per person per local
  // day with its source, so biometric or NFC check-ins can be added later without changing the table.
  `
  CREATE TABLE hubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_hubs_name ON hubs(name COLLATE NOCASE);
  ALTER TABLE users ADD COLUMN hub_id TEXT;
  CREATE INDEX idx_users_hub ON users(hub_id);
  CREATE TABLE attendance (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    hub_id TEXT,
    source TEXT NOT NULL DEFAULT 'auto',
    first_at TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  CREATE INDEX idx_att_hub_day ON attendance(hub_id, day);
  `,
];
