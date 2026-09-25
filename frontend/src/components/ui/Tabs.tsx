import { cn } from '../../utils/cn';

interface TabsProps {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-0 border-b border-border', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
            active === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-ink-muted hover:text-ink hover:bg-surface',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn('ml-1.5 text-xs', active === tab.id ? 'text-primary' : 'text-ink-faint')}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
