import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../db/client.js';
import { apiKeys, projects, users } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireProjectPermission } from '../middleware/permissions.js';
import { randomUUID, randomBytes } from 'node:crypto';
import { NotFoundError } from '../lib/errors.js';
import { createApiKeySchema, listApiKeysSchema, revokeApiKeySchema } from '../lib/schemas.js';
import { logAudit, getClientIp } from '../services/audit.js';

const DEFAULT_SCOPES_BY_PURPOSE = {
  opencode: ['items:read', 'items:comment', 'items:workflow', 'items:triage', 'storage:read'],
  ci: ['items:read', 'items:comment'],
  integration: ['items:read', 'items:create'],
  custom: ['items:read'],
} as const;

function parseScopes(scopes: string): string[] {
  try {
    const parsed = JSON.parse(scopes) as unknown;
    return Array.isArray(parsed) ? parsed.filter((scope): scope is string => typeof scope === 'string') : [];
  } catch {
    return [];
  }
}

export const apiKeyRoutes = new Hono()
  .use('/*', authMiddleware)

  // CREATE — generates key, returns ONCE
  .post('/create',
    zValidator('json', createApiKeySchema),
    async (c) => {
      const { projectId, name, purpose, scopes, expiresAt } = c.req.valid('json');

      // Verify project exists
      const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
      if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND');

      const user = c.get('user');
      requireProjectPermission(user.id, user.role, projectId, 'manage_integrations', c.get('apiKey'));
      const id = randomUUID();

      // Generate key: sk_live_ + 32 random hex chars
      const rawKey = `sk_live_${randomBytes(16).toString('hex')}`;
      const keyPrefix = rawKey.slice(0, 16);
      const keyHash = await bcrypt.hash(rawKey, 10);

      db.insert(apiKeys).values({
        id,
        projectId,
        userId: user.id,
        name,
        purpose,
        scopes: JSON.stringify(scopes ?? DEFAULT_SCOPES_BY_PURPOSE[purpose]),
        keyHash,
        keyPrefix,
        expiresAt: expiresAt ?? null,
      }).run();

      logAudit({
        userId: user.id,
        action: 'create_api_key',
        entityType: 'api_key',
        entityId: id,
        details: { projectId, name, purpose },
        ipAddress: getClientIp(c),
      });

      return c.json({
        data: {
          key: rawKey, // Only time the full key is visible
          id,
          name,
          purpose,
          scopes: scopes ?? DEFAULT_SCOPES_BY_PURPOSE[purpose],
          keyPrefix,
          projectId,
          expiresAt: expiresAt ?? null,
        },
      }, 201);
    })

  // LIST — shows prefix, name, lastUsed (NOT full key)
  .post('/list',
    zValidator('json', listApiKeysSchema),
    async (c) => {
      const { projectId } = c.req.valid('json');
      const user = c.get('user');
      requireProjectPermission(user.id, user.role, projectId, 'manage_integrations', c.get('apiKey'));

      const keys = db.select({
        id: apiKeys.id,
        projectId: apiKeys.projectId,
        userId: apiKeys.userId,
        userName: users.name,
        name: apiKeys.name,
        purpose: apiKeys.purpose,
        scopes: apiKeys.scopes,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        revokedAt: apiKeys.revokedAt,
        isActive: apiKeys.isActive,
        createdAt: apiKeys.createdAt,
      }).from(apiKeys)
        .leftJoin(users, eq(apiKeys.userId, users.id))
        .where(eq(apiKeys.projectId, projectId))
        .all();

      return c.json({ data: { items: keys.map((key) => ({
        ...key,
        scopes: parseScopes(key.scopes),
      })) } });
    })

  // REVOKE — deactivate a key
  .post('/revoke',
    zValidator('json', revokeApiKeySchema),
    async (c) => {
      const { id } = c.req.valid('json');

      const existing = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
      if (!existing) throw new NotFoundError('API Key', 'API_KEY_NOT_FOUND');
      const user = c.get('user');
      requireProjectPermission(user.id, user.role, existing.projectId, 'manage_integrations', c.get('apiKey'));

      db.update(apiKeys)
        .set({ isActive: false, revokedAt: new Date().toISOString() })
        .where(eq(apiKeys.id, id))
        .run();

      logAudit({
        userId: user.id,
        action: 'revoke_api_key',
        entityType: 'api_key',
        entityId: id,
        details: { name: existing.name },
        ipAddress: getClientIp(c),
      });

      return c.json({ data: { success: true } });
    });
