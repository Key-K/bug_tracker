import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useTranslation } from '../i18n';
import Pagination from '../components/Pagination';
import Toggle from '../components/Toggle';

interface ProjectRaw {
  id: string;
  name: string;
  slug: string;
  allowedOrigins: string; // JSON string from API
  autofixEnabled: boolean;
  isActive: boolean;
  createdAt: string;
}

interface Project extends Omit<ProjectRaw, 'allowedOrigins'> {
  allowedOrigins: string[];
}

function parseProject(p: ProjectRaw): Project {
  let origins: string[] = [];
  try {
    origins = typeof p.allowedOrigins === 'string' ? JSON.parse(p.allowedOrigins) : p.allowedOrigins;
  } catch { origins = []; }
  return { ...p, allowedOrigins: origins };
}

interface PaginationData {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

const emptyForm = {
  name: '',
  slug: '',
  allowedOrigins: [''] as string[],
  autofixEnabled: false,
  isActive: true,
};

export default function Projects() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    perPage: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function getWidgetCode(project: Project): string {
    const scoutUrl = window.location.origin;
    return `<script>\n  window.__SCOUT_CONFIG__ = {\n    apiUrl: '${scoutUrl}',\n    projectSlug: '${project.slug}',\n  };\n</script>\n<script src="${scoutUrl}/widget/scout-widget.js" async></script>`;
  }

