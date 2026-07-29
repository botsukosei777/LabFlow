-- LabFlow Database Schema
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- ユーザー
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- セッション
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 実験種（例：Western Blot、RT-qPCR、Cell Culture）
CREATE TABLE IF NOT EXISTS experiment_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366F1',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- サブプロトコル (再利用可能な操作や試薬表)
CREATE TABLE IF NOT EXISTS sub_protocols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ステップ（複数パターン対応）
CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_type_id INTEGER NOT NULL,
    pattern_label TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    is_overnight INTEGER NOT NULL DEFAULT 0,
    sub_protocol TEXT DEFAULT '',
    sub_protocol_id INTEGER,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (experiment_type_id) REFERENCES experiment_types(id) ON DELETE CASCADE,
    FOREIGN KEY (sub_protocol_id) REFERENCES sub_protocols(id) ON DELETE SET NULL
);

-- ステップの事前操作 / in-advance メッセージ定義
CREATE TABLE IF NOT EXISTS step_preparations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    timing_type TEXT NOT NULL DEFAULT 'before_experiment', -- 'before_experiment' or 'after_step'
    timing_step_id INTEGER, -- if timing_type is 'after_step'
    timing_offset_minutes INTEGER DEFAULT 0, -- if timing_type is 'before_experiment'
    requires_check INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE,
    FOREIGN KEY (timing_step_id) REFERENCES steps(id) ON DELETE SET NULL
);

-- ブロック（1日で行うステップの集合、複数パターン対応）
CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_type_id INTEGER NOT NULL,
    pattern_label TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (experiment_type_id) REFERENCES experiment_types(id) ON DELETE CASCADE
);

-- ブロックに含まれるステップ
CREATE TABLE IF NOT EXISTS block_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_id INTEGER NOT NULL,
    step_id INTEGER NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE,
    FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE
);

-- プロトコル（ブロックの集合 = 実験全体の流れ）
CREATE TABLE IF NOT EXISTS protocols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    experiment_type_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (experiment_type_id) REFERENCES experiment_types(id) ON DELETE CASCADE
);

-- プロトコルに含まれるブロック
CREATE TABLE IF NOT EXISTS protocol_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id INTEGER NOT NULL,
    block_id INTEGER NOT NULL,
    day_offset INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE,
    FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE
);

-- スケジュールされた実験
CREATE TABLE IF NOT EXISTS scheduled_experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    protocol_id INTEGER NOT NULL,
    label TEXT DEFAULT '',
    start_date TEXT NOT NULL,
    start_time TEXT DEFAULT '09:00',
    mode TEXT NOT NULL DEFAULT 'management',
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE
);

-- スケジュールされた個別ブロック
CREATE TABLE IF NOT EXISTS scheduled_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scheduled_experiment_id INTEGER NOT NULL,
    protocol_block_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    end_date TEXT,
    start_time TEXT,
    end_time TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_at TEXT,
    FOREIGN KEY (scheduled_experiment_id) REFERENCES scheduled_experiments(id) ON DELETE CASCADE,
    FOREIGN KEY (protocol_block_id) REFERENCES protocol_blocks(id) ON DELETE CASCADE
);

-- スケジュールされた個別ステップ
CREATE TABLE IF NOT EXISTS scheduled_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scheduled_block_id INTEGER NOT NULL,
    block_step_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_at TEXT,
    start_date TEXT,
    end_date TEXT,
    start_time TEXT,
    end_time TEXT,
    FOREIGN KEY (scheduled_block_id) REFERENCES scheduled_blocks(id) ON DELETE CASCADE,
    FOREIGN KEY (block_step_id) REFERENCES block_steps(id) ON DELETE CASCADE
);

-- スケジュールされた事前操作 (実行チェック用)
CREATE TABLE IF NOT EXISTS scheduled_step_preparations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scheduled_step_id INTEGER NOT NULL,
    step_preparation_id INTEGER NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    FOREIGN KEY (scheduled_step_id) REFERENCES scheduled_steps(id) ON DELETE CASCADE,
    FOREIGN KEY (step_preparation_id) REFERENCES step_preparations(id) ON DELETE CASCADE
);

-- マイルストーン
CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS milestone_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    data_type TEXT NOT NULL DEFAULT 'qualitative',
    target_count INTEGER DEFAULT 1,
    current_count INTEGER DEFAULT 0,
    is_completed INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE
);

-- マイルストーン サブ目標
CREATE TABLE IF NOT EXISTS milestone_sub_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    data_type TEXT NOT NULL DEFAULT 'qualitative',
    target_count INTEGER DEFAULT 1,
    current_count INTEGER DEFAULT 0,
    is_completed INTEGER NOT NULL DEFAULT 0,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (milestone_item_id) REFERENCES milestone_items(id) ON DELETE CASCADE
);

-- 試薬・物品在庫
CREATE TABLE IF NOT EXISTS reagents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT '',
    quantity_trackable INTEGER NOT NULL DEFAULT 0,
    current_quantity INTEGER DEFAULT 0,
    min_quantity INTEGER DEFAULT 0,
    unit TEXT DEFAULT '',
    is_depleted INTEGER NOT NULL DEFAULT 0,
    supplier TEXT DEFAULT '',
    catalog_number TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS experiment_reagents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_type_id INTEGER NOT NULL,
    reagent_id INTEGER NOT NULL,
    quantity_per_experiment INTEGER DEFAULT 0,
    FOREIGN KEY (experiment_type_id) REFERENCES experiment_types(id) ON DELETE CASCADE,
    FOREIGN KEY (reagent_id) REFERENCES reagents(id) ON DELETE CASCADE,
    UNIQUE(experiment_type_id, reagent_id)
);

-- ルーティンワーク
CREATE TABLE IF NOT EXISTS routine_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    recurrence TEXT NOT NULL DEFAULT 'daily',
    recurrence_days TEXT DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS routine_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_task_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    completed_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (routine_task_id) REFERENCES routine_tasks(id) ON DELETE CASCADE,
    UNIQUE(routine_task_id, date)
);

-- 実験ノート (Experiment Notebooks)
CREATE TABLE IF NOT EXISTS notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    file_path TEXT DEFAULT '',
    date TEXT NOT NULL,
    scheduled_experiment_id INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (scheduled_experiment_id) REFERENCES scheduled_experiments(id) ON DELETE SET NULL
);

-- 設定
CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (key, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 休日
CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    label TEXT DEFAULT '',
    recurring INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
);

-- イベント (セミナー等)
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    color TEXT DEFAULT '#3B82F6',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
