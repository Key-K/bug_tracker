import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api';
import { formatDate, formatDateShort } from '../lib/date';
import { isAdmin } from '../lib/auth';
import { useSSE } from '../hooks/useSSE';
import { useTranslation } from '../i18n';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import Labels, { parseLabels } from '../components/Labels';
import Pagination from '../components/Pagination';

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface Item {
  id: string;
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
  done: number;
  cancelled: number;
}

const STATUSES = ['all', 'new', 'in_progress', 'review', 'done', 'cancelled'] as const;

const STATUS_KEYS: Record<string, string> = {
  all: 'items.statuses.all',
  new: 'items.statuses.new',
  in_progress: 'items.statuses.in_progress',
  review: 'items.statuses.review',
  done: 'items.statuses.done',
  cancelled: 'items.statuses.cancelled',
};

export default function Items() {
  const navigate = useNavigate();
  const admin = isAdmin();
  const { t, locale } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    perPage: 20,
    total: 0,
    totalPages: 1,
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [counts, setCounts] = useState<Counts>({
    new: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    cancelled: 0,
  });
  const [loading, setLoading] = useState(true);

  // Search state
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Priority filter state
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  // Assignee filter state
  const [teamUsers, setTeamUsers] = useState<UserListItem[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');

  // Load projects
  useEffect(() => {
    api<{ items: Project[] }>('/api/projects/list', { perPage: 100 }).then(
      (res) => {
        setProjects(res.items);
        if (res.items.length > 0 && !selectedProject) {
          setSelectedProject(res.items[0]!.id);
        }
      },
    ).catch(() => {});
  }, []);

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
      }),
    ])
      .then(([listRes, countRes]) => {
        setItems(listRes.items);
        setPagination(listRes.pagination);
        setCounts(countRes.counts);
      })
      .catch(() => {})
      .finally(() => { if (showLoading) setLoading(false); });
  }, [selectedProject, statusFilter, pagination.page, search, assigneeFilter, priorityFilter]);

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
    setSelectedProject(e.target.value);
    setPagination((p) => ({ ...p, page: 1 }));
    setStatusFilter('all');
    setSearch('');
    setSearchInput('');
    setAssigneeFilter('');
    setPriorityFilter('');
  }

  function handleStatusChange(status: string) {
    setStatusFilter(status);
    setPagination((p) => ({ ...p, page: 1 }));
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

  const totalAll =
    counts.new + counts.in_progress + counts.review + counts.done + counts.cancelled;

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
        <select
          name="items-project"
          value={selectedProject}
          onChange={handleProjectChange}
          className="w-full md:w-auto rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
            className="block w-full rounded-md border border-gray-300 pl-3 pr-8 py-1.5 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
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
          name="items-priority"
          value={priorityFilter}
          onChange={handlePriorityFilter}
          className="w-full md:w-44 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
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
            className="w-full md:w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
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
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {t('common.loading')}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {search ? t('items.notFound') : t('items.empty')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/items/${item.id}`)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 max-w-md truncate text-gray-800">
                    {item.message}
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
              onClick={() => navigate(`/items/${item.id}`)}
              className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 line-clamp-2">
                  {item.message}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
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
    </div>
  );
}