  function copyWidgetCode(project: Project, button: HTMLButtonElement) {
    const code = getWidgetCode(project);
    const previousText = button.textContent;
    const fallbackCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    };

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(code).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    button.textContent = t('projects.widget.copied');
    window.setTimeout(() => {
      button.textContent = previousText;
    }, 1800);
  }

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await api<{ items: Project[]; pagination: PaginationData }>(
        '/api/projects/list',
        { page: pagination.page, perPage: 20 },
      );
      setProjects((res.items as unknown as ProjectRaw[]).map(parseProject));
      setPagination(res.pagination);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, [pagination.page]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(p: Project) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      slug: p.slug,
      allowedOrigins: p.allowedOrigins.length > 0 ? [...p.allowedOrigins] : [''],
      autofixEnabled: p.autofixEnabled,
      isActive: p.isActive,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const origins = form.allowedOrigins
        .map((s) => s.trim())
        .filter(Boolean);

      if (editingId) {
        await api('/api/projects/update', {
          id: editingId,
          name: form.name,
          allowedOrigins: origins,
          autofixEnabled: form.autofixEnabled,
          isActive: form.isActive,
        });
      } else {
        await api('/api/projects/create', {
          name: form.name,
          slug: form.slug,
          allowedOrigins: origins,
        });
      }
      setShowModal(false);
      await loadProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('validation.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('projects.deleteConfirm'))) return;
    try {
      await api('/api/projects/delete', { id });
      await loadProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('validation.deleteError'));
    }
  }

  async function toggleField(
    p: Project,
    field: 'autofixEnabled' | 'isActive',
  ) {
    try {
      await api('/api/projects/update', {
        id: p.id,
        [field]: !p[field],
      });
      await loadProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('validation.updateError'));
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 md:mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('projects.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('projects.description')}</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
        >
          {t('projects.create')}
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">{t('projects.table.name')}</th>
              <th className="px-4 py-3">{t('projects.table.slug')}</th>
              <th className="px-4 py-3">{t('projects.table.origins')}</th>
              <th className="px-4 py-3">{t('projects.table.widget')}</th>
              <th className="px-4 py-3 w-24 text-center">{t('projects.table.autofix')}</th>
              <th className="px-4 py-3 w-24 text-center">{t('projects.table.active')}</th>
              <th className="px-4 py-3 w-28 text-right">{t('projects.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {t('common.loading')}
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {t('common.noData')}
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {p.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {p.slug}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {p.allowedOrigins.join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <details className="group max-w-md">
                      <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:underline">
                        {t('projects.widget.show')}
                      </summary>
                      <div className="mt-2 rounded-md border border-gray-200 bg-gray-950 p-3 text-gray-100">
                        <pre className="max-w-sm overflow-x-auto whitespace-pre-wrap break-all text-xs leading-relaxed"><code>{getWidgetCode(p)}</code></pre>
                        <button
                          type="button"
                          onClick={(event) => copyWidgetCode(p, event.currentTarget)}
                          className="mt-2 rounded border border-gray-700 px-2 py-1 text-xs font-medium text-gray-100 hover:bg-gray-800"
                        >
                          {t('projects.widget.copy')}
                        </button>
                      </div>
                    </details>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle
                      checked={p.autofixEnabled}
                      onChange={() => toggleField(p, 'autofixEnabled')}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle
                      checked={p.isActive}
                      onChange={() => toggleField(p, 'isActive')}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="ml-3 text-sm text-red-600 hover:underline"
                    >
                      {t('common.delete')}
                    </button>
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
        ) : projects.length === 0 ? (
          <div className="py-8 text-center text-gray-400">{t('common.noData')}</div>
        ) : (
          projects.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800">{p.name}</div>
                  <div className="text-xs font-mono text-gray-400 mt-0.5">{p.slug}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.isActive ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">{t('common.active')}</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">{t('common.inactive')}</span>
                  )}
                </div>
              </div>
              {p.allowedOrigins.length > 0 && (
                <div className="mt-2 text-xs text-gray-400 truncate">
                  {p.allowedOrigins.join(', ')}
                </div>
              )}
              <details className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                <summary className="cursor-pointer text-xs font-medium text-blue-600">
                  {t('projects.widget.show')}
                </summary>
                <pre className="mt-2 max-h-36 overflow-auto rounded bg-gray-950 p-2 text-[11px] leading-relaxed text-gray-100"><code>{getWidgetCode(p)}</code></pre>
                <button
                  type="button"
                  onClick={(event) => copyWidgetCode(p, event.currentTarget)}
                  className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white"
                >
                  {t('projects.widget.copy')}
                </button>
              </details>
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Toggle
                      checked={p.autofixEnabled}
                      onChange={() => toggleField(p, 'autofixEnabled')}
                    />
                    {t('projects.form.autofix')}
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Toggle
                      checked={p.isActive}
                      onChange={() => toggleField(p, 'isActive')}
                    />
                    {t('projects.form.active')}
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openEdit(p)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {t('common.delete')}
                  </button>
                </div>
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

      {/* Modal — full screen on mobile, centered on desktop */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
          <form
            onSubmit={handleSubmit}
            className="w-full md:max-w-md rounded-t-xl md:rounded-lg border border-gray-200 bg-white p-5 md:p-6 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              {editingId ? t('projects.modal.edit') : t('projects.modal.create')}
            </h3>

            {error && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('projects.form.name')}</span>
              <input
                type="text"
                name="project-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            {!editingId && (
              <label className="mt-3 block">
                <span className="text-sm font-medium text-gray-700">{t('projects.form.slug')}</span>
                <input
                  type="text"
                  name="project-slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
                  placeholder="my-project"
                />
              </label>
            )}

            <div className="mt-3">
              <span className="text-sm font-medium text-gray-700">
                {t('projects.form.origins')}
              </span>
              <div className="mt-1 space-y-2">
                {form.allowedOrigins.map((origin, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="url"
                      name={`project-origin-${idx}`}
                      value={origin}
                      onChange={(e) => {
                        const updated = [...form.allowedOrigins];
                        updated[idx] = e.target.value;
                        setForm({ ...form, allowedOrigins: updated });
                      }}
                      className={`block w-full rounded-md border px-3 py-2 text-sm ${
                        origin && !origin.match(/^https?:\/\//)
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-300'
                      }`}
                      placeholder="https://example.com"
                    />
                    {form.allowedOrigins.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = form.allowedOrigins.filter((_, i) => i !== idx);
                          setForm({ ...form, allowedOrigins: updated });
                        }}
                        className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm({ ...form, allowedOrigins: [...form.allowedOrigins, ''] })
                }
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {t('projects.form.addOrigin')}
              </button>
              {form.allowedOrigins.some((o) => o && !o.match(/^https?:\/\//)) && (
                <p className="mt-1 text-xs text-red-500">
                  {t('projects.form.originHint')}
                </p>
              )}
            </div>

            {editingId && (
              <div className="mt-3 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.autofixEnabled}
                    onChange={(e) =>
                      setForm({ ...form, autofixEnabled: e.target.checked })
                    }
                    className="rounded border-gray-300"
                  />
                  {t('projects.form.autofix')}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.target.checked })
                    }
                    className="rounded border-gray-300"
                  />
                  {t('projects.form.active')}
                </label>
              </div>
            )}

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
                disabled={saving}
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
