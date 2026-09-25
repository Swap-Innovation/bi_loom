import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Plug } from 'lucide-react';
import { ProductMark } from '../ui/ProductMark';
import { BiLoomAssistantPanel } from '../chat/BiLoomAssistantPanel';
import {
  ActivityHistoryBridge,
  AssistantHistoryProvider,
} from '../../context/AssistantHistoryContext';
import { usePageContext } from '../../hooks/usePageContext';

const ASSISTANT_WIDTH_KEY = 'bi-loom-assistant-width';
const DEFAULT_WIDTH = 380;

function AssistantShell({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { projectId } = usePageContext();
  const scope = projectId ?? 'global';
  const [width, setWidth] = useState(() => {
    try {
      const raw = localStorage.getItem(ASSISTANT_WIDTH_KEY);
      const n = raw ? Number(raw) : DEFAULT_WIDTH;
      return Number.isFinite(n) ? Math.min(640, Math.max(280, n)) : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ASSISTANT_WIDTH_KEY, String(width));
    } catch { /* ignore */ }
  }, [width]);

  return (
    <AssistantHistoryProvider scope={scope} key={scope}>
      <ActivityHistoryBridge />
      <BiLoomAssistantPanel
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        width={width}
        onWidthChange={setWidth}
        className="sticky top-0 h-[calc(100vh-4rem)]"
      />
    </AssistantHistoryProvider>
  );
}

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/integrations', icon: Plug, label: 'Integrations' },
] as const;

export function Layout() {
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex flex-col app-canvas">
      <header className="shrink-0 border-b border-border bg-white g-elev-1 z-20">
        <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <ProductMark size={32} />
            <div className="min-w-0 leading-tight">
              <p className="font-medium text-[16px] text-ink truncate">
                BI Loom
              </p>
              <p className="text-[12px] text-ink-muted hidden sm:block">
                Report migration
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1" aria-label="Primary">
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'relative flex items-center gap-2 px-4 h-10 text-sm font-medium transition-colors rounded-[4px]',
                    isActive
                      ? 'text-primary'
                      : 'text-ink-muted hover:text-ink hover:bg-surface',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.75} />
                    <span>{label}</span>
                    {isActive && (
                      <span className="absolute left-3 right-3 -bottom-[13px] h-[3px] rounded-t-full bg-primary" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
        <AssistantShell
          collapsed={assistantCollapsed}
          onToggleCollapse={() => setAssistantCollapsed((v) => !v)}
        />
      </div>
    </div>
  );
}
