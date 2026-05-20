import { db } from '../db/client.js';
import { scoutItems, scoutItemNotes, scoutItemEvidence, type User, type ItemStatus, type ItemPriority } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors.js';

// Both db and tx share these methods — use minimal interface
interface DbOrTx {
  insert: typeof db.insert;
  select: typeof db.select;
  update: typeof db.update;
  delete: typeof db.delete;
}

const VALID_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  new: ['in_progress', 'cancelled'],
  in_progress: ['review', 'done', 'cancelled'],
  review: ['in_progress', 'testing', 'done'],
  testing: ['in_progress', 'done'],
  done: ['new'],
  cancelled: ['new'],
};

type ItemEvidenceInput = {
  kind?: 'handoff' | 'verification' | 'audit' | 'blocker';
  environment: string;
  role?: string;
  url?: string;
  scenario: string;
  action: string;
  visibleResult: string;
  consoleResult?: string;
  networkResult?: string;
  apiResult?: string;
  dbResult?: string;
  fixture?: string;
  cleanupResult?: string;
  commitSha?: string;
  deploySha?: string;
  risks?: string;
};

function now(): string {
  return new Date().toISOString();
}

function addAutoNote(
  tx: DbOrTx,
  itemId: string,
  userId: string,
  content: string,
  type: 'status_change' | 'assignment',
): void {
  tx.insert(scoutItemNotes).values({
    id: randomUUID(),
    itemId,
    userId,
    content,
    type,
  }).run();
}

function addEvidence(
  tx: DbOrTx,
  itemId: string,
  userId: string,
  evidence: ItemEvidenceInput,
): string {
  const id = randomUUID();
  tx.insert(scoutItemEvidence).values({
    id,
    itemId,
    userId,
    kind: evidence.kind ?? 'handoff',
    environment: evidence.environment,
    role: evidence.role,
    url: evidence.url,
    scenario: evidence.scenario,
    action: evidence.action,
    visibleResult: evidence.visibleResult,
    consoleResult: evidence.consoleResult,
    networkResult: evidence.networkResult,
    apiResult: evidence.apiResult,
    dbResult: evidence.dbResult,
    fixture: evidence.fixture,
    cleanupResult: evidence.cleanupResult,
    commitSha: evidence.commitSha,
    deploySha: evidence.deploySha,
    risks: evidence.risks,
    createdAt: now(),
  }).run();
  return id;
}

function hasFreshEvidence(itemId: string, itemUpdatedAt: string): boolean {
  const updatedAt = Date.parse(itemUpdatedAt);
  if (Number.isNaN(updatedAt)) return false;

  const evidence = db.select({ createdAt: scoutItemEvidence.createdAt })
    .from(scoutItemEvidence)
    .where(eq(scoutItemEvidence.itemId, itemId))
    .all();

  return evidence.some((entry) => {
    const createdAt = Date.parse(entry.createdAt);
    return !Number.isNaN(createdAt) && createdAt >= updatedAt;
  });
}

function requireHandoffEvidence(
  item: typeof scoutItems.$inferSelect,
  newStatus: ItemStatus,
  evidence?: ItemEvidenceInput,
): void {
  if (newStatus !== 'review' && newStatus !== 'done') return;
  if (evidence) return;
  if (hasFreshEvidence(item.id, item.updatedAt)) return;
  throw new ValidationError('Fresh structured evidence is required before moving item to review or done', 'EVIDENCE_REQUIRED');
}

