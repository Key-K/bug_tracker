import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../db/client.js';
import { users, apiKeys } from '../db/schema.js';
import { loginSchema, validateTokenSchema } from '../lib/schemas.js';
import { signToken, comparePassword, verifyToken } from '../services/auth.js';
import { authMiddleware } from '../middleware/auth.js';
import { UnauthorizedError } from '../lib/errors.js';
import { logAudit, getClientIp } from '../services/audit.js';

export const authRoutes = new Hono()

  .post('/login', zValidator('json', loginSchema), async (c) => {
    const { email, password } = c.req.valid('json');
    const ip = getClientIp(c);

    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !user.isActive) {
      logAudit({ userId: null, action: 'login_failure', entityType: 'auth', details: { email }, ipAddress: ip });
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      logAudit({ userId: user.id, action: 'login_failure', entityType: 'auth', details: { email }, ipAddress: ip });
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    logAudit({ userId: user.id, action: 'login', entityType: 'auth', details: { email }, ipAddress: ip });
    const token = signToken(user);
    const { passwordHash: _, ...userWithoutPassword } = user;
    return c.json({ data: { token, user: userWithoutPassword } });
  })

  .post('/me', authMiddleware, async (c) => {
    const user = c.get('user');
    const { passwordHash: _, ...userWithoutPassword } = user;
    return c.json({ data: { user: userWithoutPassword } });
  })

  .post('/refresh', authMiddleware, async (c) => {
    const user = c.get('user');
    const token = signToken(user);
    const { passwordHash: _, ...userWithoutPassword } = user;
    return c.json({ data: { token, user: userWithoutPassword } });
  })

  // SSO Validation — external services call this to validate a token/API key
  // No auth required on this endpoint itself (it IS the auth check)
  .post('/validate', zValidator('json', validateTokenSchema), async (c) => {
    const { token } = c.req.valid('json');

    // API key validation
    if (token.startsWith('sk_live_')) {
      const prefix = token.slice(0, 16);
      const apiKey = db.select().from(apiKeys)
        .where(and(
          eq(apiKeys.keyPrefix, prefix),
          eq(apiKeys.isActive, true),
        )).get();

      if (!apiKey) {
        return c.json({ valid: false });
      }

      const valid = await bcrypt.compare(token, apiKey.keyHash);
      if (!valid) {
        return c.json({ valid: false });
      }

      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        return c.json({ valid: false });
      }

      const user = db.select().from(users).where(eq(users.id, apiKey.userId)).get();
      if (!user || !user.isActive) {
        return c.json({ valid: false });
      }

      const { passwordHash: _, ...userWithoutPassword } = user;
      return c.json({ valid: true, user: userWithoutPassword });
    }

    // JWT validation
    try {
      const payload = verifyToken(token);
      const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
      if (!user || !user.isActive) {
        return c.json({ valid: false });
      }

      const { passwordHash: _, ...userWithoutPassword } = user;
      return c.json({ valid: true, user: userWithoutPassword });
    } catch {
      return c.json({ valid: false });
    }
  });
