import { createClient, type Client, type InValue } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Calibration, EstimateOptions, PricingSettings, Project, PublicUser, TracedLine } from '@glowlab/shared';
import {
  DEFAULT_PRICING, DEFAULT_ESTIMATE_OPTIONS, DEFAULT_PERMANENT_RATES, DEFAULT_BULB_SPACING_INCHES,
  normalizeEstimateOptions, validatePricingSettings,
} from '@glowlab/shared';

export interface DbUser { id: string; name: string; email: string; password_hash: string; created_at: string; }

interface DbProject {
  id: string; user_id: string; client_name: string; address: string;
  photo_data_url: string | null; thumb_data_url: string | null; has_photo?: number; image_width: number; image_height: number;
  calibration_json: string | null; lines_json: string; preset_id: string;
  estimate_options_json: string; created_at: string; updated_at: string;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  base_rate_per_foot REAL NOT NULL, purchase_multiplier REAL NOT NULL,
  second_story_multiplier REAL NOT NULL, steep_roof_fee REAL NOT NULL,
  wreath_price REAL NOT NULL, pathway_stake_price REAL NOT NULL,
  tree_wrap_price REAL NOT NULL, timer_price REAL NOT NULL,
  profiles_json TEXT
)`,
  `CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  client_name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  photo_data_url TEXT, thumb_data_url TEXT, image_width INTEGER NOT NULL DEFAULT 1000, image_height INTEGER NOT NULL DEFAULT 1000,
  calibration_json TEXT, lines_json TEXT NOT NULL DEFAULT '[]',
  preset_id TEXT NOT NULL DEFAULT 'classic-warm-white',
  estimate_options_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at)`,
];

let client: Client | null = null;

/** Adds columns introduced after a database was first created. */
async function migrate(db: Client): Promise<void> {
  const cols = await db.execute('PRAGMA table_info(settings)');
  if (!cols.rows.some((r) => r.name === 'profiles_json')) {
    await db.execute('ALTER TABLE settings ADD COLUMN profiles_json TEXT');
  }
  const pcols = await db.execute('PRAGMA table_info(projects)');
  if (!pcols.rows.some((r) => r.name === 'thumb_data_url')) {
    await db.execute('ALTER TABLE projects ADD COLUMN thumb_data_url TEXT');
  }
}
let ready: Promise<Client> | null = null;

/**
 * Turso in production (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN), a local SQLite file otherwise.
 * The schema is created once per process; every query awaits it.
 */
export function openDatabase(): Promise<Client> {
  if (ready) return ready;
  ready = (async () => {
    const url = process.env.TURSO_DATABASE_URL;
    if (url) {
      client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    } else {
      const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'glowlab.db');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      client = createClient({ url: `file:${dbPath}` });
    }
    await client.batch(SCHEMA, 'write');
    await migrate(client);
    return client;
  })().catch((err) => { ready = null; throw err; });
  return ready;
}

async function all<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  const db = await openDatabase();
  const rs = await db.execute({ sql, args });
  return rs.rows as unknown as T[];
}
async function one<T>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}
async function run(sql: string, args: InValue[] = []): Promise<number> {
  const db = await openDatabase();
  return (await db.execute({ sql, args })).rowsAffected;
}

export function newId(): string { return randomUUID(); }
export function nowIso(): string { return new Date().toISOString(); }

/**
 * Settings rows keep the original per-column prices (from before price lists existed)
 * alongside profiles_json. New code reads/writes profiles_json; the old columns are still
 * filled from the first price list's seasonal prices because they are NOT NULL.
 */
const SETTINGS_UPSERT = `INSERT INTO settings (user_id, base_rate_per_foot, purchase_multiplier, second_story_multiplier, steep_roof_fee, wreath_price, pathway_stake_price, tree_wrap_price, timer_price, profiles_json)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET base_rate_per_foot=excluded.base_rate_per_foot,
    second_story_multiplier=excluded.second_story_multiplier, steep_roof_fee=excluded.steep_roof_fee, wreath_price=excluded.wreath_price,
    pathway_stake_price=excluded.pathway_stake_price, tree_wrap_price=excluded.tree_wrap_price, timer_price=excluded.timer_price,
    profiles_json=excluded.profiles_json`;
function settingsArgs(userId: string, s: PricingSettings): InValue[] {
  const c = s.profiles[0].seasonal;
  return [userId, c.ratePerFoot, c.secondStoryMultiplier, c.steepRoofFee, c.wreathPrice, c.pathwayStakePrice, c.treeWrapPrice, c.timerPrice, JSON.stringify(s)];
}

export async function createUser(name: string, email: string, passwordHash: string): Promise<DbUser> {
  const user: DbUser = { id: newId(), name, email, password_hash: passwordHash, created_at: nowIso() };
  const db = await openDatabase();
  await db.batch([
    { sql: 'INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', args: [user.id, user.name, user.email, user.password_hash, user.created_at] },
    { sql: SETTINGS_UPSERT, args: settingsArgs(user.id, DEFAULT_PRICING) },
  ], 'write');
  return user;
}
export function getUserByEmail(email: string): Promise<DbUser | undefined> {
  return one<DbUser>('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
}
export function getUserById(id: string): Promise<DbUser | undefined> {
  return one<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
}
export function toPublicUser(user: DbUser): PublicUser { return { id: user.id, name: user.name, email: user.email }; }

export async function getSettings(userId: string): Promise<PricingSettings> {
  const row = await one<Record<string, number | string | null>>('SELECT * FROM settings WHERE user_id = ?', [userId]);
  if (!row) return structuredClone(DEFAULT_PRICING);
  if (typeof row.profiles_json === 'string') {
    const { settings } = validatePricingSettings(JSON.parse(row.profiles_json));
    if (settings) return settings;
  }
  // Settings saved before price lists existed: their prices become the seasonal side
  // of a "Standard" list; permanent gets the defaults; bulbs every 15".
  const n = (k: string) => Number(row[k]);
  return {
    profiles: [{
      id: 'standard', name: 'Standard', bulbSpacingInches: DEFAULT_BULB_SPACING_INCHES,
      seasonal: {
        ratePerFoot: n('base_rate_per_foot'), secondStoryMultiplier: n('second_story_multiplier'), steepRoofFee: n('steep_roof_fee'),
        wreathPrice: n('wreath_price'), pathwayStakePrice: n('pathway_stake_price'), treeWrapPrice: n('tree_wrap_price'), timerPrice: n('timer_price'),
      },
      permanent: { ...DEFAULT_PERMANENT_RATES },
    }],
  };
}
export async function saveSettings(userId: string, s: PricingSettings): Promise<void> {
  await run(SETTINGS_UPSERT, settingsArgs(userId, s));
}

// ----- projects -----
function toProject(row: DbProject): Project {
  return {
    id: row.id, clientName: row.client_name, address: row.address,
    photoDataUrl: row.photo_data_url ?? null, thumbDataUrl: row.thumb_data_url ?? null,
    hasPhoto: row.has_photo !== undefined && row.has_photo !== null ? Number(row.has_photo) === 1 : Boolean(row.photo_data_url),
    imageWidth: Number(row.image_width), imageHeight: Number(row.image_height),
    calibration: row.calibration_json ? (JSON.parse(row.calibration_json) as Calibration) : null,
    lines: JSON.parse(row.lines_json) as TracedLine[],
    presetId: row.preset_id,
    estimateOptions: normalizeEstimateOptions(JSON.parse(row.estimate_options_json) as EstimateOptions),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
/**
 * The list leaves full photos out (photoDataUrl is null) so the response stays small:
 * Vercel caps function responses at 4.5 MB. It includes the small preview (thumbDataUrl)
 * and hasPhoto. Fetch one project to get its full photo.
 */
export async function listProjects(userId: string): Promise<Project[]> {
  const rows = await all<DbProject>(
    `SELECT id, user_id, client_name, address, NULL AS photo_data_url, thumb_data_url, (photo_data_url IS NOT NULL) AS has_photo, image_width, image_height, calibration_json,
      lines_json, preset_id, estimate_options_json, created_at, updated_at
     FROM projects WHERE user_id = ? ORDER BY updated_at DESC`, [userId]);
  return rows.map(toProject);
}
export async function getProject(userId: string, id: string): Promise<Project | undefined> {
  const row = await one<DbProject>('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
  return row ? toProject(row) : undefined;
}
export interface ProjectInput {
  clientName: string; address: string; photoDataUrl: string | null; thumbDataUrl: string | null; imageWidth: number; imageHeight: number;
  calibration: Calibration | null; lines: TracedLine[]; presetId: string; estimateOptions: EstimateOptions;
}
export async function insertProject(userId: string, input: ProjectInput): Promise<Project> {
  const now = nowIso();
  const row: DbProject = {
    id: newId(), user_id: userId, client_name: input.clientName, address: input.address,
    photo_data_url: input.photoDataUrl, thumb_data_url: input.thumbDataUrl, image_width: input.imageWidth, image_height: input.imageHeight,
    calibration_json: input.calibration ? JSON.stringify(input.calibration) : null,
    lines_json: JSON.stringify(input.lines), preset_id: input.presetId,
    estimate_options_json: JSON.stringify(input.estimateOptions), created_at: now, updated_at: now,
  };
  await run(`INSERT INTO projects (id, user_id, client_name, address, photo_data_url, thumb_data_url, image_width, image_height, calibration_json, lines_json, preset_id, estimate_options_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [row.id, row.user_id, row.client_name, row.address, row.photo_data_url, row.thumb_data_url, row.image_width, row.image_height, row.calibration_json, row.lines_json, row.preset_id, row.estimate_options_json, row.created_at, row.updated_at]);
  return toProject(row);
}
export async function updateProject(userId: string, id: string, input: ProjectInput): Promise<Project | undefined> {
  const changes = await run(`UPDATE projects SET client_name=?, address=?, photo_data_url=?, thumb_data_url=?, image_width=?, image_height=?,
    calibration_json=?, lines_json=?, preset_id=?, estimate_options_json=?, updated_at=? WHERE id=? AND user_id=?`,
  [input.clientName, input.address, input.photoDataUrl, input.thumbDataUrl, input.imageWidth, input.imageHeight,
    input.calibration ? JSON.stringify(input.calibration) : null, JSON.stringify(input.lines), input.presetId,
    JSON.stringify(input.estimateOptions), nowIso(), id, userId]);
  return changes > 0 ? getProject(userId, id) : undefined;
}
export async function deleteProject(userId: string, id: string): Promise<boolean> {
  return (await run('DELETE FROM projects WHERE id = ? AND user_id = ?', [id, userId])) > 0;
}
export { DEFAULT_ESTIMATE_OPTIONS };
