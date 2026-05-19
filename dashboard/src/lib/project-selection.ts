const SELECTED_PROJECT_STORAGE_KEY = 'scout_selected_project_id';

interface ProjectWithId {
  id: string;
}

export function getStoredSelectedProjectId(): string {
  try {
    return localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeSelectedProjectId(projectId: string): void {
  try {
    if (projectId) {
      localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, projectId);
    } else {
      localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY);
    }
  } catch {
    // localStorage can be unavailable in private or restricted browser contexts.
  }
}

export function findSelectableProjectId(
  projects: ProjectWithId[],
  ...candidates: string[]
): string {
  for (const candidate of candidates) {
    if (candidate && projects.some((project) => project.id === candidate)) {
      return candidate;
    }
  }

  return projects[0]?.id ?? '';
}
