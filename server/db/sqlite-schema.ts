import Database, { type Database as DatabaseType } from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../lib/logger.js';

type TableSpec = {
  name: string;
  createSql: string;
  indexSql: string[];
  copyColumns: string[];
  primaryKey: string[];
  uniqueGroups?: string[][];
};

const CORE_TABLES = [
  'projects',
  'users',
  'pivot_users_projects',
  'scout_items',
  'scout_item_notes',
  'scout_item_links',
  'audit_log',
  'webhooks',
  'api_keys',
] as const;

const TABLE_SPECS: TableSpec[] = [
  {
    name: 'projects',
    createSql: `CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      allowed_origins TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSql: [],
    copyColumns: ['id', 'name', 'slug', 'allowed_origins', 'is_active', 'created_at', 'updated_at'],
    primaryKey: ['id'],
    uniqueGroups: [['slug']],
  },
  {
    name: 'users',
    createSql: `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSql: [],
    copyColumns: ['id', 'email', 'password_hash', 'name', 'role', 'is_active', 'created_at', 'updated_at'],
    primaryKey: ['id'],
    uniqueGroups: [['email']],
  },
  {
    name: 'pivot_users_projects',
    createSql: `CREATE TABLE pivot_users_projects (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'reporter',
      PRIMARY KEY (user_id, project_id)
    )`,
    indexSql: [],
    copyColumns: ['user_id', 'project_id', 'role'],
    primaryKey: ['user_id', 'project_id'],
  },
  {
    name: 'scout_items',
    createSql: `CREATE TABLE scout_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      page_url TEXT,
      page_route TEXT,
      component_file TEXT,
      css_selector TEXT,
      element_text TEXT,
      element_html TEXT,
      viewport_width INTEGER,
      viewport_height INTEGER,
      screenshot_path TEXT,
      session_recording_path TEXT,
      priority TEXT DEFAULT 'medium',
      labels TEXT,
      metadata TEXT,
      reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolved_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      resolution_note TEXT,
      branch_name TEXT,
      mr_url TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSql: [
      'CREATE INDEX idx_items_project_status ON scout_items(project_id, status)',
      'CREATE INDEX idx_items_project_created ON scout_items(project_id, created_at)',
      'CREATE INDEX idx_items_assignee ON scout_items(assignee_id)',
    ],
    copyColumns: ['id', 'project_id', 'message', 'status', 'page_url', 'page_route', 'component_file', 'css_selector', 'element_text', 'element_html', 'viewport_width', 'viewport_height', 'screenshot_path', 'session_recording_path', 'priority', 'labels', 'metadata', 'reporter_id', 'assignee_id', 'resolved_by_id', 'resolution_note', 'branch_name', 'mr_url', 'attempt_count', 'resolved_at', 'created_at', 'updated_at'],
    primaryKey: ['id'],
  },
  {
    name: 'scout_item_notes',
    createSql: `CREATE TABLE scout_item_notes (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES scout_items(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'comment',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSql: [
      'CREATE INDEX idx_notes_item_created ON scout_item_notes(item_id, created_at)',
    ],
    copyColumns: ['id', 'item_id', 'user_id', 'content', 'type', 'created_at'],
    primaryKey: ['id'],
  },
  {
    name: 'scout_item_links',
    createSql: `CREATE TABLE scout_item_links (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL REFERENCES scout_items(id) ON DELETE CASCADE,
      target_item_id TEXT NOT NULL REFERENCES scout_items(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'related',
      created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSql: [
      'CREATE INDEX idx_item_links_source ON scout_item_links(source_item_id)',
      'CREATE INDEX idx_item_links_target ON scout_item_links(target_item_id)',
      'CREATE INDEX idx_item_links_source_target_type ON scout_item_links(source_item_id, target_item_id, type)',
    ],
    copyColumns: ['id', 'source_item_id', 'target_item_id', 'type', 'created_by_id', 'created_at'],
    primaryKey: ['id'],
  },
  {
    name: 'audit_log',
    createSql: `CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSql: [
      'CREATE INDEX idx_audit_log_created ON audit_log(created_at)',
      'CREATE INDEX idx_audit_log_user ON audit_log(user_id)',
    ],
    copyColumns: ['id', 'user_id', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'created_at'],
    primaryKey: ['id'],
  },
  {
    name: 'webhooks',
    createSql: `CREATE TABLE webhooks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      secret TEXT,
      events TEXT NOT NULL DEFAULT '["item.created","item.status_changed"]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSql: [
      'CREATE INDEX idx_webhooks_project ON webhooks(project_id)',
      'CREATE INDEX idx_webhooks_project_active ON webhooks(project_id, is_active)',
    ],
    copyColumns: ['id', 'project_id', 'url', 'secret', 'events', 'is_active', 'created_at', 'updated_at'],
    primaryKey: ['id'],
  },
  {
    name: 'api_keys',
    createSql: `CREATE TABLE api_keys (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      last_used_at TEXT,
      expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSql: [
      'CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix)',
      'CREATE INDEX idx_api_keys_project ON api_keys(project_id)',
    ],
    copyColumns: ['id', 'project_id', 'user_id', 'name', 'key_hash', 'key_prefix', 'last_used_at', 'expires_at', 'is_active', 'created_at'],
    primaryKey: ['id'],
  },
];

export const SQLITE_BASELINE_SQL = TABLE_SPECS.flatMap((spec) => [spec.createSql, ...spec.indexSql]);

export function hasCoreTables(sqlite: DatabaseType): boolean {
  return CORE_TABLES.some((tableName) => tableExists(sqlite, tableName));
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function tableExists(sqlite: DatabaseType, tableName: string): boolean {
  const row = sqlite.prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?').get('table', tableName);
  return !!row;
}

function getTableColumns(sqlite: DatabaseType, tableName: string): Array<{ name: string; pk: number }> {
  return sqlite.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string; pk: number }>;
}

function columnExists(sqlite: DatabaseType, tableName: string, columnName: string): boolean {
  return getTableColumns(sqlite, tableName).some((column) => column.name === columnName);
}

function hasExactPrimaryKey(sqlite: DatabaseType, tableName: string, expected: string[]): boolean {
  const columns = getTableColumns(sqlite, tableName)
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  return JSON.stringify(columns) === JSON.stringify(expected);
}

function hasUniqueIndex(sqlite: DatabaseType, tableName: string, expected: string[]): boolean {
  const indexes = sqlite.prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`).all() as Array<{ name: string; unique: number }>;
  return indexes.some((index) => {
    if (!index.unique) return false;
    const columns = sqlite.prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`).all() as Array<{ name: string }>;
    return JSON.stringify(columns.map((column) => column.name)) === JSON.stringify(expected);
  });
}

