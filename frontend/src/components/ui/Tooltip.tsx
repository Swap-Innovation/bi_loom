interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-[#3C4043] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 max-w-xs text-center">
        {content}
      </span>
    </span>
  );
}
