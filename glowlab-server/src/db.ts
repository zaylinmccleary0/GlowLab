import { createClient, type Client, type InValue } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Calibration, EstimateOptions, PricingSettings, Project, PublicUser, TracedLine } from '@glowlab/shared';
import { DEFAULT_PRICING, DEFAULT_ESTIMATE_OPTIONS } from '@glowlab/shared';

export interface DbUser { id: string; name: string; email: string; password_hash: string; created_at: string; }

interface DbProject {
  id: string; user_id: string; client_name: string; address: string;
  photo_data_url: string | null; image_width: number; image_height: number;
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
  tree_wrap_price REAL NOT NULL, timer_price REAL NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  client_name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  photo_data_url TEXT, image_width INTEGER NOT NULL DEFAULT 1000, image_height INTEGER NOT NULL DEFAULT 1000,
  calibration_json TEXT, lines_json TEXT NOT NULL DEFAULT '[]',
  preset_id TEXT NOT NULL DEFAULT 'classic-warm-white',
  estimate_options_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at)`,
];

let client: Client | null = null;
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

export async function createUser(name: string, email: string, passwordHash: string): Promise<DbUser> {
  const user: DbUser = { id: newId(), name, email, password_hash: passwordHash, created_at: nowIso() };
  const p = DEFAULT_PRICING;
  const db = await openDatabase();
  await db.batch([
    { sql: 'INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', args: [user.id, user.name, user.email, user.password_hash, user.created_at] },
    {
      sql: `INSERT INTO settings (user_id, base_rate_per_foot, purchase_multiplier, second_story_multiplier, steep_roof_fee, wreath_price, pathway_stake_price, tree_wrap_price, timer_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [user.id, p.baseRatePerFoot, p.purchaseMultiplier, p.secondStoryMultiplier, p.steepRoofFee, p.wreathPrice, p.pathwayStakePrice, p.treeWrapPrice, p.timerPrice],
    },
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
  const row = await one<Record<string, number>>('SELECT * FROM settings WHERE user_id = ?', [userId]);
  if (!row) return { ...DEFAULT_PRICING };
  return {
    baseRatePerFoot: row.base_rate_per_foot, purchaseMultiplier: row.purchase_multiplier,
    secondStoryMultiplier: row.second_story_multiplier, steepRoofFee: row.steep_roof_fee,
    wreathPrice: row.wreath_price, pathwayStakePrice: row.pathway_stake_price,
    treeWrapPrice: row.tree_wrap_price, timerPrice: row.timer_price,
  };
}
export async function saveSettings(userId: string, s: PricingSettings): Promise<void> {
  await run(`INSERT INTO settings (user_id, base_rate_per_foot, purchase_multiplier, second_story_multiplier, steep_roof_fee, wreath_price, pathway_stake_price, tree_wrap_price, timer_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET base_rate_per_foot=excluded.base_rate_per_foot, purchase_multiplier=excluded.purchase_multiplier,
    second_story_multiplier=excluded.second_story_multiplier, steep_roof_fee=excluded.steep_roof_fee, wreath_price=excluded.wreath_price,
    pathway_stake_price=excluded.pathway_stake_price, tree_wrap_price=excluded.tree_wrap_price, timer_price=excluded.timer_price`,
  [userId, s.baseRatePerFoot, s.purchaseMultiplier, s.secondStoryMultiplier, s.steepRoofFee, s.wreathPrice, s.pathwayStakePrice, s.treeWrapPrice, s.timerPrice]);
}

// ----- projects -----
function toProject(row: DbProject): Project {
  return {
    id: row.id, clientName: row.client_name, address: row.address,
    photoDataUrl: row.photo_data_url ?? null, imageWidth: Number(row.image_width), imageHeight: Number(row.image_height),
    calibration: row.calibration_json ? (JSON.parse(row.calibration_json) as Calibration) : null,
    lines: JSON.parse(row.lines_json) as TracedLine[],
    presetId: row.preset_id,
    estimateOptions: JSON.parse(row.estimate_options_json) as EstimateOptions,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
/**
 * The list leaves photos out (photoDataUrl is null) so the response stays small:
 * Vercel caps function responses at 4.5 MB. Fetch one project to get its photo.
 */
export async function listProjects(userId: string): Promise<Project[]> {
  const rows = await all<DbProject>(
    `SELECT id, user_id, client_name, address, NULL AS photo_data_url, image_width, image_height, calibration_json,
      lines_json, preset_id, estimate_options_json, created_at, updated_at
     FROM projects WHERE user_id = ? ORDER BY updated_at DESC`, [userId]);
  return rows.map(toProject);
}
export async function getProject(userId: string, id: string): Promise<Project | undefined> {
  const row = await one<DbProject>('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
  return row ? toProject(row) : undefined;
}
export interface ProjectInput {
  clientName: string; address: string; photoDataUrl: string | null; imageWidth: number; imageHeight: number;
  calibration: Calibration | null; lines: TracedLine[]; presetId: string; estimateOptions: EstimateOptions;
}
export async function insertProject(userId: string, input: ProjectInput): Promise<Project> {
  const now = nowIso();
  const row: DbProject = {
    id: newId(), user_id: userId, client_name: input.clientName, address: input.address,
    photo_data_url: input.photoDataUrl, image_width: input.imageWidth, image_height: input.imageHeight,
    calibration_json: input.calibration ? JSON.stringify(input.calibration) : null,
    lines_json: JSON.stringify(input.lines), preset_id: input.presetId,
    estimate_options_json: JSON.stringify(input.estimateOptions), created_at: now, updated_at: now,
  };
  await run(`INSERT INTO projects (id, user_id, client_name, address, photo_data_url, image_width, image_height, calibration_json, lines_json, preset_id, estimate_options_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [row.id, row.user_id, row.client_name, row.address, row.photo_data_url, row.image_width, row.image_height, row.calibration_json, row.lines_json, row.preset_id, row.estimate_options_json, row.created_at, row.updated_at]);
  return toProject(row);
}
export async function updateProject(userId: string, id: string, input: ProjectInput): Promise<Project | undefined> {
  const changes = await run(`UPDATE projects SET client_name=?, address=?, photo_data_url=?, image_width=?, image_height=?,
    calibration_json=?, lines_json=?, preset_id=?, estimate_options_json=?, updated_at=? WHERE id=? AND user_id=?`,
  [input.clientName, input.address, input.photoDataUrl, input.imageWidth, input.imageHeight,
    input.calibration ? JSON.stringify(input.calibration) : null, JSON.stringify(input.lines), input.presetId,
    JSON.stringify(input.estimateOptions), nowIso(), id, userId]);
  return changes > 0 ? getProject(userId, id) : undefined;
}
export async function deleteProject(userId: string, id: string): Promise<boolean> {
  return (await run('DELETE FROM projects WHERE id = ? AND user_id = ?', [id, userId])) > 0;
}
export { DEFAULT_ESTIMATE_OPTIONS };
