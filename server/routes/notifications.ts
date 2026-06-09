import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth.js';
import { ForbiddenError } from '../lib/errors.js';
import { runDailyDigestSchema } from '../lib/schemas.js';
import { sendDailyDigests } from '../services/email-digest.js';

export const notificationRoutes = new Hono()
  .use('/*', authMiddleware)
  .post('/daily-digest/run',
    zValidator('json', runDailyDigestSchema),
    async (c) => {
      const user = c.get('user');
      if (user.role !== 'admin') throw new ForbiddenError('Только system admin', 'ADMIN_REQUIRED');
      const body = c.req.valid('json');
      const result = await sendDailyDigests(body);
      return c.json({ data: result });
    });
