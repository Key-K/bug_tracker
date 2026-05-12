import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, desc, count, like, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { scoutItems, scoutItemNotes, scoutItemLinks, projects, users, type ScoutItemLink } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, checkProjectAccess } from '../middleware/permissions.js';
import { randomUUID } from 'node:crypto';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import {
  createItemSchema, listItemsSchema, getItemSchema,
  countItemsSchema, claimItemSchema, resolveItemSchema,
  cancelItemSchema, updateItemStatusSchema, addNoteSchema,
  deleteItemSchema, updateItemSchema, reopenItemSchema,
  linkItemSchema, unlinkItemSchema,
} from '../lib/schemas.js';
import { createItem, claimItem, updateItemStatus, deleteItem, updateItem, reopenItem } from '../services/items.js';
import { logAudit, getClientIp } from '../services/audit.js';
import { dispatchWebhooks } from '../services/webhooks.js';
import { eventBus } from '../lib/event-bus.js';

/** Resolve user name by id, with simple cache */
const userNameCache = new Map<string, string>();
function getUserName(userId: string | null): string | null {
  if (!userId) return null;
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;
  const user = db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get();
  const name = user?.name ?? null;
  if (name) userNameCache.set(userId, name);
  return name;
}

function enrichItem(item: typeof scoutItems.$inferSelect) {
  return {
    ...item,
    reporterName: getUserName(item.reporterId),
    assigneeName: getUserName(item.assigneeId),
  };
}

function getRelatedItems(itemId: string) {
  const links = db.select().from(scoutItemLinks)
    .where(or(eq(scoutItemLinks.sourceItemId, itemId), eq(scoutItemLinks.targetItemId, itemId)))
    .orderBy(desc(scoutItemLinks.createdAt))
    .all();

  return links.map((link) => {
    const relatedId = link.sourceItemId === itemId ? link.targetItemId : link.sourceItemId;
    const related = db.select().from(scoutItems).where(eq(scoutItems.id, relatedId)).get();
    if (!related) return null;
    return {
      id: link.id,
      type: link.type,
      direction: link.sourceItemId === itemId ? 'outgoing' : 'incoming',
      createdAt: link.createdAt,
      item: enrichItem(related),
    };
  }).filter((link): link is NonNullable<typeof link> => link !== null);
}

function normalizeLinkPair(sourceItemId: string, targetItemId: string, type: ScoutItemLink['type']) {
  if (type === 'blocks' || type === 'blocked_by' || type === 'caused_by') {
    return { sourceItemId, targetItemId, type };
  }
  return sourceItemId < targetItemId
    ? { sourceItemId, targetItemId, type }
    : { sourceItemId: targetItemId, targetItemId: sourceItemId, type };
}

