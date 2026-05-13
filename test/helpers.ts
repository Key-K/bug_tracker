import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../server/db/schema.js';
import { createSqliteBaseline } from '../server/db/sqlite-schema.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.SCOUT_JWT_SECRET || 'dev-secret-change-in-production';

export interface TestContext {
  db: ReturnType<typeof drizzle<typeof schema>>;
  adminId: string;
  agentId: string;
  memberId: string;
  projectId: string;
  adminToken: string;
  agentToken: string;
  memberToken: string;
}

/**
 * Creates in-memory SQLite DB with schema and seed data.
 * Call in beforeEach() for test isolation.
 */
export function createTestContext(): TestContext {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  createSqliteBaseline(sqlite);

  const db = drizzle(sqlite, { schema });

  // Seed data
  const projectId = randomUUID();
  const adminId = randomUUID();
  const agentId = randomUUID();
  const memberId = randomUUID();
  const passwordHash = bcrypt.hashSync('password', 10);

  db.insert(schema.projects).values({
    id: projectId, name: 'Test Project', slug: 'test-project',
    allowedOrigins: '["http://localhost:3000"]',
  }).run();

  db.insert(schema.users).values([
    { id: adminId, email: 'admin@test.local', passwordHash, name: 'Test Admin', role: 'admin' },
    { id: agentId, email: 'agent@test.local', passwordHash, name: 'Test Agent', role: 'agent' },
    { id: memberId, email: 'member@test.local', passwordHash, name: 'Test Member', role: 'member' },
  ]).run();

  db.insert(schema.pivotUsersProjects).values([
    { userId: agentId, projectId, role: 'developer' },
    { userId: memberId, projectId, role: 'reporter' },
  ]).run();

  // Generate tokens
  const adminToken = jwt.sign({ userId: adminId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  const agentToken = jwt.sign({ userId: agentId, role: 'agent' }, JWT_SECRET, { expiresIn: '1h' });
  const memberToken = jwt.sign({ userId: memberId, role: 'member' }, JWT_SECRET, { expiresIn: '1h' });

  return { db, adminId, agentId, memberId, projectId, adminToken, agentToken, memberToken };
}