function getValidationIssues(sqlite: DatabaseType, spec: TableSpec): string[] {
  if (!tableExists(sqlite, spec.name)) return ['missing table'];

  const columns = new Set(getTableColumns(sqlite, spec.name).map((column) => column.name));
  const issues: string[] = [];

  for (const column of spec.copyColumns) {
    if (!columns.has(column)) issues.push(`missing column ${column}`);
  }

  if (!hasExactPrimaryKey(sqlite, spec.name, spec.primaryKey)) {
    issues.push(`primary key must be (${spec.primaryKey.join(', ')})`);
  }

  for (const uniqueGroup of spec.uniqueGroups ?? []) {
    if (!hasUniqueIndex(sqlite, spec.name, uniqueGroup)) {
      issues.push(`missing unique index on (${uniqueGroup.join(', ')})`);
    }
  }

  return issues;
}

function assertRepairable(sqlite: DatabaseType, spec: TableSpec): void {
  if (!tableExists(sqlite, spec.name)) return;

  for (const pkColumn of spec.primaryKey) {
    const nulls = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(spec.name)} WHERE ${quoteIdentifier(pkColumn)} IS NULL`).get() as { count: number };
    if (nulls.count > 0) {
      throw new Error(`Cannot repair ${spec.name}: column ${pkColumn} contains NULL values`);
    }
  }

  const uniquenessGroups = [spec.primaryKey, ...(spec.uniqueGroups ?? [])];
  for (const group of uniquenessGroups) {
    const quoted = group.map(quoteIdentifier).join(', ');
    const duplicate = sqlite.prepare(`SELECT ${quoted}, COUNT(*) AS count FROM ${quoteIdentifier(spec.name)} GROUP BY ${quoted} HAVING COUNT(*) > 1 LIMIT 1`).get();
    if (duplicate) {
      throw new Error(`Cannot repair ${spec.name}: duplicate values for (${group.join(', ')})`);
    }
  }
}

function createTable(sqlite: DatabaseType, spec: TableSpec): void {
  sqlite.exec(spec.createSql);
  for (const statement of spec.indexSql) sqlite.exec(statement);
}

function rebuildTable(sqlite: DatabaseType, spec: TableSpec): void {
  assertRepairable(sqlite, spec);

  const tempTable = `__repair_${spec.name}`;
  const tempCreateSql = spec.createSql.replace(`CREATE TABLE ${spec.name}`, `CREATE TABLE ${tempTable}`);
  const existingColumns = new Set(getTableColumns(sqlite, spec.name).map((column) => column.name));
  const sharedColumns = spec.copyColumns.filter((column) => existingColumns.has(column));
  const quotedColumns = sharedColumns.map(quoteIdentifier).join(', ');

  const previousForeignKeys = Number(sqlite.pragma('foreign_keys', { simple: true }));
  sqlite.pragma('foreign_keys = OFF');

  try {
    sqlite.transaction(() => {
      sqlite.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tempTable)}`);
      sqlite.exec(tempCreateSql);

      if (sharedColumns.length > 0) {
        sqlite.exec(`INSERT INTO ${quoteIdentifier(tempTable)} (${quotedColumns}) SELECT ${quotedColumns} FROM ${quoteIdentifier(spec.name)}`);
      }

      sqlite.exec(`DROP TABLE ${quoteIdentifier(spec.name)}`);
      sqlite.exec(`ALTER TABLE ${quoteIdentifier(tempTable)} RENAME TO ${quoteIdentifier(spec.name)}`);

      for (const statement of spec.indexSql) sqlite.exec(statement);
    })();
  } finally {
    sqlite.pragma(`foreign_keys = ${previousForeignKeys ? 'ON' : 'OFF'}`);
  }
}

