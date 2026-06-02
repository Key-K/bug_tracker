import { createMiddleware } from 'hono/factory';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../db/client.js';
import { users, apiKeys, type ApiKey, type User } from '../db/schema.js';
import { verifyToken } from '../services/auth.js';
import { UnauthorizedError } from '../lib/errors.js';

// Extend Hono context with user
declare module 'hono' {
  interface ContextVariableMap {
    user: User;
    apiKey: ApiKey | null;
  }
}

export type ApiKeyScope =
  | 'items:read'
  | 'items:create'
  | 'items:comment'
  | 'items:workflow'
  | 'items:triage'
  | 'storage:read'
  | 'errors:read'
  | 'errors:write'
  | 'errors:triage';

export function getApiKeyScopes(apiKey: Pick<ApiKey, 'scopes'> | null | undefined): ApiKeyScope[] {
  if (!apiKey) return [];
  try {
    const parsed = JSON.parse(apiKey.scopes) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((scope): scope is ApiKeyScope =>
      scope === 'items:read' ||
      scope === 'items:create' ||
      scope === 'items:comment' ||
      scope === 'items:workflow' ||
      scope === 'items:triage' ||
      scope === 'storage:read' ||
      scope === 'errors:read' ||
      scope === 'errors:write' ||
      scope === 'errors:triage',
    );
  } catch {
    return [];
  }
}

async function authenticateApiKey(token: string): Promise<{ apiKey: ApiKey; user: User }> {
  const prefix = token.slice(0, 16);
  const apiKey = db.select().from(apiKeys)
    .where(and(
      eq(apiKeys.keyPrefix, prefix),
      eq(apiKeys.isActive, true),
    )).get();

  if (!apiKey) {
    throw new UnauthorizedError('Неверный API-ключ', 'API_KEY_INVALID');
  }

  const valid = await bcrypt.compare(token, apiKey.keyHash);
  if (!valid) {
    throw new UnauthorizedError('Неверный API-ключ', 'API_KEY_INVALID');
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    throw new UnauthorizedError('API-ключ истёк', 'API_KEY_EXPIRED');
  }

  const user = db.select().from(users).where(eq(users.id, apiKey.userId)).get();
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Пользователь деактивирован', 'USER_INACTIVE');
  }

  db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, apiKey.id)).run();
  return { apiKey, user };
}

/**
 * Extract Bearer token from Authorization header or ?token= query param.
 * Header takes priority. Returns null if neither is present.
 */
function extractToken(c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }): string | null {
  const header = c.req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return c.req.query('token') ?? null;
}

/**
 * Storage auth — accepts both Authorization header and ?token= query param.
 * Needed because <img src> and plain fetch() can't send Authorization headers.
 */
export const storageAuth = createMiddleware(async (c, next) => {
  const token = extractToken(c);
  if (!token) throw new UnauthorizedError('Missing authentication', 'UNAUTHORIZED');

  if (token.startsWith('sk_live_')) {
    const { apiKey, user } = await authenticateApiKey(token);
    if (!getApiKeyScopes(apiKey).includes('storage:read')) {
      throw new UnauthorizedError('API key cannot access storage', 'API_KEY_INVALID');
    }
    c.set('user', user);
    c.set('apiKey', apiKey);
    await next();
    return;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired token', 'TOKEN_EXPIRED');
  }

  const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
  if (!user || !user.isActive) throw new UnauthorizedError('User not found or inactive', 'USER_INACTIVE');

  c.set('user', user);
  c.set('apiKey', null);
  await next();
});

export const authMiddleware = createMiddleware(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header', 'UNAUTHORIZED');
  }

  const token = header.slice(7);

  // Check for API key auth: Bearer sk_live_...
  if (token.startsWith('sk_live_')) {
    const { apiKey, user } = await authenticateApiKey(token);

    c.set('user', user);
    c.set('apiKey', apiKey);
    await next();
    return;
  }

  // JWT auth
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired token', 'TOKEN_EXPIRED');
  }

  const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
  if (!user || !user.isActive) {
    throw new UnauthorizedError('User not found or inactive', 'USER_INACTIVE');
  }

  c.set('user', user);
  c.set('apiKey', null);
  await next();
});
