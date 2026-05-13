import { db } from './client.js';
import { projects, users, pivotUsersProjects } from './schema.js';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

function seed() {
  logger.info('Seeding Scout database');

  // Demo project
  const existingProject = db.select().from(projects).where(eq(projects.slug, 'my-app')).get();
  if (!existingProject) {
    db.insert(projects).values({
      id: randomUUID(),
      name: 'My App',
      slug: 'my-app',
      allowedOrigins: JSON.stringify(['http://localhost:3000']),
    }).run();
    logger.info('Created project: My App');
  } else {
    logger.info('Project My App already exists, skipping');
  }

  // Admin
  const existingAdmin = db.select().from(users).where(eq(users.email, 'admin@scout.local')).get();
  if (!existingAdmin) {
    db.insert(users).values({
      id: randomUUID(),
      email: 'admin@scout.local',
      passwordHash: bcrypt.hashSync('admin', 10),
      name: 'Scout Admin',
      role: 'admin',
    }).run();
    logger.info('Created user: admin@scout.local');
  } else {
    logger.info('Admin already exists, skipping');
  }

  // Agent
  const existingAgent = db.select().from(users).where(eq(users.email, 'agent@scout.local')).get();
  if (!existingAgent) {
    db.insert(users).values({
      id: randomUUID(),
      email: 'agent@scout.local',
      passwordHash: bcrypt.hashSync('agent', 10),
      name: 'AI Agent',
      role: 'agent',
    }).run();
    logger.info('Created user: agent@scout.local');
  } else {
    logger.info('Agent already exists, skipping');
  }

  // Member (tester)
  const existingMember = db.select().from(users).where(eq(users.email, 'member@scout.local')).get();
  if (!existingMember) {
    db.insert(users).values({
      id: randomUUID(),
      email: 'member@scout.local',
      passwordHash: bcrypt.hashSync('member', 10),
      name: 'Tester',
      role: 'member',
    }).run();
    logger.info('Created user: member@scout.local');
  } else {
    logger.info('Member already exists, skipping');
  }

  // Pivots: agent + member → project
  const agent = db.select().from(users).where(eq(users.email, 'agent@scout.local')).get();
  const member = db.select().from(users).where(eq(users.email, 'member@scout.local')).get();
  const project = db.select().from(projects).where(eq(projects.slug, 'my-app')).get();

  if (agent && project) {
    const existing = db.select().from(pivotUsersProjects)
      .where(eq(pivotUsersProjects.userId, agent.id)).get();
    if (!existing) {
      db.insert(pivotUsersProjects).values({
        userId: agent.id,
        projectId: project.id,
      }).run();
      logger.info('Linked AI Agent to My App');
    }
  }

  if (member && project) {
    const existing = db.select().from(pivotUsersProjects)
      .where(eq(pivotUsersProjects.userId, member.id)).get();
    if (!existing) {
      db.insert(pivotUsersProjects).values({
        userId: member.id,
        projectId: project.id,
      }).run();
      logger.info('Linked Tester to My App');
    }
  }

  logger.info('Seed complete');
}

seed();
