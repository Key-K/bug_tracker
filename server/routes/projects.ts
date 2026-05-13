import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, count, desc, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects, scoutItems, pivotUsersProjects } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, checkProjectAccess, requireProjectPermission } from '../middleware/permissions.js';
import { randomUUID } from 'node:crypto';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../lib/errors.js';
import {
  createProjectSchema, updateProjectSchema,
  getProjectSchema, deleteProjectSchema, listProjectsSchema,
} from '../lib/schemas.js';
import { logAudit, getClientIp } from '../services/audit.js';

export const projectRoutes = new Hono()
  .use('/*', authMiddleware)

  // CREATE — admin only
  .post('/create',
    requireRole('admin'),
    zValidator('json', createProjectSchema),
    async (c) => {
      const { name, slug, allowedOrigins } = c.req.valid('json');

      // Check unique slug
      const existing = db.select().from(projects).where(eq(projects.slug, slug)).get();
      if (existing) throw new ConflictError(`Project with slug '${slug}' already exists`, 'DUPLICATE_SLUG');

      const id = randomUUID();
      db.insert(projects).values({
        id, name, slug,
        allowedOrigins: JSON.stringify(allowedOrigins),
      }).run();

      const project = db.select().from(projects).where(eq(projects.id, id)).get()!;
      const user = c.get('user');
      logAudit({ userId: user.id, action: 'create_project', entityType: 'project', entityId: id, details: { name, slug }, ipAddress: getClientIp(c) });
      return c.json({ data: project }, 201);
    })

  // LIST
  .post('/list',
    zValidator('json', listProjectsSchema),
    async (c) => {
      const { page, perPage } = c.req.valid('json');
      const user = c.get('user');

      const apiKey = c.get('apiKey');
      if (apiKey) {
        const project = db.select().from(projects).where(eq(projects.id, apiKey.projectId)).get();
        return c.json({
          data: {
            items: project ? [project] : [],
            pagination: { page, perPage, total: project ? 1 : 0, totalPages: project ? 1 : 0 },
          },
        });
      }

      // Non-admin users only see projects they're assigned to
      if (user.role !== 'admin') {
        const accessibleProjectIds = db.select({ projectId: pivotUsersProjects.projectId })
          .from(pivotUsersProjects)
          .where(eq(pivotUsersProjects.userId, user.id))
          .all()
          .map((r) => r.projectId);

        if (accessibleProjectIds.length === 0) {
          return c.json({
            data: {
              items: [],
              pagination: { page, perPage, total: 0, totalPages: 0 },
            },
          });
        }

        const items = db.select().from(projects)
          .where(inArray(projects.id, accessibleProjectIds))
          .orderBy(desc(projects.createdAt))
          .limit(perPage)
          .offset((page - 1) * perPage)
          .all();

        const [{ total }] = db.select({ total: count() }).from(projects)
          .where(inArray(projects.id, accessibleProjectIds))
          .all();

        return c.json({
          data: {
            items,
            pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
          },
        });
      }

      const items = db.select().from(projects)
        .orderBy(desc(projects.createdAt))
        .limit(perPage)
        .offset((page - 1) * perPage)
        .all();

      const [{ total }] = db.select({ total: count() }).from(projects).all();

      return c.json({
        data: {
          items,
          pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
        },
      });
    })

  // GET — all roles (with project access check)
  .post('/get',
    zValidator('json', getProjectSchema),
    async (c) => {
      const { id } = c.req.valid('json');
      const user = c.get('user');

      const project = db.select().from(projects).where(eq(projects.id, id)).get();
      if (!project) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND');

      // Check project access
      if (!checkProjectAccess(user.id, user.role, id, c.get('apiKey'))) {
        throw new ForbiddenError('Нет доступа к этому проекту', 'NO_PROJECT_ACCESS');
      }

      return c.json({ data: project });
    })

  // UPDATE — system admin or project owner
  .post('/update',
    zValidator('json', updateProjectSchema),
    async (c) => {
      const { id, name, allowedOrigins, isActive } = c.req.valid('json');
      const user = c.get('user');

      const existing = db.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND');
      requireProjectPermission(user.id, user.role, id, 'manage_project', c.get('apiKey'));

      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (name !== undefined) updateData.name = name;
      if (allowedOrigins !== undefined) updateData.allowedOrigins = JSON.stringify(allowedOrigins);
      if (isActive !== undefined) updateData.isActive = isActive;

      db.update(projects).set(updateData).where(eq(projects.id, id)).run();
      const project = db.select().from(projects).where(eq(projects.id, id)).get()!;
      logAudit({ userId: user.id, action: 'update_project', entityType: 'project', entityId: id, details: { name, isActive }, ipAddress: getClientIp(c) });
      return c.json({ data: project });
    })

  // DELETE — admin only
  .post('/delete',
    requireRole('admin'),
    zValidator('json', deleteProjectSchema),
    async (c) => {
      const { id } = c.req.valid('json');

      const existing = db.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) throw new NotFoundError('Project', 'PROJECT_NOT_FOUND');

      // Check if project has items
      const [{ total }] = db.select({ total: count() }).from(scoutItems)
        .where(eq(scoutItems.projectId, id)).all();
      if (total > 0) {
        throw new ValidationError(`Cannot delete project with ${total} items. Delete items first.`, 'PROJECT_HAS_ITEMS');
      }

      db.delete(projects).where(eq(projects.id, id)).run();
      const user = c.get('user');
      logAudit({ userId: user.id, action: 'delete_project', entityType: 'project', entityId: id, details: { name: existing.name, slug: existing.slug }, ipAddress: getClientIp(c) });
      return c.json({ data: { success: true } });
    });
