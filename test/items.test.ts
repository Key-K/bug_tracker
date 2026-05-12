import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { itemRoutes } from '../server/routes/items.js';
import { projects } from '../server/db/schema.js';
import { createTestContext, type TestContext } from './helpers.js';
import { randomUUID } from 'node:crypto';

// Mock the db module
vi.mock('../server/db/client.js', async () => {
  return { db: null, sqlite: { close: () => {} } };
});

describe('Items routes', () => {
  let ctx: TestContext;
  let app: Hono;

  beforeEach(async () => {
    ctx = createTestContext();
    const dbModule = await import('../server/db/client.js');
    (dbModule as any).db = ctx.db;

    app = new Hono();
    app.route('/api/items', itemRoutes);
  });

  function post(path: string, body: unknown, token: string) {
    return app.request(`/api/items${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  async function createTestItem(token?: string, projectId = ctx.projectId) {
    const res = await post('/create', {
      projectId,
      message: 'Test bug report',
      pageUrl: 'http://localhost:3000/page',
      cssSelector: '.btn-submit',
    }, token || ctx.adminToken);
    const body = await res.json() as any;
    return body.data;
  }

  // === CREATE ===

  it('POST /create — admin can create item', async () => {
    const res = await post('/create', {
      projectId: ctx.projectId,
      message: 'Button broken on mobile',
    }, ctx.adminToken);

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.data.status).toBe('new');
    expect(body.data.reporterId).toBe(ctx.adminId);
  });

  it('POST /create — member can create item', async () => {
    const res = await post('/create', {
      projectId: ctx.projectId,
      message: 'Another bug report',
    }, ctx.memberToken);

    expect(res.status).toBe(201);
  });

  it('POST /create — agent cannot create item', async () => {
    const res = await post('/create', {
      projectId: ctx.projectId,
      message: 'Agent should not create',
    }, ctx.agentToken);

    expect(res.status).toBe(403);
  });

  it('POST /create — without auth returns 401', async () => {
    const res = await app.request('/api/items/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: ctx.projectId, message: 'No auth' }),
    });

    expect(res.status).toBe(401);
  });

  // === LIST ===

  it('POST /list — returns items with pagination', async () => {
    await createTestItem();
    await createTestItem();

    const res = await post('/list', { projectId: ctx.projectId }, ctx.adminToken);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination.total).toBe(2);
  });

  it('POST /list — filter by status', async () => {
    await createTestItem();

    const res = await post('/list', {
      projectId: ctx.projectId,
      status: 'in_progress',
    }, ctx.adminToken);

    const body = await res.json() as any;
    expect(body.data.items).toHaveLength(0);
  });

  // === GET ===

  it('POST /get — returns item with notes', async () => {
    const item = await createTestItem();

    const res = await post('/get', { id: item.id }, ctx.adminToken);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.id).toBe(item.id);
    expect(body.data.notes).toBeDefined();
    expect(Array.isArray(body.data.notes)).toBe(true);
  });

  it('POST /get — non-existent returns 404', async () => {
    const res = await post('/get', { id: randomUUID() }, ctx.adminToken);
    expect(res.status).toBe(404);
  });

  // === COUNT ===

  it('POST /count — returns counts by status', async () => {
    await createTestItem();
    await createTestItem();

    const res = await post('/count', { projectId: ctx.projectId }, ctx.adminToken);
    const body = await res.json() as any;
    expect(body.data.counts.new).toBe(2);
    expect(body.data.counts.in_progress).toBe(0);
  });

  // === CLAIM ===

  it('POST /claim — agent claims new item', async () => {
    const item = await createTestItem();

    const res = await post('/claim', { id: item.id }, ctx.agentToken);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('in_progress');
    expect(body.data.assigneeId).toBe(ctx.agentId);
  });

  it('POST /claim — double claim fails with 409', async () => {
    const item = await createTestItem();

    await post('/claim', { id: item.id }, ctx.agentToken);
    const res = await post('/claim', { id: item.id }, ctx.agentToken);
    expect(res.status).toBe(409);
  });

  it('POST /claim — member cannot claim', async () => {
    const item = await createTestItem();
    const res = await post('/claim', { id: item.id }, ctx.memberToken);
    expect(res.status).toBe(403);
  });

  // === RESOLVE ===

  it('POST /resolve — from in_progress to done', async () => {
    const item = await createTestItem();
    await post('/claim', { id: item.id }, ctx.agentToken);

    const res = await post('/resolve', {
      id: item.id,
      resolutionNote: 'Fixed the button handler',
      branchName: 'fix/scout-123',
    }, ctx.agentToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('done');
    expect(body.data.resolvedAt).toBeDefined();
    expect(body.data.resolutionNote).toBe('Fixed the button handler');
  });

  it('POST /resolve — from new fails (invalid transition)', async () => {
    const item = await createTestItem();
    const res = await post('/resolve', { id: item.id }, ctx.agentToken);
    expect(res.status).toBe(400);
  });

  // === CANCEL ===

  it('POST /cancel — admin cancels new item', async () => {
    const item = await createTestItem();
    const res = await post('/cancel', { id: item.id }, ctx.adminToken);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('cancelled');
  });

  it('POST /cancel — cannot cancel done item', async () => {
    const item = await createTestItem();
    await post('/claim', { id: item.id }, ctx.agentToken);
    await post('/resolve', { id: item.id }, ctx.agentToken);

    const res = await post('/cancel', { id: item.id }, ctx.adminToken);
    expect(res.status).toBe(400);
  });

  // === ADD NOTE ===

  it('POST /add-note — any role can add note', async () => {
    const item = await createTestItem();

    const res = await post('/add-note', {
      itemId: item.id,
      content: 'This is a manual comment',
    }, ctx.memberToken);

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.data.content).toBe('This is a manual comment');
    expect(body.data.type).toBe('comment');
  });

  // === LINKS ===

  it('POST /link — agent can link related items', async () => {
    const first = await createTestItem();
    const second = await createTestItem();

    const res = await post('/link', {
      sourceItemId: first.id,
      targetItemId: second.id,
      type: 'duplicate',
    }, ctx.agentToken);

    expect(res.status).toBe(201);

    const getRes = await post('/get', { id: first.id }, ctx.adminToken);
    const body = await getRes.json() as any;
    expect(body.data.relatedItems).toHaveLength(1);
    expect(body.data.relatedItems[0].type).toBe('duplicate');
    expect(body.data.relatedItems[0].item.id).toBe(second.id);
  });

  it('POST /link — duplicate link is idempotent', async () => {
    const first = await createTestItem();
    const second = await createTestItem();

    const firstRes = await post('/link', {
      sourceItemId: first.id,
      targetItemId: second.id,
      type: 'related',
    }, ctx.agentToken);
    const secondRes = await post('/link', {
      sourceItemId: second.id,
      targetItemId: first.id,
      type: 'related',
    }, ctx.agentToken);

    expect(firstRes.status).toBe(201);
    expect(secondRes.status).toBe(200);

    const getRes = await post('/get', { id: first.id }, ctx.adminToken);
    const body = await getRes.json() as any;
    expect(body.data.relatedItems).toHaveLength(1);
  });

  it('POST /link — member cannot link items', async () => {
    const first = await createTestItem();
    const second = await createTestItem();

    const res = await post('/link', {
      sourceItemId: first.id,
      targetItemId: second.id,
      type: 'related',
    }, ctx.memberToken);

    expect(res.status).toBe(403);
  });

  it('POST /link — rejects self-link', async () => {
    const item = await createTestItem();

    const res = await post('/link', {
      sourceItemId: item.id,
      targetItemId: item.id,
      type: 'related',
    }, ctx.agentToken);

    expect(res.status).toBe(400);
  });

  it('POST /link — rejects cross-project links', async () => {
    const first = await createTestItem();
    const otherProjectId = randomUUID();
    ctx.db.insert(projects).values({
      id: otherProjectId,
      name: 'Other Project',
      slug: 'other-project',
      allowedOrigins: '[]',
      autofixEnabled: false,
    }).run();
    const second = await createTestItem(ctx.adminToken, otherProjectId);

    const res = await post('/link', {
      sourceItemId: first.id,
      targetItemId: second.id,
      type: 'related',
    }, ctx.adminToken);

    expect(res.status).toBe(400);
  });

  it('POST /unlink — agent can remove link', async () => {
    const first = await createTestItem();
    const second = await createTestItem();

    const linkRes = await post('/link', {
      sourceItemId: first.id,
      targetItemId: second.id,
      type: 'related',
    }, ctx.agentToken);
    const linkBody = await linkRes.json() as any;

    const unlinkRes = await post('/unlink', { id: linkBody.data.id }, ctx.agentToken);
    expect(unlinkRes.status).toBe(200);

    const getRes = await post('/get', { id: first.id }, ctx.adminToken);
    const body = await getRes.json() as any;
    expect(body.data.relatedItems).toHaveLength(0);
  });

  it('POST /unlink — member cannot remove link', async () => {
    const first = await createTestItem();
    const second = await createTestItem();

    const linkRes = await post('/link', {
      sourceItemId: first.id,
      targetItemId: second.id,
      type: 'related',
    }, ctx.agentToken);
    const linkBody = await linkRes.json() as any;

    const unlinkRes = await post('/unlink', { id: linkBody.data.id }, ctx.memberToken);
    expect(unlinkRes.status).toBe(403);
  });

  // === AUTO-NOTES ===

  it('claim + resolve creates auto-notes', async () => {
    const item = await createTestItem();
    await post('/claim', { id: item.id }, ctx.agentToken);
    await post('/resolve', { id: item.id }, ctx.agentToken);

    const res = await post('/get', { id: item.id }, ctx.adminToken);
    const body = await res.json() as any;
    const notes = body.data.notes;

    // Expect: claim(assignment) + claim(status_change) + resolve(status_change) = 3 auto-notes
    expect(notes.length).toBeGreaterThanOrEqual(3);
    const types = notes.map((n: any) => n.type);
    expect(types).toContain('assignment');
    expect(types).toContain('status_change');
  });

  // === UPDATE ===

  it('POST /update — admin can update message', async () => {
    const item = await createTestItem();

    const res = await post('/update', {
      id: item.id,
      message: 'Updated bug report message',
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.message).toBe('Updated bug report message');
  });

  it('POST /update — admin can update priority', async () => {
    const item = await createTestItem();

    const res = await post('/update', {
      id: item.id,
      priority: 'critical',
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.priority).toBe('critical');
  });

  it('POST /update — admin can update labels', async () => {
    const item = await createTestItem();

    const res = await post('/update', {
      id: item.id,
      labels: ['ui', 'regression'],
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(JSON.parse(body.data.labels)).toEqual(['ui', 'regression']);
  });

  it('POST /update — admin can reassign (update assigneeId)', async () => {
    const item = await createTestItem();

    const res = await post('/update', {
      id: item.id,
      assigneeId: ctx.agentId,
    }, ctx.adminToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.assigneeId).toBe(ctx.agentId);
  });

  it('POST /update — non-admin cannot update (403)', async () => {
    const item = await createTestItem();

    const res = await post('/update', {
      id: item.id,
      message: 'Hacked message',
    }, ctx.memberToken);

    expect(res.status).toBe(403);
  });

  it('POST /update — non-existent item returns 404', async () => {
    const res = await post('/update', {
      id: randomUUID(),
      message: 'No such item',
    }, ctx.adminToken);

    expect(res.status).toBe(404);
  });

  // === DELETE ===

  it('POST /delete — admin can delete item', async () => {
    const item = await createTestItem();

    const res = await post('/delete', { id: item.id }, ctx.adminToken);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.ok).toBe(true);

    // Verify it's actually gone
    const getRes = await post('/get', { id: item.id }, ctx.adminToken);
    expect(getRes.status).toBe(404);
  });

  it('POST /delete — non-admin cannot delete (403)', async () => {
    const item = await createTestItem();

    const res = await post('/delete', { id: item.id }, ctx.memberToken);
    expect(res.status).toBe(403);
  });

  it('POST /delete — non-existent item returns 404', async () => {
    const res = await post('/delete', { id: randomUUID() }, ctx.adminToken);
    expect(res.status).toBe(404);
  });

  // === REOPEN ===

  it('POST /reopen — admin can reopen done item (→ new)', async () => {
    const item = await createTestItem();
    await post('/claim', { id: item.id }, ctx.agentToken);
    await post('/resolve', { id: item.id }, ctx.agentToken);

    const res = await post('/reopen', { id: item.id }, ctx.adminToken);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('new');
    expect(body.data.assigneeId).toBeNull();
  });

  it('POST /reopen — admin can reopen cancelled item (→ new)', async () => {
    const item = await createTestItem();
    await post('/cancel', { id: item.id }, ctx.adminToken);

    const res = await post('/reopen', { id: item.id }, ctx.adminToken);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('new');
  });

  it('POST /reopen — cannot reopen item already in new (400)', async () => {
    const item = await createTestItem();

    const res = await post('/reopen', { id: item.id }, ctx.adminToken);
    expect(res.status).toBe(400);
  });

  it('POST /reopen — cannot reopen item in in_progress (400)', async () => {
    const item = await createTestItem();
    await post('/claim', { id: item.id }, ctx.agentToken);

    const res = await post('/reopen', { id: item.id }, ctx.adminToken);
    expect(res.status).toBe(400);
  });

  it('POST /reopen — non-admin cannot reopen (403)', async () => {
    const item = await createTestItem();
    await post('/claim', { id: item.id }, ctx.agentToken);
    await post('/resolve', { id: item.id }, ctx.agentToken);

    const res = await post('/reopen', { id: item.id }, ctx.agentToken);
    expect(res.status).toBe(403);
  });

  // === UPDATE STATUS (generic) ===

  it('POST /update-status — agent can change in_progress → review', async () => {
    const item = await createTestItem();
    await post('/claim', { id: item.id }, ctx.agentToken);

    const res = await post('/update-status', {
      id: item.id,
      status: 'review',
    }, ctx.agentToken);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.status).toBe('review');
  });

  it('POST /update-status — invalid transition returns 400', async () => {
    const item = await createTestItem();

    // new → review is not a valid transition
    const res = await post('/update-status', {
      id: item.id,
      status: 'review',
    }, ctx.agentToken);

    expect(res.status).toBe(400);
  });

  it('POST /update-status — member cannot update status (403)', async () => {
    const item = await createTestItem();

    const res = await post('/update-status', {
      id: item.id,
      status: 'in_progress',
    }, ctx.memberToken);

    expect(res.status).toBe(403);
  });
});
