import { useEffect, useRef, useState, useCallback, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { formatDate, formatDateShort } from '../lib/date';
import { canCreateItems, isAdmin } from '../lib/auth';
import {
  findSelectableProjectId,
  getStoredSelectedProjectId,
  storeSelectedProjectId,
} from '../lib/project-selection';
import { useSSE } from '../hooks/useSSE';
import { useTranslation } from '../i18n';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import ItemTypeBadge from '../components/ItemTypeBadge';
import Labels, { parseLabels } from '../components/Labels';
import Pagination from '../components/Pagination';

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface Item {
  id: string;
  itemType: string;
  message: string;
  status: string;
  priority: string | null;
  labels: string | null;
  reporterName: string | null;
  assigneeName: string | null;
  createdAt: string;
}

interface UserListItem {
  id: string;
  name: string;
}

interface PaginationData {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface Counts {
  new: number;
  in_progress: number;
  review: number;
  testing: number;
  done: number;
  changes_requested: number;
  verified: number;
  cancelled: number;
}

const STATUSES = ['all', 'new', 'in_progress', 'review', 'testing', 'done', 'changes_requested', 'verified', 'cancelled'] as const;
const ITEM_TYPES = ['all', 'bug', 'note', 'task'] as const;

const STATUS_KEYS: Record<string, string> = {
  all: 'items.statuses.all',
  new: 'items.statuses.new',
  in_progress: 'items.statuses.in_progress',
  review: 'items.statuses.review',
  testing: 'items.statuses.testing',
  done: 'items.statuses.done',
  changes_requested: 'items.statuses.changes_requested',
  verified: 'items.statuses.verified',
  cancelled: 'items.statuses.cancelled',
};

const ITEM_TYPE_KEYS: Record<string, string> = {
  all: 'items.types.all',
  bug: 'items.types.bug',
  note: 'items.types.note',
  task: 'items.types.task',
};

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

const FORM_CONTROL_CLASS =
  'h-9 rounded-md border border-gray-300 px-3 text-sm leading-5 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500';

function getInitialStatus(params: URLSearchParams) {
  const status = params.get('status');
  return status && STATUSES.includes(status as (typeof STATUSES)[number]) ? status : 'all';
}

function getInitialPriority(params: URLSearchParams) {
  const priority = params.get('priority');
  return priority && PRIORITIES.includes(priority as (typeof PRIORITIES)[number]) ? priority : '';
}

function getInitialItemType(params: URLSearchParams) {
  const type = params.get('type');
  return type && ITEM_TYPES.includes(type as (typeof ITEM_TYPES)[number]) ? type : 'all';
}

function getInitialPage(params: URLSearchParams) {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default function Items() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSearchParams = searchParams.toString();
  const admin = isAdmin();
  const { t, locale } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(() => searchParams.get('project') ?? getStoredSelectedProjectId());
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: getInitialPage(searchParams),
    perPage: 20,
    total: 0,
    totalPages: 1,
  });
  const [statusFilter, setStatusFilter] = useState<string>(() => getInitialStatus(searchParams));
  const [itemTypeFilter, setItemTypeFilter] = useState<string>(() => getInitialItemType(searchParams));
  const [counts, setCounts] = useState<Counts>({
    new: 0,
    in_progress: 0,
    review: 0,
    testing: 0,
    done: 0,
    changes_requested: 0,
    verified: 0,
    cancelled: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'bug' | 'note' | 'task'>('task');
  const [createMessage, setCreateMessage] = useState('');
  const [createPriority, setCreatePriority] = useState('medium');
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  // Search state
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Priority filter state
  const [priorityFilter, setPriorityFilter] = useState<string>(() => getInitialPriority(searchParams));

  // Assignee filter state
  const [teamUsers, setTeamUsers] = useState<UserListItem[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(() => searchParams.get('assignee') ?? '');

  // Load projects
  useEffect(() => {
    api<{ items: Project[] }>('/api/projects/list', { perPage: 100 }).then(
      (res) => {
        setProjects(res.items);
        setSelectedProject((current) => {
          const next = findSelectableProjectId(res.items, current, getStoredSelectedProjectId());
          storeSelectedProjectId(next);
          return next;
        });
      },
    ).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedProject) return;

    const next = new URLSearchParams();
    next.set('project', selectedProject);
    if (itemTypeFilter !== 'all') next.set('type', itemTypeFilter);
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (pagination.page > 1) next.set('page', String(pagination.page));
    if (search) next.set('q', search);
    if (priorityFilter) next.set('priority', priorityFilter);
    if (assigneeFilter) next.set('assignee', assigneeFilter);

    const nextString = next.toString();
    if (nextString !== currentSearchParams) {
      setSearchParams(next, { replace: true });
    }
  }, [selectedProject, itemTypeFilter, statusFilter, pagination.page, search, priorityFilter, assigneeFilter, currentSearchParams, setSearchParams]);

  // Load users for assignee filter (admin only)
  useEffect(() => {
    if (!admin) return;
    api<{ items: UserListItem[] }>('/api/users/list', { perPage: 100 })
      .then((res) => setTeamUsers(res.items))
      .catch(() => {});
  }, []);

  // Fetch items + counts (showLoading=true on initial/filter load, false on SSE refresh)
  const fetchData = useCallback((showLoading = true) => {
    if (!selectedProject) return;

    if (showLoading) setLoading(true);

    const body: Record<string, unknown> = {
      projectId: selectedProject,
      page: pagination.page,
      perPage: 20,
    };
    if (itemTypeFilter !== 'all') {
      body.itemType = itemTypeFilter;
    }
    if (statusFilter !== 'all') {
      body.status = statusFilter;
    }
    if (search) {
      body.search = search;
    }
    if (assigneeFilter) {
      body.assigneeId = assigneeFilter;
    }
    if (priorityFilter) {
      body.priority = priorityFilter;
    }

    Promise.all([
      api<{ items: Item[]; pagination: PaginationData }>('/api/items/list', body),
      api<{ counts: Counts }>('/api/items/count', {
        projectId: selectedProject,
        ...(itemTypeFilter !== 'all' ? { itemType: itemTypeFilter } : {}),
      }),
    ])
      .then(([listRes, countRes]) => {
        setItems(listRes.items);
        setPagination(listRes.pagination);
        setCounts(countRes.counts);
      })
      .catch(() => {})
      .finally(() => { if (showLoading) setLoading(false); });
  }, [selectedProject, itemTypeFilter, statusFilter, pagination.page, search, assigneeFilter, priorityFilter]);

  // Load items + counts when project or filter changes
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // SSE: refresh list on any item change
  const handleSSEEvent = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  useSSE({ projectId: selectedProject, onEvent: handleSSEEvent });

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const projectId = e.target.value;
    setSelectedProject(projectId);
    storeSelectedProjectId(projectId);
    setPagination((p) => ({ ...p, page: 1 }));
    setStatusFilter('all');
    setItemTypeFilter('all');
    setSearch('');
    setSearchInput('');
    setAssigneeFilter('');
    setPriorityFilter('');
  }

  function handleStatusChange(status: string) {
    setStatusFilter(status);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function handleItemTypeFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    setItemTypeFilter(e.target.value);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function openCreateModal() {
    setCreateType('task');
    setCreateMessage('');
    setCreatePriority('medium');
    setCreateError('');
    setShowCreateModal(true);
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedProject || !createMessage.trim()) return;
    setCreateSaving(true);
    setCreateError('');
    try {
      const created = await api<Item>('/api/items/create', {
        projectId: selectedProject,
        itemType: createType,
        message: createMessage.trim(),
        ...(createType !== 'note' ? { priority: createPriority } : {}),
      });
      setShowCreateModal(false);
      await fetchData(true);
      navigate(itemPath(created.id));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('validation.saveError'));
    } finally {
      setCreateSaving(false);
    }
  }

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      setPagination((p) => ({ ...p, page: 1 }));
    }, 300);
  }

  function clearSearch() {
    setSearchInput('');
    setSearch('');
    setPagination((p) => ({ ...p, page: 1 }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }

  function handlePriorityFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    setPriorityFilter(e.target.value);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function handleAssigneeFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    setAssigneeFilter(e.target.value);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function itemPath(itemId: string) {
    return `/items/${itemId}`;
  }

  const totalAll = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const canCreateSelectedItem = selectedProject ? canCreateItems(selectedProject) : false;

  function getTabCount(status: string): number | null {
    if (status === 'all') return totalAll || null;
    const val = counts[status as keyof Counts];
    return val > 0 ? val : null;
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 md:mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('items.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('items.description')}</p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!selectedProject || !canCreateSelectedItem}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 md:w-auto md:py-1.5"
          >
            {t('items.create')}
          </button>
          <select
            name="items-project"
            value={selectedProject}
            onChange={handleProjectChange}
            className={`w-full md:w-auto ${FORM_CONTROL_CLASS}`}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* Search + assignee filter */}
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            name="items-search"
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder={t('items.filters.searchPlaceholder')}
            className={`block w-full pr-8 ${FORM_CONTROL_CLASS}`}
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              aria-label={t('common.clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              type="button"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <select
          name="items-type"
          value={itemTypeFilter}
          onChange={handleItemTypeFilter}
          className={`w-full md:w-40 ${FORM_CONTROL_CLASS}`}
        >
          {ITEM_TYPES.map((type) => (
            <option key={type} value={type}>{t(ITEM_TYPE_KEYS[type]!)}</option>
          ))}
        </select>
        <select
          name="items-priority"
          value={priorityFilter}
          onChange={handlePriorityFilter}
          className={`w-full md:w-44 ${FORM_CONTROL_CLASS}`}
        >
          <option value="">{t('items.filters.allPriorities')}</option>
          <option value="critical">{t('items.priorities.critical')}</option>
          <option value="high">{t('items.priorities.high')}</option>
          <option value="medium">{t('items.priorities.medium')}</option>
          <option value="low">{t('items.priorities.low')}</option>
        </select>
        {admin && teamUsers.length > 0 && (
          <select
            name="items-assignee"
            value={assigneeFilter}
            onChange={handleAssigneeFilter}
            className={`w-full md:w-48 ${FORM_CONTROL_CLASS}`}
          >
            <option value="">{t('items.filters.allAssignees')}</option>
            {teamUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Status filter tabs — horizontal scroll on mobile */}
      <div className="mb-4 flex gap-1 border-b border-gray-200 overflow-x-auto">
        {STATUSES.map((s) => {
          const count = getTabCount(s);
          return (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`relative shrink-0 px-3 py-2 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'border-b-2 border-gray-900 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t(STATUS_KEYS[s]!)}
              {count !== null && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">{t('items.table.message')}</th>
              <th className="px-4 py-3 w-28">{t('items.table.type')}</th>
              <th className="px-4 py-3 w-28">{t('items.table.status')}</th>
              <th className="px-4 py-3 w-28">{t('items.table.priority')}</th>
              <th className="px-4 py-3 w-36">{t('items.table.labels')}</th>
              <th className="px-4 py-3 w-36">{t('items.table.author')}</th>
              <th className="px-4 py-3 w-36">{t('items.table.assignee')}</th>
              <th className="px-4 py-3 w-40">{t('items.table.created')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {t('common.loading')}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {search ? t('items.notFound') : t('items.empty')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => navigate(itemPath(item.id))}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 max-w-md truncate text-gray-800">
                    <Link
                      to={itemPath(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate hover:text-gray-950 hover:underline"
                    >
                      {item.message}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <ItemTypeBadge itemType={item.itemType} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <Labels labels={parseLabels(item.labels)} size="xs" />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.reporterName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.assigneeName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(item.createdAt, locale)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="py-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            {search ? t('items.notFound') : t('items.empty')}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => navigate(itemPath(item.id))}
              className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={itemPath(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-medium text-gray-800 line-clamp-2 hover:text-gray-950 hover:underline"
                >
                  {item.message}
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  <ItemTypeBadge itemType={item.itemType} />
                  <PriorityBadge priority={item.priority} />
                  <StatusBadge status={item.status} />
                </div>
              </div>
              {parseLabels(item.labels).length > 0 && (
                <div className="mt-1.5">
                  <Labels labels={parseLabels(item.labels)} size="xs" />
                </div>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                <span>{item.reporterName ?? '—'}</span>
                <span>{formatDateShort(item.createdAt, locale)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
      />

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full rounded-t-xl border border-gray-200 bg-white p-5 shadow-xl md:max-w-lg md:rounded-lg md:p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900">{t('items.create')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('items.createDescription')}</p>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-gray-700">{t('items.form.type')}</span>
              <select
                value={createType}
                onChange={(e) => setCreateType(e.target.value as 'bug' | 'note' | 'task')}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                <option value="task">{t('items.types.task')}</option>
                <option value="note">{t('items.types.note')}</option>
                <option value="bug">{t('items.types.bug')}</option>
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-sm font-medium text-gray-700">{t('items.form.message')}</span>
              <textarea
                value={createMessage}
                onChange={(e) => setCreateMessage(e.target.value)}
                rows={5}
                placeholder={t(`items.form.placeholders.${createType}`)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </label>
            {createType !== 'note' && (
              <label className="mt-3 block">
                <span className="text-sm font-medium text-gray-700">{t('items.table.priority')}</span>
                <select
                  value={createPriority}
                  onChange={(e) => setCreatePriority(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  <option value="critical">{t('items.priorities.critical')}</option>
                  <option value="high">{t('items.priorities.high')}</option>
                  <option value="medium">{t('items.priorities.medium')}</option>
                  <option value="low">{t('items.priorities.low')}</option>
                </select>
              </label>
            )}
            {createError && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={createSaving}
                className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 md:w-auto"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={createSaving || !createMessage.trim()}
                className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 md:w-auto"
              >
                {createSaving ? t('common.saving') : t('common.create')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
