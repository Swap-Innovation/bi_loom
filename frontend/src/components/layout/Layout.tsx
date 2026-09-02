import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Plug } from 'lucide-react';
import { MigrationAssistantPanel } from '../chat/MigrationAssistantPanel';
import {
  ActivityHistoryBridge,
  AssistantHistoryProvider,
} from '../../context/AssistantHistoryContext';
import { usePageContext } from '../../hooks/usePageContext';

const ASSISTANT_WIDTH_KEY = 'migration-ai-assistant-width';
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
      <MigrationAssistantPanel
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        width={width}
        onWidthChange={setWidth}
        className="sticky top-0 h-[calc(100vh-3.75rem)]"
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
      <header className="shrink-0 border-b border-border/80 bg-white/80 backdrop-blur-md">
        <div className="px-5 sm:px-8 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="relative w-8 h-8 rounded-md bg-ink flex items-center justify-center shrink-0 overflow-hidden"
              aria-hidden
            >
              <span
                className="absolute inset-0 opacity-90"
                style={{
                  background:
                    'linear-gradient(145deg, #0F172A 0%, #1E293B 55%, #C8105C 160%)',
                }}
              />
              <span className="relative text-white font-bold text-[11px] tracking-tight">MA</span>
            </div>
            <div className="min-w-0 leading-tight">
              <p className="font-semibold text-[15px] tracking-tight text-ink truncate">
                Migration AI
              </p>
              <p className="text-[10px] text-ink-faint tracking-wide uppercase hidden sm:block">
                Enterprise migration studio
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-0.5" aria-label="Primary">
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'relative flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium transition-colors rounded-md',
                    isActive
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-ink hover:bg-black/[0.03]',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={15} strokeWidth={isActive ? 2.25 : 1.75} />
                    <span>{label}</span>
                    {isActive && (
                      <span className="absolute left-3 right-3 -bottom-[0.7rem] h-0.5 rounded-full bg-primary" />
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