function saveFile(base64: string, dir: string, ext: string): string {
  const fullDir = join(process.cwd(), 'storage', dir);
  mkdirSync(fullDir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  const filePath = join(fullDir, filename);
  const buffer = Buffer.from(base64, 'base64');
  writeFileSync(filePath, buffer);
  return `storage/${dir}/${filename}`;
}

/**
 * Save session recording — handles both raw JSON and gzip-compressed data.
 * Widget sends gzip-compressed base64 for smaller transport payload.
 * We decompress and save as JSON for dashboard compatibility.
 */
function saveRecording(base64: string, dir: string): string {
  const fullDir = join(process.cwd(), 'storage', dir);
  mkdirSync(fullDir, { recursive: true });
  const filename = `${randomUUID()}.json`;
  const filePath = join(fullDir, filename);
  const buffer = Buffer.from(base64, 'base64');

  // Detect gzip magic bytes (0x1f 0x8b) — decompress if gzip
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      const decompressed = gunzipSync(buffer);
      writeFileSync(filePath, decompressed);
    } catch {
      // Fallback: save raw (might be corrupted but better than nothing)
      writeFileSync(filePath, buffer);
    }
  } else {
    // Raw JSON from uncompressed recordings
    writeFileSync(filePath, buffer);
  }

  return `storage/${dir}/${filename}`;
}

function deleteFile(path: string | null): void {
  if (!path) return;
  const fullPath = join(process.cwd(), path);
  if (existsSync(fullPath)) unlinkSync(fullPath);
}

export function validateTransition(from: ItemStatus, to: ItemStatus): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new ValidationError(`Invalid status transition: ${from} → ${to}`, 'INVALID_STATUS_TRANSITION');
  }
}

export function createItem(data: {
  projectId: string;
  message: string;
  reporterId: string;
  priority?: ItemPriority;
  labels?: string[];
  pageUrl?: string | null;
  pageRoute?: string | null;
  componentFile?: string | null;
  cssSelector?: string | null;
  elementText?: string | null;
  elementHtml?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  screenshot?: string | null;
  sessionRecording?: string | null;
  metadata?: Record<string, string> | null;
}) {
  // Save files before the transaction (file I/O outside DB transaction)
  let screenshotPath: string | null = null;
  let sessionRecordingPath: string | null = null;

  if (data.screenshot) {
    screenshotPath = saveFile(data.screenshot, 'screenshots', 'jpg');
  }
  if (data.sessionRecording) {
    sessionRecordingPath = saveRecording(data.sessionRecording, 'recordings');
  }

  const id = randomUUID();

  try {
    return db.transaction((tx) => {
      tx.insert(scoutItems).values({
        id,
        projectId: data.projectId,
        message: data.message,
        priority: data.priority ?? 'medium',
        labels: data.labels ? JSON.stringify(data.labels) : null,
        pageUrl: data.pageUrl ?? null,
        pageRoute: data.pageRoute ?? null,
        componentFile: data.componentFile ?? null,
        cssSelector: data.cssSelector ?? null,
        elementText: data.elementText ?? null,
        elementHtml: data.elementHtml ?? null,
        viewportWidth: data.viewportWidth ?? null,
        viewportHeight: data.viewportHeight ?? null,
        screenshotPath,
        sessionRecordingPath,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        reporterId: data.reporterId,
      }).run();

      return tx.select().from(scoutItems).where(eq(scoutItems.id, id)).get()!;
    });
  } catch (err) {
    // If insert fails, clean up orphaned files
    deleteFile(screenshotPath);
    deleteFile(sessionRecordingPath);
    throw err;
  }
}

export function claimItem(itemId: string, user: User) {
  return db.transaction((tx) => {
    // Atomic: only claim if status=new AND unassigned
    const result = tx.update(scoutItems)
      .set({
        status: 'in_progress',
        assigneeId: user.id,
        updatedAt: now(),
      })
      .where(and(
        eq(scoutItems.id, itemId),
        eq(scoutItems.status, 'new'),
        isNull(scoutItems.assigneeId),
      ))
      .run();

    if (result.changes === 0) {
      const item = tx.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get();
      if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');
      throw new ConflictError('Item already claimed or not in "new" status', 'CONFLICT');
    }

    addAutoNote(tx, itemId, user.id, JSON.stringify({ type: 'assignment', userName: user.name }), 'assignment');
    addAutoNote(tx, itemId, user.id, JSON.stringify({ type: 'status_change', from: 'new', to: 'in_progress' }), 'status_change');

    return tx.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get()!;
  });
}

