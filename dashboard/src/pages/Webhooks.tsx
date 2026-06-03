import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../lib/api';
import {
  findSelectableProjectId,
  getStoredSelectedProjectId,
  storeSelectedProjectId,
} from '../lib/project-selection';
import { useTranslation } from '../i18n';
import Toggle from '../components/Toggle';

interface Webhook {
  id: string;
  projectId: string;
  url: string;
  secret: string | null;
  events: string; // JSON string
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
}

const ALL_EVENT_KEYS = [
  { value: 'item.created', key: 'webhooks.events.item.created' },
  { value: 'item.status_changed', key: 'webhooks.events.item.status_changed' },
  { value: 'item.assigned', key: 'webhooks.events.item.assigned' },
  { value: 'item.commented', key: 'webhooks.events.item.commented' },
  { value: 'item.deleted', key: 'webhooks.events.item.deleted' },
  { value: 'error_group.created', key: 'webhooks.events.error_group.created' },
  { value: 'error_group.updated', key: 'webhooks.events.error_group.updated' },
] as const;

const emptyForm = {
  url: '',
  secret: '',
  events: ['item.created', 'item.status_changed'] as string[],
};

export default function Webhooks() {
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';
  const { t } = useTranslation();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => initialProjectId || getStoredSelectedProjectId(),
  );
  const [webhooksItems, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  // Load projects
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await api<{ items: Project[] }>('/api/projects/list', { perPage: 100 });
        setProjects(res.items);
        setSelectedProjectId((current) => {
          const next = findSelectableProjectId(res.items, current, getStoredSelectedProjectId());
          storeSelectedProjectId(next);
          return next;
        });
      } catch {
        // ignore
      }
    }
    loadProjects();
  }, []);

  // Load webhooks when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setLoading(false);
      return;
    }
    loadWebhooks();
  }, [selectedProjectId]);

  async function loadWebhooks() {
    setLoading(true);
    try {
      const res = await api<{ items: Webhook[] }>('/api/webhooks/list', { projectId: selectedProjectId });
      setWebhooks(res.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(w: Webhook) {
    setEditingId(w.id);
    let events: string[] = [];
    try { events = JSON.parse(w.events); } catch { events = []; }
    setForm({
      url: w.url,
      secret: w.secret || '',
      events,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await api('/api/webhooks/update', {
          id: editingId,
          url: form.url,
          secret: form.secret.trim() || null,
          events: form.events,
        });
      } else {
        await api('/api/webhooks/create', {
          projectId: selectedProjectId,
          url: form.url,
          secret: form.secret.trim() || undefined,
          events: form.events,
        });
      }
      setShowModal(false);
      await loadWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('validation.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('webhooks.deleteConfirm'))) return;
    try {
      await api('/api/webhooks/delete', { id });
      await loadWebhooks();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('validation.deleteError'));
    }
  }

  async function handleToggle(w: Webhook) {
    try {
      await api('/api/webhooks/update', {
        id: w.id,
        isActive: !w.isActive,
      });
      await loadWebhooks();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('validation.updateError'));
    }
  }

  async function handleTest(id: string) {
    setTestResult(null);
    try {
      const res = await api<{ ok: boolean; status?: number; error?: string }>('/api/webhooks/test', { id });
      setTestResult({
        id,
        ok: res.ok,
        message: res.ok ? `OK (${res.status})` : `${t('common.error')}: ${res.error || res.status}`,
      });
    } catch (err) {
      setTestResult({
        id,
        ok: false,
        message: err instanceof Error ? err.message : t('webhooks.testError'),
      });
    }
  }

  function toggleEvent(event: string) {
    setForm(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event],
    }));
  }

  function handleProjectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const projectId = e.target.value;
    setSelectedProjectId(projectId);
    storeSelectedProjectId(projectId);
  }

  function parseEvents(eventsJson: string): string[] {
    try { return JSON.parse(eventsJson); } catch { return []; }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 md:mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('webhooks.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('webhooks.description')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={handleProjectChange}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={openCreate}
            disabled={!selectedProjectId}
            className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {t('webhooks.create')}
          </button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">{t('webhooks.table.url')}</th>
              <th className="px-4 py-3">{t('webhooks.table.events')}</th>
              <th className="px-4 py-3 w-24 text-center">{t('webhooks.table.hmac')}</th>
              <th className="px-4 py-3 w-24 text-center">{t('webhooks.table.active')}</th>
              <th className="px-4 py-3 w-48 text-right">{t('webhooks.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {t('common.loading')}
                </td>
              </tr>
            ) : webhooksItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {t('webhooks.empty')}
                </td>
              </tr>
            ) : (
              webhooksItems.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-xs truncate">
                    {w.url}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {parseEvents(w.events).map((ev) => (
                        <span
                          key={ev}
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {w.secret ? (
                      <span className="text-green-600 text-xs font-medium">{t('common.yes')}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">{t('common.no')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={w.isActive} onChange={() => handleToggle(w)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleTest(w.id)}
                        className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                      >
                        {t('webhooks.test')}
                      </button>
                      <button
                        onClick={() => openEdit(w)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(w.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                    {testResult?.id === w.id && (
                      <div className={`mt-1 text-[10px] ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                        {testResult.message}
                      </div>
                    )}
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
        ) : webhooksItems.length === 0 ? (
          <div className="py-8 text-center text-gray-400">{t('webhooks.empty')}</div>
        ) : (
          webhooksItems.map((w) => (
            <div key={w.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-gray-700 truncate">{w.url}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {parseEvents(w.events).map((ev) => (
                      <span
                        key={ev}
                        className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
                <Toggle checked={w.isActive} onChange={() => handleToggle(w)} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {w.secret ? <span className="text-green-600">HMAC</span> : null}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleTest(w.id)} className="text-xs text-gray-500 hover:underline">{t('webhooks.test')}</button>
                  <button onClick={() => openEdit(w)} className="text-xs text-blue-600 hover:underline">{t('common.edit')}</button>
                  <button onClick={() => handleDelete(w.id)} className="text-xs text-red-600 hover:underline">{t('common.delete')}</button>
                </div>
              </div>
              {testResult?.id === w.id && (
                <div className={`mt-1 text-[10px] ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.message}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
          <form
            onSubmit={handleSubmit}
            className="w-full md:max-w-md rounded-t-xl md:rounded-lg border border-gray-200 bg-white p-5 md:p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              {editingId ? t('webhooks.modal.edit') : t('webhooks.modal.create')}
            </h3>

            {error && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('webhooks.form.url')}</span>
              <input
                type="url"
                name="webhook-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                required
                placeholder="https://hooks.slack.com/services/..."
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
              />
              <p className="mt-1 text-xs text-gray-500">{t('webhooks.form.urlHint')}</p>
            </label>

            <label className="mt-3 block">
              <span className="text-sm font-medium text-gray-700">
                {t('webhooks.form.hmacSecret')} <span className="text-gray-400 font-normal">({t('webhooks.form.hmacOptional')})</span>
              </span>
              <input
                type="text"
                name="webhook-hmac-secret"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                placeholder="your-secret-key"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
              />
              <span className="text-xs text-gray-400">
                {t('webhooks.form.hmacHint')}
              </span>
            </label>

            <fieldset className="mt-3">
              <legend className="text-sm font-medium text-gray-700">{t('webhooks.form.events')}</legend>
              <div className="mt-2 space-y-1.5">
                {ALL_EVENT_KEYS.map(({ value, key }) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.events.includes(value)}
                      onChange={() => toggleEvent(value)}
                      className="rounded border-gray-300"
                    />
                    <span className="font-mono text-xs text-gray-500">{value}</span>
                    <span className="text-gray-400">— {t(key)}</span>
                  </label>
                ))}
              </div>
              {form.events.length === 0 && (
                <p className="mt-1 text-xs text-red-500">{t('webhooks.eventsRequired')}</p>
              )}
            </fieldset>

            <div className="mt-5 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full md:w-auto rounded-md border border-gray-300 px-4 py-2 md:py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving || form.events.length === 0}
                className="w-full md:w-auto rounded-md bg-gray-900 px-4 py-2 md:py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
