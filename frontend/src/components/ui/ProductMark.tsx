import { cn } from '../../utils/cn';

interface ProductMarkProps {
  size?: number;
  className?: string;
}

/** Compact Google-style product glyph — solid blue tile, 4px corners. */
export function ProductMark({ size = 32, className }: ProductMarkProps) {
  return (
    <div
      className={cn(
        'shrink-0 flex items-center justify-center text-white font-medium select-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: '#1A73E8',
        fontSize: Math.round(size * 0.34),
        letterSpacing: '-0.02em',
      }}
      aria-hidden
    >
      BL
    </div>
  );
}
