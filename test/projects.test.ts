import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { projectRoutes } from '../server/routes/projects.js';
import { createTestContext, type TestContext } from './helpers.js';
import { randomUUID } from 'node:crypto';
import * as schema from '../server/db/schema.js';

// Mock the db module
vi.mock('../server/db/client.js', async () => {
  return { db: null, sqlite: { close: () => {} } };
});

describe('Projects routes', () => {
  let ctx: TestContext;
  let app: Hono;

  beforeEach(async () => {
    ctx = createTestContext();
    const dbModule = await import('../server/db/client.js');
    (dbModule as any).db = ctx.db;

    app = new Hono();
    app.route('/api/projects', projectRoutes);
    app.onError((err, c) => {
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json({ error: 'Internal server error' }, 500);
    });
  });

  function post(path: string, body: unknown, token: string) {
    return app.request(`/api/projects${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  // === CREATE ===

  it('POST /create — admin can create project', async () => {
    const res = await post('/create', {
      name: 'New Project',
      slug: 'new-project',
      allowedOrigins: ['http://localhost:5000'],
    }, ctx.adminToken);

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.data.name).toBe('New Project');
    expect(body.data.slug).toBe('new-project');
    expect(body.data.id).toBeDefined();
  });

  it('POST /create — non-admin cannot create', async () => {
    const res = await post('/create', {
      name: 'Forbidden Project',
      slug: 'forbidden-project',
    }, ctx.memberToken);

    expect(res.status).toBe(403);
  });

  it('POST /create — agent cannot create', async () => {
    const res = await post('/create', {
      name: 'Agent Project',
      slug: 'agent-project',
    }, ctx.agentToken);

    expect(res.status).toBe(403);
  });

  it('POST /create — duplicate slug fails with 409', async () => {
    const res = await post('/create', {
      name: 'Duplicate',
      slug: 'test-project', // already exists from seed
    }, ctx.adminToken);

    expect(res.status).toBe(409);
  });

  it('POST /create — missing required fields fails with 400', async () => {
    const res = await post('/create', {}, ctx.adminToken);
    expect(res.status).toBe(400);
  });

  it('POST /create — invalid slug format fails with 400', async () => {
    const res = await post('/create', {
      name: 'Bad Slug',
      slug: 'UPPERCASE_BAD!',
    }, ctx.adminToken);

    expect(res.status).toBe(400);
  });

  it('POST /create — without auth returns 401', async () => {
    const res = await app.request('/api/projects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Auth', slug: 'no-auth' }),
    });

    expect(res.status).toBe(401);
  });

  // === LIST ===

  it('POST /list — admin returns all projects with pagination', async () => {
    const res = await post('/list', {}, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.items).toHaveLength(1); // seed has 1 project
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.pagination.page).toBe(1);
  });

  it('POST /list — non-admin sees only assigned projects', async () => {
    // Create a second project that member has NO access to
    const extraProjectId = randomUUID();
    ctx.db.insert(schema.projects).values({
      id: extraProjectId,
      name: 'Secret Project',
      slug: 'secret-project',
      allowedOrigins: '[]',
    }).run();

    const res = await post('/list', {}, ctx.memberToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    // member only has access to the seed project, not the new one
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].id).toBe(ctx.projectId);
  });

  it('POST /list — admin sees all projects including ones without pivot', async () => {
    const extraProjectId = randomUUID();
    ctx.db.insert(schema.projects).values({
      id: extraProjectId,
      name: 'Extra Project',
      slug: 'extra-project',
      allowedOrigins: '[]',
    }).run();

    const res = await post('/list', {}, ctx.adminToken);
    const body = await res.json() as any;
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination.total).toBe(2);
  });

  it('POST /list — pagination works', async () => {
    // Create 3 more projects (4 total with seed)
    for (let i = 0; i < 3; i++) {
      ctx.db.insert(schema.projects).values({
        id: randomUUID(),
        name: `Project ${i}`,
        slug: `project-${i}`,
        allowedOrigins: '[]',
      }).run();
    }

    const res = await post('/list', { page: 1, perPage: 2 }, ctx.adminToken);
    const body = await res.json() as any;
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination.total).toBe(4);
    expect(body.data.pagination.totalPages).toBe(2);
  });

  // === GET ===

  it('POST /get — admin gets project by id', async () => {
    const res = await post('/get', { id: ctx.projectId }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.id).toBe(ctx.projectId);
    expect(body.data.name).toBe('Test Project');
    expect(body.data.slug).toBe('test-project');
  });

  it('POST /get — member with access can get project', async () => {
    const res = await post('/get', { id: ctx.projectId }, ctx.memberToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.id).toBe(ctx.projectId);
  });

  it('POST /get — agent with access can get project', async () => {
    const res = await post('/get', { id: ctx.projectId }, ctx.agentToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.id).toBe(ctx.projectId);
  });

  it('POST /get — non-admin without access gets 403', async () => {
    // Create a project that member has no pivot entry for
    const secretId = randomUUID();
    ctx.db.insert(schema.projects).values({
      id: secretId,
      name: 'Secret',
      slug: 'secret',
      allowedOrigins: '[]',
    }).run();

    const res = await post('/get', { id: secretId }, ctx.memberToken);
    expect(res.status).toBe(403);
  });

  it('POST /get — non-existent returns 404', async () => {
    const res = await post('/get', { id: randomUUID() }, ctx.adminToken);
    expect(res.status).toBe(404);
  });

  it('POST /get — invalid uuid returns 400', async () => {
    const res = await post('/get', { id: 'not-a-uuid' }, ctx.adminToken);
    expect(res.status).toBe(400);
  });

  // === UPDATE ===

  it('POST /update — admin can update name', async () => {
    const res = await post('/update', {
      id: ctx.projectId,
      name: 'Updated Project Name',
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.name).toBe('Updated Project Name');
  });

  it('POST /update — admin can update allowedOrigins', async () => {
    const res = await post('/update', {
      id: ctx.projectId,
      allowedOrigins: ['http://localhost:8080', 'https://example.com'],
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const origins = JSON.parse(body.data.allowedOrigins);
    expect(origins).toEqual(['http://localhost:8080', 'https://example.com']);
  });

  it('POST /update — admin can update isActive', async () => {
    const res = await post('/update', {
      id: ctx.projectId,
      isActive: false,
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.isActive).toBe(false);
  });

  it('POST /update — non-admin cannot update', async () => {
    const res = await post('/update', {
      id: ctx.projectId,
      name: 'Hacked',
    }, ctx.memberToken);

    expect(res.status).toBe(403);
  });

  it('POST /update — agent cannot update', async () => {
    const res = await post('/update', {
      id: ctx.projectId,
      name: 'Agent Hack',
    }, ctx.agentToken);

    expect(res.status).toBe(403);
  });

  it('POST /update — non-existent returns 404', async () => {
    const res = await post('/update', {
      id: randomUUID(),
      name: 'Ghost',
    }, ctx.adminToken);

    expect(res.status).toBe(404);
  });

  // === DELETE ===

  it('POST /delete — admin can delete empty project', async () => {
    // Create a project with no items
    const emptyId = randomUUID();
    ctx.db.insert(schema.projects).values({
      id: emptyId,
      name: 'Empty',
      slug: 'empty-project',
      allowedOrigins: '[]',
    }).run();

    const res = await post('/delete', { id: emptyId }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.success).toBe(true);

    // Verify project is gone
    const getRes = await post('/get', { id: emptyId }, ctx.adminToken);
    expect(getRes.status).toBe(404);
  });

  it('POST /delete — cannot delete project with items', async () => {
    // Insert an item into the seed project
    ctx.db.insert(schema.scoutItems).values({
      id: randomUUID(),
      projectId: ctx.projectId,
      message: 'Bug in production',
      status: 'new',
    }).run();

    const res = await post('/delete', { id: ctx.projectId }, ctx.adminToken);
    expect(res.status).toBe(400);
  });

  it('POST /delete — non-admin cannot delete', async () => {
    const res = await post('/delete', { id: ctx.projectId }, ctx.memberToken);
    expect(res.status).toBe(403);
  });

  it('POST /delete — agent cannot delete', async () => {
    const res = await post('/delete', { id: ctx.projectId }, ctx.agentToken);
    expect(res.status).toBe(403);
  });

  it('POST /delete — non-existent returns 404', async () => {
    const res = await post('/delete', { id: randomUUID() }, ctx.adminToken);
    expect(res.status).toBe(404);
  });

  it('POST /delete — deleting project also removes pivot entries', async () => {
    // Create a project, add a pivot entry, then delete
    const projId = randomUUID();
    ctx.db.insert(schema.projects).values({
      id: projId,
      name: 'To Delete',
      slug: 'to-delete',
      allowedOrigins: '[]',
    }).run();
    ctx.db.insert(schema.pivotUsersProjects).values({
      userId: ctx.memberId,
      projectId: projId,
    }).run();

    const res = await post('/delete', { id: projId }, ctx.adminToken);
    expect(res.status).toBe(200);

    // Pivot should be cascade-deleted
    const { eq } = await import('drizzle-orm');
    const pivots = ctx.db.select().from(schema.pivotUsersProjects)
      .where(eq(schema.pivotUsersProjects.projectId, projId)).all();
    expect(pivots).toHaveLength(0);
  });
});