export function updateItemStatus(
  itemId: string,
  newStatus: ItemStatus,
  user: User,
  extra?: {
    branchName?: string;
    mrUrl?: string;
    attemptCount?: number;
    resolutionNote?: string;
    evidence?: ItemEvidenceInput;
  },
) {
  const item = db.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get();
  if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');

  validateTransition(item.status as ItemStatus, newStatus);
  requireHandoffEvidence(item, newStatus, extra?.evidence);

  return db.transaction((tx) => {
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: now(),
    };

    if (extra?.branchName !== undefined) updateData.branchName = extra.branchName;
    if (extra?.mrUrl !== undefined) updateData.mrUrl = extra.mrUrl;
    if (extra?.attemptCount !== undefined) updateData.attemptCount = extra.attemptCount;
    if (extra?.resolutionNote !== undefined) updateData.resolutionNote = extra.resolutionNote;

    if (newStatus === 'done') {
      updateData.resolvedById = user.id;
      updateData.resolvedAt = now();
    }

    tx.update(scoutItems).set(updateData).where(eq(scoutItems.id, itemId)).run();
    if (extra?.evidence) addEvidence(tx, itemId, user.id, extra.evidence);
    addAutoNote(tx, itemId, user.id, JSON.stringify({ type: 'status_change', from: item.status, to: newStatus }), 'status_change');

    return tx.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get()!;
  });
}

export function addItemEvidence(itemId: string, user: User, evidence: ItemEvidenceInput) {
  const item = db.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get();
  if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');

  return db.transaction((tx) => {
    const evidenceId = addEvidence(tx, itemId, user.id, evidence);
    return tx.select().from(scoutItemEvidence).where(eq(scoutItemEvidence.id, evidenceId)).get()!;
  });
}

export function updateItem(itemId: string, data: {
  message?: string;
  assigneeId?: string | null;
  priority?: ItemPriority;
  labels?: string[];
}) {
  const item = db.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get();
  if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (data.message !== undefined) updates.message = data.message;
  if (data.assigneeId !== undefined) updates.assigneeId = data.assigneeId;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.labels !== undefined) updates.labels = JSON.stringify(data.labels);

  db.update(scoutItems).set(updates).where(eq(scoutItems.id, itemId)).run();
  return db.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get()!;
}

export function reopenItem(
  itemId: string,
  user: User,
  targetStatus: Extract<ItemStatus, 'new' | 'in_progress'> = 'new',
  extra?: {
    reason?: 'audit_failed' | 'audit_blocked' | 'staging_failed' | 'regression' | 'manual';
    auditResult?: 'fail' | 'blocked';
  },
) {
  const item = db.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get();
  if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');

  validateTransition(item.status as ItemStatus, 'new');

  return db.transaction((tx) => {
    tx.update(scoutItems).set({
      status: targetStatus,
      assigneeId: targetStatus === 'in_progress' ? user.id : null,
      resolvedById: null,
      resolvedAt: null,
      updatedAt: now(),
    }).where(eq(scoutItems.id, itemId)).run();

    addAutoNote(
      tx,
      itemId,
      user.id,
      JSON.stringify({
        type: 'reopen',
        from: item.status,
        to: targetStatus,
        ...(extra?.reason ? { reason: extra.reason } : {}),
        ...(extra?.auditResult ? { auditResult: extra.auditResult } : {}),
      }),
      'status_change',
    );

    return tx.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get()!;
  });
}

export function deleteItem(itemId: string): void {
  const item = db.select().from(scoutItems).where(eq(scoutItems.id, itemId)).get();
  if (!item) throw new NotFoundError('Item', 'ITEM_NOT_FOUND');

  // Delete from DB first — if this fails, files remain (can be cleaned up later)
  db.delete(scoutItems).where(eq(scoutItems.id, itemId)).run();

  // Clean up files after successful DB delete
  deleteFile(item.screenshotPath);
  deleteFile(item.sessionRecordingPath);
}
