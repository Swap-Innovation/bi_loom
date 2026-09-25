import { useMemo } from 'react';
import type { SchemaGraphData } from '../../types';

interface SchemaGraphProps {
  graph: SchemaGraphData | null | undefined;
  loading?: boolean;
}

const NODE_W = 140;
const NODE_H = 48;

export function SchemaGraph({ graph, loading }: SchemaGraphProps) {
  const layout = useMemo(() => {
    const empty = { nodes: [] as SchemaGraphData['nodes'], edges: [] as SchemaGraphData['edges'], positions: {} as Record<string, { x: number; y: number }>, width: 400, height: 200 };
    if (!graph?.nodes.length) return empty;

    const facts = graph.nodes.filter((n) => n.type === 'fact');
    const dims = graph.nodes.filter((n) => n.type !== 'fact');
    const positions: Record<string, { x: number; y: number }> = {};

    facts.forEach((n, i) => {
      positions[n.id] = { x: 40 + i * (NODE_W + 40), y: 40 };
    });
    dims.forEach((n, i) => {
      positions[n.id] = { x: 40 + i * (NODE_W + 24), y: 160 };
    });

    const maxX = Math.max(...Object.values(positions).map((p) => p.x), 0) + NODE_W + 40;
    const height = dims.length || facts.length ? 240 : 120;

    return { nodes: graph.nodes, edges: graph.edges, positions, width: Math.max(maxX, 360), height };
  }, [graph]);

  if (loading) {
    return <div className="h-64 flex items-center justify-center text-sm text-gray-400">Loading schema graph…</div>;
  }

  if (!graph?.nodes.length) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-400 border border-dashed border-border rounded-lg">
        Select a target model to view relationships
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-white overflow-auto">
      <svg width={layout.width} height={layout.height} className="min-w-full">
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>

        {layout.edges.map((edge) => {
          const from = layout.positions[edge.source];
          const to = layout.positions[edge.target];
          if (!from || !to) return null;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const midY = (y1 + y2) / 2;
          return (
            <g key={edge.id}>
              <path
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={1.5}
                markerEnd="url(#arrowhead)"
              />
              <text x={(x1 + x2) / 2} y={midY} textAnchor="middle" className="fill-gray-400 text-[9px]">
                {edge.label}
              </text>
            </g>
          );
        })}

        {layout.nodes.map((node) => {
          const pos = layout.positions[node.id];
          if (!pos) return null;
          const isFact = node.type === 'fact';
          return (
            <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={isFact ? '#fdf2f8' : '#f8fafc'}
                stroke={isFact ? '#ec4899' : '#cbd5e1'}
                strokeWidth={1.5}
              />
              <text x={NODE_W / 2} y={20} textAnchor="middle" className="fill-gray-800 text-[11px] font-semibold">
                {node.label}
              </text>
              <text x={NODE_W / 2} y={36} textAnchor="middle" className="fill-gray-400 text-[9px]">
                {node.column_count} columns
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
