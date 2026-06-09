import nodemailer, { type Transporter } from 'nodemailer';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { emailDigestDeliveries, projects, scoutItemNotes, scoutItems, users, type ItemStatus, type ScoutItem, type ScoutItemNote, type User } from '../db/schema.js';
import { logger } from '../lib/logger.js';

type DigestEventType = 'created' | 'status_change' | 'assignment' | 'type_change';

type DigestEvent = {
  type: DigestEventType;
  item: ScoutItem;
  note?: ScoutItemNote;
  actorId?: string | null;
  from?: string;
  to?: string;
};

type RecipientDigest = {
  user: User;
  digestDate: string;
  periodStart: string;
  periodEnd: string;
  itemCount: number;
  createdItemCount: number;
  statusChangeCount: number;
  assignmentCount: number;
  typeChangeCount: number;
  statusTransitions: Record<string, number>;
  currentStatusCounts: Record<string, number>;
  projectCounts: Record<string, number>;
};

type SendMailTransport = Pick<Transporter, 'sendMail'>;

export type DailyDigestResult = {
  digestDate: string;
  periodStart: string;
  periodEnd: string;
  dryRun: boolean;
  recipientCount: number;
  sentCount: number;
  skippedCount: number;
  summaries: Array<{
    userId: string;
    email: string;
    itemCount: number;
    createdItemCount: number;
    statusChangeCount: number;
    assignmentCount: number;
    typeChangeCount: number;
    skipped: boolean;
  }>;
};

type SendDailyDigestsOptions = {
  date?: string;
  dryRun?: boolean;
  force?: boolean;
  now?: Date;
  transport?: SendMailTransport;
};

const DEFAULT_DIGEST_TIME = '18:00';
const DEFAULT_TIME_ZONE = 'Asia/Almaty';

const statusLabels: Record<ItemStatus, string> = {
  new: 'new',
  in_progress: 'in_progress',
  review: 'review',
  done: 'done',
  changes_requested: 'changes_requested',
  verified: 'verified',
  cancelled: 'cancelled',
};

function requireSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user;
  if (!host || !user || !pass || !from) {
    throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM are required for Scout daily digests');
  }

  const port = Number(process.env.SMTP_PORT || '587');
  return {
    host,
    port,
    user,
    pass,
    from,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
  };
}

function hasSmtpConfig(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS && (process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim()));
}

function createTransport(): SendMailTransport {
  const config = requireSmtpConfig();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
}

function formatSqlDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function parseLocalDate(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('Digest date must use YYYY-MM-DD format');
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour) % 24;
  const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), hour, Number(values.minute), Number(values.second));
  return asUtc - date.getTime();
}

function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(date);
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Digest time must use HH:mm format');
  }

  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 3; i += 1) {
    utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - getTimeZoneOffsetMs(timeZone, utc));
  }
  return utc;
}

