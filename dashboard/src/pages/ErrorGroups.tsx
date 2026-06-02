import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { formatDate } from '../lib/date';
import {
  findSelectableProjectId,
  getStoredSelectedProjectId,
  storeSelectedProjectId,
} from '../lib/project-selection';
import { useTranslation } from '../i18n';
import Pagination from '../components/Pagination';

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface ErrorGroup {
  id: string;
  fingerprint: string;
  environment: string;
  service: string;
  routeTemplate: string | null;
  method: string | null;
  upstreamService: string | null;
  errorType: string;
  statusCode: number | null;
  severity: 'info' | 'warning' | 'critical';
  state: 'active' | 'ignored' | 'resolved';
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  linkedItemId: string | null;
  linkedItemMessage: string | null;
  sampleRequestId: string | null;
  sampleTraceId: string | null;
  grafanaLogsUrl: string | null;
  grafanaTraceUrl: string | null;
  ignoredUntil: string | null;
  ignoreReason: string | null;
}

interface PaginationData {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

const STATES = ['all', 'active', 'ignored', 'resolved'] as const;
const SEVERITIES = ['all', 'critical', 'warning', 'info'] as const;

const FORM_CONTROL_CLASS =
  'h-9 rounded-md border border-gray-300 px-3 text-sm leading-5 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500';

function getInitialValue<T extends readonly string[]>(params: URLSearchParams, key: string, values: T, fallback: T[number]) {
  const value = params.get(key);
  return value && values.includes(value) ? value : fallback;
}

function getInitialPage(params: URLSearchParams) {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function severityClass(severity: ErrorGroup['severity']) {
  if (severity === 'critical') return 'bg-red-100 text-red-800';
  if (severity === 'warning') return 'bg-yellow-100 text-yellow-800';
  return 'bg-blue-100 text-blue-800';
}

function stateClass(state: ErrorGroup['state']) {
  if (state === 'active') return 'bg-orange-100 text-orange-800';
  if (state === 'ignored') return 'bg-gray-100 text-gray-700';
  return 'bg-green-100 text-green-800';
}

export default function ErrorGroups() {
  const { t, locale } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSearchParams = searchParams.toString();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(() => searchParams.get('project') ?? getStoredSelectedProjectId());
  const [stateFilter, setStateFilter] = useState<string>(() => getInitialValue(searchParams, 'state', STATES, 'active'));
  const [severityFilter, setSeverityFilter] = useState<string>(() => getInitialValue(searchParams, 'severity', SEVERITIES, 'all'));
  const [environmentFilter, setEnvironmentFilter] = useState(() => searchParams.get('environment') ?? '');
  const [serviceFilter, setServiceFilter] = useState(() => searchParams.get('service') ?? '');
  const [linkedItemFilter, setLinkedItemFilter] = useState(() => searchParams.get('linkedItemId') ?? '');
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({ page: getInitialPage(searchParams), perPage: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: Project[] }>('/api/projects/list', { perPage: 100 }).then((res) => {
      setProjects(res.items);
      setSelectedProject((current) => {
        const next = findSelectableProjectId(res.items, current, getStoredSelectedProjectId());
        storeSelectedProjectId(next);
        return next;
      });
    }).catch(() => setError(t('errors.list.loadError')));
  }, [t]);

  useEffect(() => {
    if (!selectedProject) return;

    const next = new URLSearchParams();
    next.set('project', selectedProject);
    if (stateFilter !== 'all') next.set('state', stateFilter);
    if (severityFilter !== 'all') next.set('severity', severityFilter);
    if (environmentFilter) next.set('environment', environmentFilter);
    if (serviceFilter) next.set('service', serviceFilter);
    if (linkedItemFilter) next.set('linkedItemId', linkedItemFilter);
    if (pagination.page > 1) next.set('page', String(pagination.page));

    const nextString = next.toString();
    if (nextString !== currentSearchParams) setSearchParams(next, { replace: true });
  }, [selectedProject, stateFilter, severityFilter, environmentFilter, serviceFilter, linkedItemFilter, pagination.page, currentSearchParams, setSearchParams]);

  const fetchGroups = useCallback(() => {
    if (!selectedProject) return;
    setLoading(true);
    setError('');

    api<{ items: ErrorGroup[]; pagination: PaginationData }>('/api/v1/integrations/errors/list', {
      projectId: selectedProject,
      page: pagination.page,
      perPage: 20,
      ...(stateFilter !== 'all' ? { state: stateFilter } : {}),
      ...(severityFilter !== 'all' ? { severity: severityFilter } : {}),
      ...(environmentFilter ? { environment: environmentFilter } : {}),
      ...(serviceFilter ? { service: serviceFilter } : {}),
      ...(linkedItemFilter ? { linkedItemId: linkedItemFilter } : {}),
    }, t)
      .then((res) => {
        setGroups(res.items);
        setPagination(res.pagination);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('errors.list.loadError')))
      .finally(() => setLoading(false));
  }, [selectedProject, pagination.page, stateFilter, severityFilter, environmentFilter, serviceFilter, linkedItemFilter, t]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const projectId = e.target.value;
    setSelectedProject(projectId);
    storeSelectedProjectId(projectId);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function resetToFirstPage(setter: (value: string) => void, value: string) {
    setter(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }

  async function handleIgnore(group: ErrorGroup) {
    const reason = window.prompt(t('errors.actions.ignorePrompt'))?.trim();
    if (!reason) return;
    setActionId(group.id);
    try {
      await api('/api/v1/integrations/errors/ignore', { id: group.id, ignoreReason: reason }, t);
      fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.actions.failed'));
    } finally {
      setActionId(null);
    }
  }

  async function handleUnignore(group: ErrorGroup) {
    setActionId(group.id);
    try {
      await api('/api/v1/integrations/errors/unignore', { id: group.id }, t);
      fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.actions.failed'));
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('errors.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('errors.description')}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:flex-wrap md:items-center">
        <select value={selectedProject} onChange={handleProjectChange} className={FORM_CONTROL_CLASS}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <select value={stateFilter} onChange={(e) => resetToFirstPage(setStateFilter, e.target.value)} className={FORM_CONTROL_CLASS}>
          {STATES.map((state) => <option key={state} value={state}>{t(`errors.states.${state}`)}</option>)}
        </select>
        <select value={severityFilter} onChange={(e) => resetToFirstPage(setSeverityFilter, e.target.value)} className={FORM_CONTROL_CLASS}>
          {SEVERITIES.map((severity) => <option key={severity} value={severity}>{t(`errors.severities.${severity}`)}</option>)}
        </select>
        <input value={environmentFilter} onChange={(e) => resetToFirstPage(setEnvironmentFilter, e.target.value.trim())} placeholder={t('errors.filters.environment')} className={FORM_CONTROL_CLASS} />
        <input value={serviceFilter} onChange={(e) => resetToFirstPage(setServiceFilter, e.target.value.trim())} placeholder={t('errors.filters.service')} className={FORM_CONTROL_CLASS} />
        <input value={linkedItemFilter} onChange={(e) => resetToFirstPage(setLinkedItemFilter, e.target.value.trim())} placeholder={t('errors.filters.linkedItem')} className={`${FORM_CONTROL_CLASS} md:w-64`} />
        <button
          onClick={() => {
            setStateFilter('active');
            setSeverityFilter('all');
            setEnvironmentFilter('');
            setServiceFilter('');
            setLinkedItemFilter('');
            setPagination((p) => ({ ...p, page: 1 }));
          }}
          className="h-9 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t('common.clear')}
        </button>
      </div>

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="p-6 text-center text-gray-500">{t('common.loading')}</div>
        ) : groups.length === 0 ? (
          <div className="p-6 text-center text-gray-500">{t('errors.empty')}</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {groups.map((group) => (
              <div key={group.id} className="p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${severityClass(group.severity)}`}>{t(`errors.severities.${group.severity}`)}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${stateClass(group.state)}`}>{t(`errors.states.${group.state}`)}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{group.environment}</span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{group.service}</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900">{group.errorType}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {group.routeTemplate ? `${group.method || '*'} ${group.routeTemplate}` : t('errors.fields.noRoute')}
                      {group.statusCode ? ` · HTTP ${group.statusCode}` : ''}
                      {group.upstreamService ? ` · ${group.upstreamService}` : ''}
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-gray-500 md:grid-cols-2">
                      <span>{t('errors.fields.occurrences')}: {group.occurrenceCount}</span>
                      <span>{t('errors.fields.lastSeen')}: {formatDate(group.lastSeenAt, locale)}</span>
                      <span className="font-mono break-all">{t('errors.fields.fingerprint')}: {group.fingerprint}</span>
                      {group.sampleRequestId && <span className="font-mono break-all">{t('errors.fields.requestId')}: {group.sampleRequestId}</span>}
                      {group.sampleTraceId && <span className="font-mono break-all">{t('errors.fields.traceId')}: {group.sampleTraceId}</span>}
                    </div>
                    {group.linkedItemId && (
                      <Link to={`/items/${group.linkedItemId}`} className="mt-2 inline-flex text-xs font-medium text-blue-600 hover:underline">
                        {t('errors.fields.linkedItem')}: {group.linkedItemMessage || `#${group.linkedItemId.slice(0, 8)}`}
                      </Link>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.grafanaLogsUrl && <a href={group.grafanaLogsUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">{t('errors.links.logs')}</a>}
                      {group.grafanaTraceUrl && <a href={group.grafanaTraceUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">{t('errors.links.trace')}</a>}
                    </div>
                  </div>
                  <div className="flex gap-2 md:flex-col">
                    {group.state === 'ignored' ? (
                      <button onClick={() => handleUnignore(group)} disabled={actionId === group.id} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        {t('errors.actions.unignore')}
                      </button>
                    ) : (
                      <button onClick={() => handleIgnore(group)} disabled={actionId === group.id} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        {t('errors.actions.ignore')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && pagination.totalPages > 1 && (
        <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={(page) => setPagination((p) => ({ ...p, page }))} />
      )}
    </div>
  );
}
