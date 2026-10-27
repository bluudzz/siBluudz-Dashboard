import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const dataDirectory = path.resolve(process.env.DATA_DIRECTORY || path.join(__dirname, '..', 'data'))

await mkdir(dataDirectory, { recursive: true })

export const db = new Database(path.join(dataDirectory, 'sibluudz.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  create table if not exists users (
    id text primary key,
    email text not null collate nocase unique,
    password_hash text,
    google_sub text unique,
    name text not null default '',
    company text not null default '',
    phone text not null default '',
    address text not null default '',
    role text not null default 'user',
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  );
  create table if not exists sessions (
    token_hash text primary key,
    user_id text not null references users(id) on delete cascade,
    expires_at integer not null
  );
  create index if not exists sessions_user_id_idx on sessions(user_id);
  create table if not exists invoices (
    user_id text not null references users(id) on delete cascade,
    id text not null,
    data text not null,
    updated_at text not null default (datetime('now')),
    primary key (user_id, id)
  );
  create table if not exists mail_accounts (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    label text not null,
    email text not null,
    host text not null,
    port integer not null,
    username text not null,
    encrypted_credentials text not null,
    created_at text not null default (datetime('now')),
    unique (user_id, email)
  );
  create index if not exists mail_accounts_user_idx on mail_accounts(user_id, created_at desc);
  create table if not exists ai_usage_logs (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    prompt_tokens integer default 0,
    completion_tokens integer default 0,
    model text not null default '',
    type text not null default 'prompt_builder',
    created_at text not null default (datetime('now'))
  );
  create index if not exists ai_usage_logs_user_date_idx on ai_usage_logs(user_id, created_at);
  create table if not exists ai_history (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    type text not null,
    model text not null,
    prompt text not null,
    result text not null,
    created_at text not null default (datetime('now'))
  );
  create index if not exists ai_history_user_idx on ai_history(user_id, created_at desc);
  create table if not exists app_settings (
    key text primary key,
    value text not null
  );
  create table if not exists workflows (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    name text not null,
    description text default '',
    nodes text not null default '[]',
    edges text not null default '[]',
    is_active integer default 0,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  );
  create index if not exists workflows_user_idx on workflows(user_id, updated_at desc);
  create table if not exists workflow_media (
    token text primary key,
    user_id text not null references users(id) on delete cascade,
    filename text not null,
    mime_type text not null,
    created_at text not null default (datetime('now'))
  );
  create index if not exists workflow_media_user_idx on workflow_media(user_id, created_at desc);
  create table if not exists google_drive_accounts (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    email text not null,
    encrypted_refresh_token text not null,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now')),
    unique(user_id,email)
  );
  create index if not exists google_drive_accounts_user_idx on google_drive_accounts(user_id);
  create table if not exists instagram_accounts (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    label text not null,
    ig_user_id text not null,
    username text not null default '',
    auth_mode text not null,
    encrypted_token text not null,
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  );
  create index if not exists instagram_accounts_user_idx on instagram_accounts(user_id, created_at desc);
  create table if not exists instagram_publications (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    workflow_id text not null references workflows(id) on delete cascade,
    node_id text not null,
    content_hash text not null,
    account_id text not null references instagram_accounts(id) on delete cascade,
    status text not null,
    media_id text not null default '',
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now')),
    unique(user_id,workflow_id,node_id,content_hash)
  );
  create table if not exists workflow_runs (
    id text primary key,
    workflow_id text not null references workflows(id) on delete cascade,
    user_id text not null references users(id) on delete cascade,
    status text not null default 'running',
    trigger_type text not null default 'manual',
    logs text not null default '[]',
    result text default '',
    started_at text not null default (datetime('now')),
    completed_at text
  );
  create index if not exists workflow_runs_wf_idx on workflow_runs(workflow_id, started_at desc);
  create table if not exists workflow_chat_memory (
    user_id text not null references users(id) on delete cascade,
    workflow_id text not null references workflows(id) on delete cascade,
    memory_node_id text not null,
    session_key text not null,
    messages text not null default '[]',
    updated_at text not null default (datetime('now')),
    primary key (user_id,workflow_id,memory_node_id,session_key)
  );
`)

// Dynamic column migrations for users
try {
  const userCols = db.prepare('pragma table_info(users)').all().map((c) => c.name)
  if (!userCols.includes('tier')) {
    db.exec(`alter table users add column tier text not null default 'free'`)
  }
  if (!userCols.includes('ai_daily_limit')) {
    db.exec(`alter table users add column ai_daily_limit integer default 5`)
  }
  if (!userCols.includes('username')) {
    db.exec(`alter table users add column username text collate nocase`)
    db.exec(`create unique index if not exists users_username_unique on users(username) where username is not null`)
  }
  db.prepare(`
    update users set username = 'admin'
    where lower(email) = 'johanhabibie12@gmail.com' and (username is null or username = '')
  `).run()
} catch (migErr) {
  console.warn('Migration check (users):', migErr)
}

// Dynamic column migrations for mail_accounts
try {
  const mailCols = db.prepare('pragma table_info(mail_accounts)').all().map((c) => c.name)
  if (!mailCols.includes('auth_type')) {
    db.exec(`alter table mail_accounts add column auth_type text not null default 'password'`)
  }
  if (!mailCols.includes('provider')) {
    db.exec(`alter table mail_accounts add column provider text not null default 'custom'`)
  }
  if (!mailCols.includes('status')) {
    db.exec(`alter table mail_accounts add column status text not null default 'valid'`)
  }
  if (!mailCols.includes('invalid_reason')) {
    db.exec(`alter table mail_accounts add column invalid_reason text`)
  }
} catch (migErr) {
  console.warn('mail_accounts migration check:', migErr)
}

// Dynamic column migrations for ai_usage_logs
try {
  const aiLogCols = db.prepare('pragma table_info(ai_usage_logs)').all().map((c) => c.name)
  if (!aiLogCols.includes('prompt_tokens')) {
    db.exec(`alter table ai_usage_logs add column prompt_tokens integer default 0`)
  }
  if (!aiLogCols.includes('completion_tokens')) {
    db.exec(`alter table ai_usage_logs add column completion_tokens integer default 0`)
  }
  if (!aiLogCols.includes('type')) {
    db.exec(`alter table ai_usage_logs add column type text default 'prompt_builder'`)
  }
} catch (migErr) {
  console.warn('ai_usage_logs migration check:', migErr)
}

export function getSetting(key, defaultValue = '') {
  try {
    const row = db.prepare('select value from app_settings where key = ?').get(key)
    return row ? row.value : defaultValue
  } catch {
    return defaultValue
  }
}

export function setSetting(key, value) {
  db.prepare(`
    insert into app_settings (key, value) values (?, ?)
    on conflict(key) do update set value = excluded.value
  `).run(key, String(value))
}

export function getNineRouterConfig() {
  const baseUrl = getSetting('ninerouter_base_url', process.env.NINEROUTER_BASE_URL || 'https://api.9router.com/v1').replace(/\/+$/, '')
  const apiKey = getSetting('ninerouter_api_key', process.env.NINEROUTER_API_KEY || '')
  const model = getSetting('ninerouter_model', process.env.NINEROUTER_MODEL || '')
  const freeDailyLimit = Number(getSetting('free_ai_daily_limit', process.env.FREE_AI_DAILY_LIMIT || '5'))
  const proDailyLimit = Number(getSetting('pro_ai_daily_limit', process.env.PRO_AI_DAILY_LIMIT || '100'))
  return { baseUrl, apiKey, model, freeDailyLimit, proDailyLimit }
}
