import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { SkeletonTable } from './Skeleton';

interface DataTableProps<T extends RowData> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  onRowClick?: (row: T) => void;
  selectedId?: string | null;
  getRowId?: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T extends RowData>({
  data, columns, onRowClick, selectedId, getRowId, loading, emptyMessage = 'No data',
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  if (loading) return <SkeletonTable />;

  if (!data.length) {
    return <p className="text-sm text-ink-muted text-center py-8">{emptyMessage}</p>;
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-surface border-b border-border">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th key={header.id} className="px-4 py-3 text-left text-xs font-medium text-ink-muted">
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className={cn('flex items-center gap-1', header.column.getCanSort() && 'cursor-pointer select-none')}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="text-ink-faint">
                          {header.column.getIsSorted() === 'asc' ? <ChevronUp size={14} /> :
                           header.column.getIsSorted() === 'desc' ? <ChevronDown size={14} /> :
                           <ChevronsUpDown size={14} />}
                        </span>
                      )}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const rowId = getRowId?.(row.original);
            const selected = rowId && selectedId === rowId;
            return (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={cn(
                  'border-b border-border last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface',
                  selected && 'bg-primary-soft',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { type ColumnDef };