function addLocalDays(date: string, days: number): string {
  const { year, month, day } = parseLocalDate(date);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

function getLocalDateString(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getDigestPeriod(date: string, timeZone = DEFAULT_TIME_ZONE) {
  const start = zonedTimeToUtc(date, '00:00', timeZone);
  const end = zonedTimeToUtc(addLocalDays(date, 1), '00:00', timeZone);
  return { periodStart: formatSqlDate(start), periodEnd: formatSqlDate(end) };
}

function parseNoteJson(note: ScoutItemNote): Record<string, unknown> {
  try {
    const parsed = JSON.parse(note.content) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function getEvents(periodStart: string, periodEnd: string): DigestEvent[] {
  const created = db.select().from(scoutItems)
    .where(and(gte(scoutItems.createdAt, periodStart), lt(scoutItems.createdAt, periodEnd)))
    .all()
    .map((item) => ({ type: 'created' as const, item, actorId: item.reporterId }));

  const notes = db.select().from(scoutItemNotes)
    .where(and(
      inArray(scoutItemNotes.type, ['status_change', 'assignment', 'type_change']),
      gte(scoutItemNotes.createdAt, periodStart),
      lt(scoutItemNotes.createdAt, periodEnd),
    ))
    .all();

  const itemIds = unique(notes.map((note) => note.itemId));
  const itemRows = itemIds.length === 0
    ? []
    : db.select().from(scoutItems).where(inArray(scoutItems.id, itemIds)).all();
  const itemsById = new Map(itemRows.map((item) => [item.id, item]));

  const noteEvents = notes.flatMap((note): DigestEvent[] => {
    const item = itemsById.get(note.itemId);
    if (!item) return [];
    const parsed = parseNoteJson(note);
    const from = typeof parsed.from === 'string' ? parsed.from : undefined;
    const to = typeof parsed.to === 'string' ? parsed.to : undefined;
    return [{ type: note.type as DigestEventType, item, note, actorId: note.userId, from, to }];
  });

  return [...created, ...noteEvents];
}

function getProjectNames(projectIds: string[]): Map<string, string> {
  if (projectIds.length === 0) return new Map();
  const rows = db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, unique(projectIds))).all();
  return new Map(rows.map((project) => [project.id, project.name]));
}

function getRecipients(events: DigestEvent[]): User[] {
  const userIds = unique(events.flatMap((event) => [
    event.actorId,
    event.item.reporterId,
    event.item.assigneeId,
    event.item.resolvedById,
  ].filter((id): id is string => Boolean(id))));

  if (userIds.length === 0) return [];
  return db.select().from(users)
    .where(and(inArray(users.id, userIds), eq(users.isActive, true)))
    .all();
}

function isUserRelatedToEvent(userId: string, event: DigestEvent): boolean {
  return event.actorId === userId ||
    event.item.reporterId === userId ||
    event.item.assigneeId === userId ||
    event.item.resolvedById === userId;
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function buildRecipientDigest(user: User, events: DigestEvent[], digestDate: string, periodStart: string, periodEnd: string, projectNames: Map<string, string>): RecipientDigest {
  const relevant = events.filter((event) => isUserRelatedToEvent(user.id, event));
  const uniqueItems = unique(relevant.map((event) => event.item.id));
  const digest: RecipientDigest = {
    user,
    digestDate,
    periodStart,
    periodEnd,
    itemCount: uniqueItems.length,
    createdItemCount: relevant.filter((event) => event.type === 'created').length,
    statusChangeCount: relevant.filter((event) => event.type === 'status_change').length,
    assignmentCount: relevant.filter((event) => event.type === 'assignment').length,
    typeChangeCount: relevant.filter((event) => event.type === 'type_change').length,
    statusTransitions: {},
    currentStatusCounts: {},
    projectCounts: {},
  };

  const itemsById = new Map(relevant.map((event) => [event.item.id, event.item]));
  for (const item of itemsById.values()) {
    increment(digest.currentStatusCounts, statusLabels[item.status]);
    increment(digest.projectCounts, projectNames.get(item.projectId) ?? item.projectId);
  }

  for (const event of relevant) {
    if (event.type === 'status_change') {
      increment(digest.statusTransitions, `${event.from ?? '?'} -> ${event.to ?? '?'}`);
    }
  }

  return digest;
}

function buildDigests(digestDate: string, periodStart: string, periodEnd: string): RecipientDigest[] {
  const events = getEvents(periodStart, periodEnd);
  if (events.length === 0) return [];

  const projectNames = getProjectNames(events.map((event) => event.item.projectId));
  return getRecipients(events)
    .map((user) => buildRecipientDigest(user, events, digestDate, periodStart, periodEnd, projectNames))
    .filter((digest) => digest.itemCount > 0);
}

function formatCounts(record: Record<string, number>, emptyText: string): string[] {
  const entries = Object.entries(record).sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0 ? [`- ${emptyText}`] : entries.map(([key, value]) => `- ${key}: ${value}`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]!));
}

function buildDigestText(digest: RecipientDigest): string {
  const baseUrl = process.env.SCOUT_PUBLIC_URL?.trim() || process.env.SCOUT_URL?.trim() || '';
  return [
    `Здравствуйте, ${digest.user.name}.`,
    '',
    `Краткая сводка Scout за ${digest.digestDate} (${process.env.SCOUT_DAILY_DIGEST_TIMEZONE || DEFAULT_TIME_ZONE}).`,
    '',
    'Итоги:',
    `- затронуто задач: ${digest.itemCount}`,
    `- создано задач: ${digest.createdItemCount}`,
    `- переходов статусов: ${digest.statusChangeCount}`,
    `- назначений: ${digest.assignmentCount}`,
    `- изменений типа: ${digest.typeChangeCount}`,
    '',
    'Переходы статусов:',
    ...formatCounts(digest.statusTransitions, 'не было'),
    '',
    'Текущие статусы затронутых задач:',
    ...formatCounts(digest.currentStatusCounts, 'нет затронутых задач'),
    '',
    'Проекты:',
    ...formatCounts(digest.projectCounts, 'нет проектов'),
    ...(baseUrl ? ['', `Открыть Scout: ${baseUrl}`] : []),
  ].join('\n');
}

function buildDigestHtml(digest: RecipientDigest): string {
  const htmlLines = buildDigestText(digest).split('\n').map((line) => {
    if (line === '') return '<br>';
    if (line.startsWith('- ')) return `<li>${escapeHtml(line.slice(2))}</li>`;
    return `<p>${escapeHtml(line)}</p>`;
  });
  return `<!doctype html><html><body>${htmlLines.join('\n')}</body></html>`;
}

function wasAlreadySent(userId: string, digestDate: string): boolean {
  return Boolean(db.select({ id: emailDigestDeliveries.id }).from(emailDigestDeliveries)
    .where(and(eq(emailDigestDeliveries.recipientUserId, userId), eq(emailDigestDeliveries.digestDate, digestDate)))
    .get());
}

function recordDelivery(digest: RecipientDigest, messageId: string | null): void {
  const sentAt = new Date().toISOString();
  const row = {
    recipientEmail: digest.user.email,
    periodStart: digest.periodStart,
    periodEnd: digest.periodEnd,
    itemCount: digest.itemCount,
    createdItemCount: digest.createdItemCount,
    statusChangeCount: digest.statusChangeCount,
    assignmentCount: digest.assignmentCount,
    typeChangeCount: digest.typeChangeCount,
    statusTransitions: JSON.stringify(digest.statusTransitions),
    messageId,
    sentAt,
  };
  db.insert(emailDigestDeliveries).values({
    id: randomUUID(),
    recipientUserId: digest.user.id,
    digestDate: digest.digestDate,
    ...row,
  }).onConflictDoUpdate({
    target: [emailDigestDeliveries.recipientUserId, emailDigestDeliveries.digestDate],
    set: row,
  }).run();
}

export async function sendDailyDigests(options: SendDailyDigestsOptions = {}): Promise<DailyDigestResult> {
  const timeZone = process.env.SCOUT_DAILY_DIGEST_TIMEZONE || DEFAULT_TIME_ZONE;
  const digestDate = options.date ?? getLocalDateString(options.now ?? new Date(), timeZone);
  const { periodStart, periodEnd } = getDigestPeriod(digestDate, timeZone);
  const digests = buildDigests(digestDate, periodStart, periodEnd);
  const dryRun = options.dryRun === true;
  const transport = dryRun ? null : (options.transport ?? createTransport());
  const smtpFrom = dryRun ? 'dry-run@scout.local' : requireSmtpConfig().from;
  let sentCount = 0;
  let skippedCount = 0;
  const summaries: DailyDigestResult['summaries'] = [];

  for (const digest of digests) {
    const skipped = !options.force && wasAlreadySent(digest.user.id, digestDate);
    summaries.push({
      userId: digest.user.id,
      email: digest.user.email,
      itemCount: digest.itemCount,
      createdItemCount: digest.createdItemCount,
      statusChangeCount: digest.statusChangeCount,
      assignmentCount: digest.assignmentCount,
      typeChangeCount: digest.typeChangeCount,
      skipped,
    });

    if (skipped) {
      skippedCount += 1;
      continue;
    }
    if (dryRun) continue;

    const info = await transport!.sendMail({
      from: smtpFrom,
      to: digest.user.email,
      subject: `Scout: ежедневная сводка за ${digest.digestDate}`,
      text: buildDigestText(digest),
      html: buildDigestHtml(digest),
    });
    recordDelivery(digest, typeof info.messageId === 'string' ? info.messageId : null);
    sentCount += 1;
  }

  return {
    digestDate,
    periodStart,
    periodEnd,
    dryRun,
    recipientCount: digests.length,
    sentCount,
    skippedCount,
    summaries,
  };
}

function getNextRunDelay(now: Date, timeZone: string, time: string): { delayMs: number; runAt: Date; digestDate: string } {
  const today = getLocalDateString(now, timeZone);
  let digestDate = today;
  let runAt = zonedTimeToUtc(today, time, timeZone);
  if (runAt.getTime() <= now.getTime() + 1_000) {
    digestDate = addLocalDays(today, 1);
    runAt = zonedTimeToUtc(digestDate, time, timeZone);
  }
  return { delayMs: Math.max(1_000, runAt.getTime() - now.getTime()), runAt, digestDate };
}

export function startDailyDigestWorker(): () => void {
  if (process.env.SCOUT_DAILY_DIGEST_ENABLED === 'false') {
    logger.info('Scout daily email digest worker disabled');
    return () => {};
  }
  if (!hasSmtpConfig()) {
    logger.warn('Scout daily email digest worker not started: SMTP env is incomplete');
    return () => {};
  }

  const timeZone = process.env.SCOUT_DAILY_DIGEST_TIMEZONE || DEFAULT_TIME_ZONE;
  const time = process.env.SCOUT_DAILY_DIGEST_TIME || DEFAULT_DIGEST_TIME;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    const next = getNextRunDelay(new Date(), timeZone, time);
    logger.info({ runAt: next.runAt.toISOString(), digestDate: next.digestDate, timeZone }, 'Scheduled Scout daily email digest');
    timer = setTimeout(async () => {
      try {
        const result = await sendDailyDigests({ date: next.digestDate });
        logger.info({ digestDate: result.digestDate, sentCount: result.sentCount, skippedCount: result.skippedCount, recipientCount: result.recipientCount }, 'Scout daily email digest completed');
      } catch (err) {
        logger.error({ err }, 'Scout daily email digest failed');
      } finally {
        schedule();
      }
    }, next.delayMs);
    timer.unref?.();
  };

  schedule();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
