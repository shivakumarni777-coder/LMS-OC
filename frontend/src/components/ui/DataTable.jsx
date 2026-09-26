/**
 * Responsive data table.
 *
 * A real `<table>` with a `<caption>`, because a grid of divs loses the
 * row/column relationship that screen readers rely on. Columns are declared
 * once and rendered by a single loop rather than repeated per screen.
 */
export default function DataTable({ caption, columns, rows, rowKey, emptyState }) {
  if (rows.length === 0 && emptyState) {
    return emptyState;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-5 py-3 text-xs font-semibold tracking-wide text-slate-500 uppercase ${
                  column.align === 'right' ? 'text-right' : ''
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-5 py-3 align-middle text-slate-700 ${
                    column.align === 'right' ? 'text-right tabular-nums' : ''
                  }`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
