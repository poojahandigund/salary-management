/** One row of a bar list. */
export interface BarItem {
  key: string;
  label: string;
  /** What the bar's length stands for. Bars are drawn relative to the largest value. */
  value: number;
  /** The value, written for people ("$12.3M"). */
  valueText: string;
  /** A second figure shown under the label ("2,500 people"). */
  detail?: string;
}

/**
 * A ranked list with a bar behind each row, for comparing a handful of groups. Plain HTML,
 * so every number is real text that screen readers and tests can read; the bars only add
 * the visual comparison and are hidden from assistive technology.
 */
export function BarList({ items, emptyText }: { items: BarItem[]; emptyText: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  const largest = Math.max(...items.map((item) => item.value));

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        // A tiny value still gets a visible sliver, so nothing looks missing.
        const percent = largest > 0 ? Math.max((item.value / largest) * 100, 1) : 0;
        return (
          <li key={item.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="tabular-nums">
                {item.valueText}
                {item.detail !== undefined && (
                  <span className="ml-2 text-xs text-muted-foreground">{item.detail}</span>
                )}
              </span>
            </div>
            <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                data-testid="bar"
                className="h-full rounded-full bg-primary"
                style={{ width: `${percent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
