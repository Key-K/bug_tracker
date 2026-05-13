import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { webhooks, projects } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireProjectPermission } from '../middleware/permissions.js';
import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../lib/errors.js';
import {
  createWebhookSchema, updateWebhookSchema,
  deleteWebhookSchema, listWebhooksSchema, testWebhookSchema,
} from '../lib/schemas.js';
import { sendTestWebhook } from '../services/webhooks.js';
import { logAudit, getClientIp } from '../services/audit.js';

export const webhookRoutes = new Hono()
  .use('/*', authMiddleware)

  // CREATE
  .post('/create',
    zValidator('json', createWebhookSchema),
    async (c) => {
      const { projectId, url, secret, events } = c.req.valid('json');
      const user = c.get('user');

      // Verify project exists
      const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
      if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND');
      requireProjectPermission(user.id, user.role, projectId, 'manage_integrations', c.get('apiKey'));

      const id = randomUUID();
      db.insert(webhooks).values({
        id,
        projectId,
        url,
        secret: secret ?? null,
        events: JSON.stringify(events),
      }).run();

      const webhook = db.select().from(webhooks).where(eq(webhooks.id, id)).get()!;
      logAudit({ userId: user.id, action: 'create_webhook', entityType: 'webhook', entityId: id, details: { projectId, url }, ipAddress: getClientIp(c) });
      return c.json({ data: webhook }, 201);
    })

  // LIST
  .post('/list',
    zValidator('json', listWebhooksSchema),
    async (c) => {
      const { projectId } = c.req.valid('json');
      const user = c.get('user');
      requireProjectPermission(user.id, user.role, projectId, 'manage_integrations', c.get('apiKey'));

      const items = db.select().from(webhooks)
        .where(eq(webhooks.projectId, projectId))
        .all();

      return c.json({ data: { items } });
    })

  // UPDATE
  .post('/update',
    zValidator('json', updateWebhookSchema),
    async (c) => {
      const { id, url, secret, events, isActive } = c.req.valid('json');
      const user = c.get('user');

      const existing = db.select().from(webhooks).where(eq(webhooks.id, id)).get();
      if (!existing) throw new NotFoundError('Webhook', 'WEBHOOK_NOT_FOUND');
      requireProjectPermission(user.id, user.role, existing.projectId, 'manage_integrations', c.get('apiKey'));

      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (url !== undefined) updateData.url = url;
      if (secret !== undefined) updateData.secret = secret;
      if (events !== undefined) updateData.events = JSON.stringify(events);
      if (isActive !== undefined) updateData.isActive = isActive;

      db.update(webhooks).set(updateData).where(eq(webhooks.id, id)).run();
      const webhook = db.select().from(webhooks).where(eq(webhooks.id, id)).get()!;
      logAudit({ userId: user.id, action: 'update_webhook', entityType: 'webhook', entityId: id, details: { url, isActive }, ipAddress: getClientIp(c) });
      return c.json({ data: webhook });
    })

  // DELETE
  .post('/delete',
    zValidator('json', deleteWebhookSchema),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('user');

      const existing = db.select().from(webhooks).where(eq(webhooks.id, id)).get();
      if (!existing) throw new NotFoundError('Webhook', 'WEBHOOK_NOT_FOUND');
      requireProjectPermission(user.id, user.role, existing.projectId, 'manage_integrations', c.get('apiKey'));

      db.delete(webhooks).where(eq(webhooks.id, id)).run();
      logAudit({ userId: user.id, action: 'delete_webhook', entityType: 'webhook', entityId: id, ipAddress: getClientIp(c) });
      return c.json({ data: { ok: true } });
    })

  // TEST — send a test payload to the webhook URL
  .post('/test',
    zValidator('json', testWebhookSchema),
    async (c) => {
      const { id } = c.req.valid('json');

      const hook = db.select().from(webhooks).where(eq(webhooks.id, id)).get();
      if (!hook) throw new NotFoundError('Webhook', 'WEBHOOK_NOT_FOUND');
      const user = c.get('user');
      requireProjectPermission(user.id, user.role, hook.projectId, 'manage_integrations', c.get('apiKey'));

      const result = await sendTestWebhook(hook.url, hook.secret, hook.projectId);
      return c.json({ data: result });
    });
