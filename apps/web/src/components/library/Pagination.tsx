interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

const BUTTON_CLASS =
  "min-h-[40px] rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-400";

/** Previous / page n of N / next. Renders nothing for a single page. */
export default function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Song list pages" className="flex items-center justify-between gap-3">
      <button type="button" className={BUTTON_CLASS} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        ← Previous
      </button>
      <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
        Page {page} of {pageCount}
      </span>
      <button type="button" className={BUTTON_CLASS} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        Next →
      </button>
    </nav>
  );
}
