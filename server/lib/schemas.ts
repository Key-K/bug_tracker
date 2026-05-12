import { z } from 'zod';

// === Shared ===
const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

const uuidSchema = z.string().uuid();

// === Auth ===
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// === Projects ===
export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string()
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')
    .min(2)
    .max(50),
  allowedOrigins: z.array(z.string().url()).default([]),
});

export const updateProjectSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(100).optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  autofixEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const getProjectSchema = z.object({ id: uuidSchema });
export const deleteProjectSchema = z.object({ id: uuidSchema });
export const listProjectsSchema = paginationSchema;

// === Users ===
const passwordSchema = z.string().min(8).max(128).regex(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
  'Пароль должен содержать строчную, заглавную букву и цифру',
);

export const createUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1).max(100),
  role: z.enum(['admin', 'member', 'agent']),
  projectIds: z.array(uuidSchema).default([]),
});

export const updateUserSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'member', 'agent']).optional(),
  isActive: z.boolean().optional(),
  projectIds: z.array(uuidSchema).optional(),
  password: passwordSchema.optional(),
});

export const getUserSchema = z.object({ id: uuidSchema });
export const deleteUserSchema = z.object({ id: uuidSchema });
export const listUsersSchema = paginationSchema.extend({
  projectId: uuidSchema.optional(),
});

// === Items ===
export const createItemSchema = z.object({
  projectId: uuidSchema,
  message: z.string().min(3).max(5000),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  labels: z.array(z.string().max(50)).max(10).optional(),
  pageUrl: z.string().max(500).nullish(),
  pageRoute: z.string().max(255).nullish(),
  componentFile: z.string().max(255).nullish(),
  cssSelector: z.string().max(1000).nullish(),
  elementText: z.string().transform((v) => v?.substring(0, 500)).nullish(),
  elementHtml: z.string().transform((v) => v?.substring(0, 2000)).nullish(),
  viewportWidth: z.number().int().min(1).nullish(),
  viewportHeight: z.number().int().min(1).nullish(),
  screenshot: z.string().max(7_000_000).nullish(),       // base64, ~5MB file
  sessionRecording: z.string().max(3_000_000).nullish(),  // base64, ~2MB file
  metadata: z.record(z.string()).nullish(),               // auto-captured environment data
});

export const listItemsSchema = paginationSchema.extend({
  projectId: uuidSchema,
  status: z.enum(['new', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assigneeId: uuidSchema.optional(),
  search: z.string().max(200).optional(),
});

export const getItemSchema = z.object({ id: uuidSchema });

export const countItemsSchema = z.object({
  projectId: uuidSchema,
  status: z.enum(['new', 'in_progress', 'review', 'done', 'cancelled']).optional(),
});

export const claimItemSchema = z.object({ id: uuidSchema });

export const resolveItemSchema = z.object({
  id: uuidSchema,
  resolutionNote: z.string().max(5000).optional(),
  branchName: z.string().max(255).optional(),
  mrUrl: z.string().url().max(500).optional(),
});

export const cancelItemSchema = z.object({ id: uuidSchema });

export const updateItemStatusSchema = z.object({
  id: uuidSchema,
  status: z.enum(['new', 'in_progress', 'review', 'done', 'cancelled']),
  branchName: z.string().max(255).optional(),
  mrUrl: z.string().url().max(500).optional(),
  attemptCount: z.number().int().min(0).optional(),
});

export const deleteItemSchema = z.object({ id: uuidSchema });

export const updateItemSchema = z.object({
  id: uuidSchema,
  message: z.string().min(3).max(5000).optional(),
  assigneeId: uuidSchema.nullish(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  labels: z.array(z.string().max(50)).max(10).optional(),
});

export const reopenItemSchema = z.object({ id: uuidSchema });

export const addNoteSchema = z.object({
  itemId: uuidSchema,
  content: z.string().min(1).max(5000),
});

export const itemLinkTypeSchema = z.enum(['related', 'duplicate', 'blocks', 'blocked_by', 'caused_by', 'conflicts']);

export const linkItemSchema = z.object({
  sourceItemId: uuidSchema,
  targetItemId: uuidSchema,
  type: itemLinkTypeSchema.default('related'),
});

export const unlinkItemSchema = z.object({
  id: uuidSchema,
});

// === API Keys ===
export const createApiKeySchema = z.object({
  projectId: uuidSchema,
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

export const listApiKeysSchema = z.object({
  projectId: uuidSchema,
});

export const revokeApiKeySchema = z.object({
  id: uuidSchema,
});

// === Auth Validation ===
export const validateTokenSchema = z.object({
  token: z.string().min(1),
});

// === Webhooks ===
const webhookEventEnum = z.enum([
  'item.created',
  'item.status_changed',
  'item.assigned',
  'item.commented',
  'item.deleted',
]);

export const createWebhookSchema = z.object({
  projectId: uuidSchema,
  url: z.string().url().max(500),
  secret: z.string().max(255).optional(),
  events: z.array(webhookEventEnum).min(1),
});

export const updateWebhookSchema = z.object({
  id: uuidSchema,
  url: z.string().url().max(500).optional(),
  secret: z.string().max(255).optional(),
  events: z.array(webhookEventEnum).min(1).optional(),
  isActive: z.boolean().optional(),
});

export const deleteWebhookSchema = z.object({ id: uuidSchema });
export const listWebhooksSchema = z.object({ projectId: uuidSchema });
export const testWebhookSchema = z.object({ id: uuidSchema });