function getMigrationEntries(migrationsFolder: string): Array<{ tag: string; when: number; hash: string }> {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) return [];

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>;
  };

  return journal.entries.map((entry) => {
    const sql = fs.readFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
    return {
      tag: entry.tag,
      when: entry.when,
      hash: crypto.createHash('sha256').update(sql).digest('hex'),
    };
  });
}

function migrationRecorded(sqlite: DatabaseType, hash: string): boolean {
  const row = sqlite.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations WHERE hash = ?').get(hash) as { count: number };
  return row.count > 0;
}

function adoptMigration(sqlite: DatabaseType, entry: { tag: string; when: number; hash: string }): void {
  if (migrationRecorded(sqlite, entry.hash)) return;
  sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(entry.hash, entry.when);
  logger.info({ tag: entry.tag, appliedAt: entry.when }, 'Adopted existing SQLite schema change into drizzle migrations');
}

function ensureBaselineAdopted(sqlite: DatabaseType, migrationsFolder: string): void {
  const migrationEntries = getMigrationEntries(migrationsFolder);
  if (migrationEntries.length === 0) return;

  const existingTables = CORE_TABLES.filter((tableName) => tableExists(sqlite, tableName));
  if (existingTables.length === 0) return;

  sqlite.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`);

  const baseline = migrationEntries[0]!;
  const appliedCount = (sqlite.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations').get() as { count: number }).count;
  if (appliedCount === 0) {
    adoptMigration(sqlite, baseline);
  }

  for (const entry of migrationEntries) {
    if (entry.tag === '0001_green_maggott' && tableExists(sqlite, 'scout_item_links')) {
      adoptMigration(sqlite, entry);
    }
    if (entry.tag === '0002_graceful_whiplash' && columnExists(sqlite, 'pivot_users_projects', 'role')) {
      adoptMigration(sqlite, entry);
    }
  }
}

function ensureForeignKeysHealthy(sqlite: DatabaseType): void {
  const violations = sqlite.prepare('PRAGMA foreign_key_check').all();
  if (violations.length > 0) {
    throw new Error(`SQLite foreign key check failed: ${JSON.stringify(violations[0])}`);
  }
}

export function ensureSqliteSchema(
  sqlite: DatabaseType,
  options: { migrationsFolder?: string; adoptBaseline?: boolean; adoptBaselineOnly?: boolean } = {},
): void {
  if (options.adoptBaselineOnly) {
    if (options.adoptBaseline && options.migrationsFolder) {
      ensureBaselineAdopted(sqlite, options.migrationsFolder);
    }
    return;
  }

  for (const spec of TABLE_SPECS) {
    const issues = getValidationIssues(sqlite, spec);
    if (issues.length === 0) continue;

    if (!tableExists(sqlite, spec.name)) {
      createTable(sqlite, spec);
      logger.info({ table: spec.name }, 'Created missing SQLite table');
      continue;
    }

    rebuildTable(sqlite, spec);
    logger.warn({ table: spec.name, issues }, 'Rebuilt SQLite table to repair schema drift');
  }

  if (options.adoptBaseline && options.migrationsFolder) {
    ensureBaselineAdopted(sqlite, options.migrationsFolder);
  }
  ensureForeignKeysHealthy(sqlite);
}

export function createSqliteBaseline(sqlite: DatabaseType): void {
  for (const statement of SQLITE_BASELINE_SQL) sqlite.exec(statement);
}
