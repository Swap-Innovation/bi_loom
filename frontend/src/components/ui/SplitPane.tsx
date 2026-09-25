import { Group, Panel, Separator } from 'react-resizable-panels';
import { cn } from '../../utils/cn';

interface SplitPaneProps {
  left: React.ReactNode;
  center?: React.ReactNode;
  right: React.ReactNode;
  className?: string;
  defaultSizes?: [number, number, number];
}

export function SplitPane({ left, center, right, className, defaultSizes = [25, 45, 30] }: SplitPaneProps) {
  if (!center) {
    return (
      <Group orientation="horizontal" className={cn('min-h-[480px] rounded-lg border border-border overflow-hidden', className)}>
        <Panel defaultSize={40} minSize={20}>
          <div className="h-full overflow-y-auto bg-white p-3">{left}</div>
        </Panel>
        <Separator className="w-1.5 bg-border hover:bg-primary/30 transition-colors" />
        <Panel defaultSize={60} minSize={25}>
          <div className="h-full overflow-y-auto bg-white p-3">{right}</div>
        </Panel>
      </Group>
    );
  }

  return (
    <Group orientation="horizontal" className={cn('min-h-[520px] rounded-lg border border-border overflow-hidden', className)}>
      <Panel defaultSize={defaultSizes[0]} minSize={22}>
        <div className="h-full overflow-y-auto bg-white p-3 min-w-[200px]">{left}</div>
      </Panel>
      <Separator className="w-1.5 bg-border hover:bg-primary/30 transition-colors" />
      <Panel defaultSize={defaultSizes[1]} minSize={28}>
        <div className="h-full overflow-y-auto bg-white p-3 min-w-[260px]">{center}</div>
      </Panel>
      <Separator className="w-1.5 bg-border hover:bg-primary/30 transition-colors" />
      <Panel defaultSize={defaultSizes[2]} minSize={22}>
        <div className="h-full overflow-y-auto bg-white p-3 min-w-[200px]">{right}</div>
      </Panel>
    </Group>
  );
}
