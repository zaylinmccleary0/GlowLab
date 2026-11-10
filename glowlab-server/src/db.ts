import Database from 'better-sqlite3';
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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  base_rate_per_foot REAL NOT NULL, purchase_multiplier REAL NOT NULL,
  second_story_multiplier REAL NOT NULL, steep_roof_fee REAL NOT NULL,
  wreath_price REAL NOT NULL, pathway_stake_price REAL NOT NULL,
  tree_wrap_price REAL NOT NULL, timer_price REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  client_name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
  photo_data_url TEXT, image_width INTEGER NOT NULL DEFAULT 1000, image_height INTEGER NOT NULL DEFAULT 1000,
  calibration_json TEXT, lines_json TEXT NOT NULL DEFAULT '[]',
  preset_id TEXT NOT NULL DEFAULT 'classic-warm-white',
  estimate_options_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at);
`;

let db: Database.Database;

export function openDatabase(): Database.Database {
  if (db) return db;
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'glowlab.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

export function newId(): string { return randomUUID(); }
export function nowIso(): string { return new Date().toISOString(); }

export function createUser(name: string, email: string, passwordHash: string): DbUser {
  const user: DbUser = { id: newId(), name, email, password_hash: passwordHash, created_at: nowIso() };
  db.prepare('INSERT INTO users (id, name, email, password_hash, created_at) VALUES (@id, @name, @email, @password_hash, @created_at)').run(user);
  const p = DEFAULT_PRICING;
  db.prepare(`INSERT INTO settings (user_id, base_rate_per_foot, purchase_multiplier, second_story_multiplier, steep_roof_fee, wreath_price, pathway_stake_price, tree_wrap_price, timer_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(user.id, p.baseRatePerFoot, p.purchaseMultiplier, p.secondStoryMultiplier, p.steepRoofFee, p.wreathPrice, p.pathwayStakePrice, p.treeWrapPrice, p.timerPrice);
  return user;
}
export function getUserByEmail(email: string): DbUser | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as DbUser | undefined;
}
export function getUserById(id: string): DbUser | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
}
export function toPublicUser(user: DbUser): PublicUser { return { id: user.id, name: user.name, email: user.email }; }

export function getSettings(userId: string): PricingSettings {
  const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as Record<string, number> | undefined;
  if (!row) return { ...DEFAULT_PRICING };
  return {
    baseRatePerFoot: row.base_rate_per_foot, purchaseMultiplier: row.purchase_multiplier,
    secondStoryMultiplier: row.second_story_multiplier, steepRoofFee: row.steep_roof_fee,
    wreathPrice: row.wreath_price, pathwayStakePrice: row.pathway_stake_price,
    treeWrapPrice: row.tree_wrap_price, timerPrice: row.timer_price,
  };
}
export function saveSettings(userId: string, s: PricingSettings): void {
  db.prepare(`INSERT INTO settings (user_id, base_rate_per_foot, purchase_multiplier, second_story_multiplier, steep_roof_fee, wreath_price, pathway_stake_price, tree_wrap_price, timer_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET base_rate_per_foot=excluded.base_rate_per_foot, purchase_multiplier=excluded.purchase_multiplier,
    second_story_multiplier=excluded.second_story_multiplier, steep_roof_fee=excluded.steep_roof_fee, wreath_price=excluded.wreath_price,
    pathway_stake_price=excluded.pathway_stake_price, tree_wrap_price=excluded.tree_wrap_price, timer_price=excluded.timer_price`)
    .run(userId, s.baseRatePerFoot, s.purchaseMultiplier, s.secondStoryMultiplier, s.steepRoofFee, s.wreathPrice, s.pathwayStakePrice, s.treeWrapPrice, s.timerPrice);
}

// ----- projects -----
function toProject(row: DbProject): Project {
  return {
    id: row.id, clientName: row.client_name, address: row.address,
    photoDataUrl: row.photo_data_url, imageWidth: row.image_width, imageHeight: row.image_height,
    calibration: row.calibration_json ? (JSON.parse(row.calibration_json) as Calibration) : null,
    lines: JSON.parse(row.lines_json) as TracedLine[],
    presetId: row.preset_id,
    estimateOptions: JSON.parse(row.estimate_options_json) as EstimateOptions,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
export function listProjects(userId: string): Project[] {
  const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as DbProject[];
  return rows.map(toProject);
}
export function getProject(userId: string, id: string): Project | undefined {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as DbProject | undefined;
  return row ? toProject(row) : undefined;
}
export interface ProjectInput {
  clientName: string; address: string; photoDataUrl: string | null; imageWidth: number; imageHeight: number;
  calibration: Calibration | null; lines: TracedLine[]; presetId: string; estimateOptions: EstimateOptions;
}
export function insertProject(userId: string, input: ProjectInput): Project {
  const now = nowIso();
  const row: DbProject = {
    id: newId(), user_id: userId, client_name: input.clientName, address: input.address,
    photo_data_url: input.photoDataUrl, image_width: input.imageWidth, image_height: input.imageHeight,
    calibration_json: input.calibration ? JSON.stringify(input.calibration) : null,
    lines_json: JSON.stringify(input.lines), preset_id: input.presetId,
    estimate_options_json: JSON.stringify(input.estimateOptions), created_at: now, updated_at: now,
  };
  db.prepare(`INSERT INTO projects (id, user_id, client_name, address, photo_data_url, image_width, image_height, calibration_json, lines_json, preset_id, estimate_options_json, created_at, updated_at)
    VALUES (@id, @user_id, @client_name, @address, @photo_data_url, @image_width, @image_height, @calibration_json, @lines_json, @preset_id, @estimate_options_json, @created_at, @updated_at)`).run(row);
  return toProject(row);
}
export function updateProject(userId: string, id: string, input: ProjectInput): Project | undefined {
  const info = db.prepare(`UPDATE projects SET client_name=@client_name, address=@address, photo_data_url=@photo_data_url,
    image_width=@image_width, image_height=@image_height, calibration_json=@calibration_json, lines_json=@lines_json,
    preset_id=@preset_id, estimate_options_json=@estimate_options_json, updated_at=@updated_at WHERE id=@id AND user_id=@user_id`)
    .run({
      id, user_id: userId, client_name: input.clientName, address: input.address, photo_data_url: input.photoDataUrl,
      image_width: input.imageWidth, image_height: input.imageHeight,
      calibration_json: input.calibration ? JSON.stringify(input.calibration) : null,
      lines_json: JSON.stringify(input.lines), preset_id: input.presetId,
      estimate_options_json: JSON.stringify(input.estimateOptions), updated_at: nowIso(),
    });
  return info.changes > 0 ? getProject(userId, id) : undefined;
}
export function deleteProject(userId: string, id: string): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}
export { DEFAULT_ESTIMATE_OPTIONS };
