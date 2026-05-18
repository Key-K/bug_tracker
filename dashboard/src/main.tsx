import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './main.css';

interface DashboardConfig {
  data?: {
    dashboardWidget?: {
      projectSlug: string;
    } | null;
  };
}

declare global {
  interface Window {
    __SCOUT_CONFIG__?: {
      apiUrl: string;
      projectSlug: string;
    };
    __SCOUT_DASHBOARD_WIDGET_LOADING__?: boolean;
  }
}

async function loadDashboardWidget(): Promise<void> {
  if (window.__SCOUT_DASHBOARD_WIDGET_LOADING__) return;
  if (document.querySelector('#scout-widget-root')) return;
  if (document.querySelector('script[data-scout-dashboard-widget="true"]')) return;

  window.__SCOUT_DASHBOARD_WIDGET_LOADING__ = true;

  try {
    const res = await fetch('/api/dashboard-config');
    if (!res.ok) return;

    const config = await res.json() as DashboardConfig;
    const projectSlug = config.data?.dashboardWidget?.projectSlug;
    if (!projectSlug) return;

    window.__SCOUT_CONFIG__ = {
      apiUrl: window.location.origin,
      projectSlug,
    };

    const script = document.createElement('script');
    script.src = '/widget/scout-widget.js';
    script.async = true;
    script.dataset.scoutDashboardWidget = 'true';
    document.head.appendChild(script);
  } finally {
    window.__SCOUT_DASHBOARD_WIDGET_LOADING__ = false;
  }
}

void loadDashboardWidget();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