export const itemRoutes = new Hono()
  .use('/*', authMiddleware)

  // CREATE — member, admin
  .post('/create',
    requireRole('member', 'admin'),
    zValidator('json', createItemSchema),
    async (c) => {
      const data = c.req.valid('json');
      const user = c.get('user');

      // Verify project exists
      const project = db.select().from(projects).where(eq(projects.id, data.projectId)).get();
      if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND');

      // Check project access
      if (!checkProjectAccess(user.id, user.role, data.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const item = createItem({ ...data, reporterId: user.id });
      logAudit({ userId: user.id, action: 'create_item', entityType: 'item', entityId: item.id, details: { projectId: data.projectId, priority: data.priority }, ipAddress: getClientIp(c) });
      dispatchWebhooks(data.projectId, 'item.created', { item }).catch(() => {});
      eventBus.publish({ type: 'item.created', projectId: data.projectId, payload: { item } });
      return c.json({ data: item }, 201);
    })

  // LIST — all roles
  .post('/list',
    zValidator('json', listItemsSchema),
    async (c) => {
      const { projectId, status, priority, assigneeId, search, page, perPage } = c.req.valid('json');
      const user = c.get('user');

      // Check project access
      if (!checkProjectAccess(user.id, user.role, projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const conditions = [eq(scoutItems.projectId, projectId)];
      if (status) conditions.push(eq(scoutItems.status, status));
      if (priority) conditions.push(eq(scoutItems.priority, priority));
      if (assigneeId) conditions.push(eq(scoutItems.assigneeId, assigneeId));
      if (search) conditions.push(like(scoutItems.message, `%${search}%`));

      const where = conditions.length === 1 ? conditions[0]! : and(...conditions);

      const items = db.select().from(scoutItems)
        .where(where)
        .orderBy(desc(scoutItems.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage)
        .all();

      const [{ total }] = db.select({ total: count() }).from(scoutItems).where(where).all();

      return c.json({
        data: {
          items: items.map(enrichItem),
          pagination: {
            page,
            perPage,
            total,
            totalPages: Math.ceil(total / perPage),
          },
        },
      });
    })

  // GET — all roles (item + notes)
  .post('/get',
    zValidator('json', getItemSchema),
    async (c) => {
      const { id } = c.req.valid('json');
      const item = db.select().from(scoutItems).where(eq(scoutItems.id, id)).get();
      if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');

      const user = c.get('user');
      if (!checkProjectAccess(user.id, user.role, item.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const notes = db.select().from(scoutItemNotes)
        .where(eq(scoutItemNotes.itemId, id))
        .orderBy(scoutItemNotes.createdAt)
        .all();

      const enrichedNotes = notes.map((n) => ({
        ...n,
        userName: getUserName(n.userId),
      }));

      return c.json({ data: { ...enrichItem(item), notes: enrichedNotes, relatedItems: getRelatedItems(id) } });
    })

  // COUNT — all roles
  .post('/count',
    zValidator('json', countItemsSchema),
    async (c) => {
      const { projectId } = c.req.valid('json');
      const user = c.get('user');

      // Check project access
      if (!checkProjectAccess(user.id, user.role, projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }
      const statuses = ['new', 'in_progress', 'review', 'done', 'cancelled'] as const;
      const counts: Record<string, number> = {};

      for (const status of statuses) {
        const [{ total }] = db.select({ total: count() }).from(scoutItems)
          .where(and(eq(scoutItems.projectId, projectId), eq(scoutItems.status, status)))
          .all();
        counts[status] = total;
      }

      return c.json({ data: { counts } });
    })

  // CLAIM — agent, admin
  .post('/claim',
    requireRole('agent', 'admin'),
    zValidator('json', claimItemSchema),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('user');

      // Check project access via item's projectId
      const existing = db.select({ projectId: scoutItems.projectId }).from(scoutItems).where(eq(scoutItems.id, id)).get();
      if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (!checkProjectAccess(user.id, user.role, existing.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const item = claimItem(id, user);
      logAudit({ userId: user.id, action: 'claim_item', entityType: 'item', entityId: id, ipAddress: getClientIp(c) });
      dispatchWebhooks(existing.projectId, 'item.assigned', { item, assignee: { id: user.id, name: user.name, email: user.email } }).catch(() => {});
      eventBus.publish({ type: 'item.assigned', projectId: existing.projectId, payload: { item } });
      return c.json({ data: item });
    })

  // RESOLVE — agent, admin
  .post('/resolve',
    requireRole('agent', 'admin'),
    zValidator('json', resolveItemSchema),
    async (c) => {
      const { id, resolutionNote, branchName, mrUrl } = c.req.valid('json');
      const user = c.get('user');

      // Check project access via item's projectId
      const existing = db.select({ projectId: scoutItems.projectId }).from(scoutItems).where(eq(scoutItems.id, id)).get();
      if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (!checkProjectAccess(user.id, user.role, existing.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const oldStatus = db.select({ status: scoutItems.status }).from(scoutItems).where(eq(scoutItems.id, id)).get()?.status ?? 'new';
      const item = updateItemStatus(id, 'done', user, {
        resolutionNote, branchName, mrUrl,
      });
      logAudit({ userId: user.id, action: 'resolve_item', entityType: 'item', entityId: id, details: { branchName, mrUrl }, ipAddress: getClientIp(c) });
      dispatchWebhooks(existing.projectId, 'item.status_changed', { item, oldStatus, newStatus: 'done' }).catch(() => {});
      eventBus.publish({ type: 'item.status_changed', projectId: existing.projectId, payload: { item, oldStatus, newStatus: 'done' } });
      return c.json({ data: item });
    })

  // CANCEL — admin only
  .post('/cancel',
    requireRole('admin'),
    zValidator('json', cancelItemSchema),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('user');

      // Check project access via item's projectId
      const existing = db.select({ projectId: scoutItems.projectId }).from(scoutItems).where(eq(scoutItems.id, id)).get();
      if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (!checkProjectAccess(user.id, user.role, existing.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const oldStatus = db.select({ status: scoutItems.status }).from(scoutItems).where(eq(scoutItems.id, id)).get()?.status ?? 'new';
      const item = updateItemStatus(id, 'cancelled', user);
      logAudit({ userId: user.id, action: 'cancel_item', entityType: 'item', entityId: id, ipAddress: getClientIp(c) });
      dispatchWebhooks(existing.projectId, 'item.status_changed', { item, oldStatus, newStatus: 'cancelled' }).catch(() => {});
      eventBus.publish({ type: 'item.status_changed', projectId: existing.projectId, payload: { item, oldStatus, newStatus: 'cancelled' } });
      return c.json({ data: item });
    })

  // UPDATE STATUS — agent, admin (generic)
  .post('/update-status',
    requireRole('agent', 'admin'),
    zValidator('json', updateItemStatusSchema),
    async (c) => {
      const { id, status, branchName, mrUrl, attemptCount } = c.req.valid('json');
      const user = c.get('user');

      // Check project access via item's projectId
      const existing = db.select({ projectId: scoutItems.projectId }).from(scoutItems).where(eq(scoutItems.id, id)).get();
      if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (!checkProjectAccess(user.id, user.role, existing.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const oldStatus = db.select({ status: scoutItems.status }).from(scoutItems).where(eq(scoutItems.id, id)).get()?.status ?? 'new';
      const item = updateItemStatus(id, status, user, {
        branchName, mrUrl, attemptCount,
      });
      logAudit({ userId: user.id, action: 'update_status', entityType: 'item', entityId: id, details: { status }, ipAddress: getClientIp(c) });
      dispatchWebhooks(existing.projectId, 'item.status_changed', { item, oldStatus, newStatus: status }).catch(() => {});
      eventBus.publish({ type: 'item.status_changed', projectId: existing.projectId, payload: { item, oldStatus, newStatus: status } });
      return c.json({ data: item });
    })

  // DELETE — admin only
  .post('/delete',
    requireRole('admin'),
    zValidator('json', deleteItemSchema),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('user');

      // Check project access via item's projectId
      const existing = db.select({ projectId: scoutItems.projectId }).from(scoutItems).where(eq(scoutItems.id, id)).get();
      if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (!checkProjectAccess(user.id, user.role, existing.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      deleteItem(id);
      logAudit({ userId: user.id, action: 'delete_item', entityType: 'item', entityId: id, ipAddress: getClientIp(c) });
      dispatchWebhooks(existing.projectId, 'item.deleted', { itemId: id }).catch(() => {});
      eventBus.publish({ type: 'item.deleted', projectId: existing.projectId, payload: { itemId: id } });
      return c.json({ data: { ok: true } });
    })

  // UPDATE — admin only
  .post('/update',
    requireRole('admin'),
    zValidator('json', updateItemSchema),
    async (c) => {
      const data = c.req.valid('json');
      const user = c.get('user');

      // Check project access via item's projectId
      const existing = db.select({ projectId: scoutItems.projectId }).from(scoutItems).where(eq(scoutItems.id, data.id)).get();
      if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (!checkProjectAccess(user.id, user.role, existing.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const item = updateItem(data.id, {
        message: data.message,
        assigneeId: data.assigneeId,
        priority: data.priority,
        labels: data.labels,
      });
      logAudit({ userId: user.id, action: 'update_item', entityType: 'item', entityId: data.id, details: { message: data.message, priority: data.priority, labels: data.labels }, ipAddress: getClientIp(c) });
      eventBus.publish({ type: 'item.updated', projectId: existing.projectId, payload: { item } });
      return c.json({ data: enrichItem(item) });
    })

  // REOPEN — admin only
  .post('/reopen',
    requireRole('admin'),
    zValidator('json', reopenItemSchema),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('user');

      // Check project access via item's projectId
      const existing = db.select({ projectId: scoutItems.projectId }).from(scoutItems).where(eq(scoutItems.id, id)).get();
      if (!existing) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (!checkProjectAccess(user.id, user.role, existing.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const oldStatus = db.select({ status: scoutItems.status }).from(scoutItems).where(eq(scoutItems.id, id)).get()?.status ?? 'done';
      const item = reopenItem(id, user);
      logAudit({ userId: user.id, action: 'reopen_item', entityType: 'item', entityId: id, ipAddress: getClientIp(c) });
      dispatchWebhooks(existing.projectId, 'item.status_changed', { item, oldStatus, newStatus: 'new' }).catch(() => {});
      eventBus.publish({ type: 'item.status_changed', projectId: existing.projectId, payload: { item, oldStatus, newStatus: 'new' } });
      return c.json({ data: enrichItem(item) });
    })

  // ADD NOTE — all roles
  .post('/add-note',
    zValidator('json', addNoteSchema),
    async (c) => {
      const { itemId, content } = c.req.valid('json');
      const user = c.get('user');

      // Verify item exists
      const item = db.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get();
      if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');

      // Check project access via item's projectId
      if (!checkProjectAccess(user.id, user.role, item.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const id = randomUUID();
      db.insert(scoutItemNotes).values({
        id, itemId, userId: user.id, content, type: 'comment',
      }).run();

      const note = db.select().from(scoutItemNotes).where(eq(scoutItemNotes.id, id)).get()!;
      dispatchWebhooks(item.projectId, 'item.commented', { item, note }).catch(() => {});
      eventBus.publish({ type: 'item.commented', projectId: item.projectId, payload: { itemId } });
      return c.json({ data: note }, 201);
    })

  // LINK — agent, admin
  .post('/link',
    requireRole('agent', 'admin'),
    zValidator('json', linkItemSchema),
    async (c) => {
      const data = c.req.valid('json');
      const user = c.get('user');

      if (data.sourceItemId === data.targetItemId) {
        return c.json({ error: 'Item cannot be linked to itself', code: 'VALIDATION_FAILED' }, 400);
      }

      const source = db.select().from(scoutItems).where(eq(scoutItems.id, data.sourceItemId)).get();
      const target = db.select().from(scoutItems).where(eq(scoutItems.id, data.targetItemId)).get();
      if (!source || !target) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (source.projectId !== target.projectId) {
        return c.json({ error: 'Items must belong to the same project', code: 'VALIDATION_FAILED' }, 400);
      }
      if (!checkProjectAccess(user.id, user.role, source.projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      const normalized = normalizeLinkPair(data.sourceItemId, data.targetItemId, data.type);
      const existing = db.select().from(scoutItemLinks)
        .where(and(
          eq(scoutItemLinks.sourceItemId, normalized.sourceItemId),
          eq(scoutItemLinks.targetItemId, normalized.targetItemId),
          eq(scoutItemLinks.type, normalized.type),
        ))
        .get();
      if (existing) return c.json({ data: existing });

      const id = randomUUID();
      db.insert(scoutItemLinks).values({
        id,
        sourceItemId: normalized.sourceItemId,
        targetItemId: normalized.targetItemId,
        type: normalized.type,
        createdById: user.id,
      }).run();

      const link = db.select().from(scoutItemLinks).where(eq(scoutItemLinks.id, id)).get()!;
      logAudit({ userId: user.id, action: 'link_item', entityType: 'item', entityId: data.sourceItemId, details: { targetItemId: data.targetItemId, type: data.type }, ipAddress: getClientIp(c) });
      eventBus.publish({ type: 'item.updated', projectId: source.projectId, payload: { item: enrichItem(source) } });
      eventBus.publish({ type: 'item.updated', projectId: target.projectId, payload: { item: enrichItem(target) } });
      return c.json({ data: link }, 201);
    })

  // UNLINK — agent, admin
  .post('/unlink',
    requireRole('agent', 'admin'),
    zValidator('json', unlinkItemSchema),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('user');

      const link = db.select().from(scoutItemLinks).where(eq(scoutItemLinks.id, id)).get();
      if (!link) throw new NotFoundError('Item link', 'NOT_FOUND');

      const source = db.select().from(scoutItems).where(eq(scoutItems.id, link.sourceItemId)).get();
      const target = db.select().from(scoutItems).where(eq(scoutItems.id, link.targetItemId)).get();
      const projectId = source?.projectId ?? target?.projectId;
      if (!projectId) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      if (!checkProjectAccess(user.id, user.role, projectId)) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      db.delete(scoutItemLinks).where(eq(scoutItemLinks.id, id)).run();
      logAudit({ userId: user.id, action: 'unlink_item', entityType: 'item', entityId: link.sourceItemId, details: { targetItemId: link.targetItemId, type: link.type }, ipAddress: getClientIp(c) });
      if (source) eventBus.publish({ type: 'item.updated', projectId, payload: { item: enrichItem(source) } });
      if (target) eventBus.publish({ type: 'item.updated', projectId, payload: { item: enrichItem(target) } });
      return c.json({ data: { ok: true } });
    });
