import { useId, useState } from "react";

export interface DailyReportOutlineItem {
  href: string;
  label: string;
  accent?: boolean;
  children?: readonly DailyReportOutlineItem[];
}

function OutlineList({
  items,
  onNavigate,
}: {
  items: readonly DailyReportOutlineItem[];
  onNavigate?: () => void;
}) {
  return (
    <ul className="report-editor-outline-list">
      {items.map((item) => (
        <li key={`${item.href}:${item.label}`}>
          <a
            href={item.href}
            className={item.accent ? "is-accent" : undefined}
            onClick={onNavigate}
          >
            {item.label}
          </a>
          {item.children?.length ? (
            <OutlineList items={item.children} onNavigate={onNavigate} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function DailyReportOutline({
  label,
  items,
}: {
  label: string;
  items: readonly DailyReportOutlineItem[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileId = useId();
  return (
    <>
      <nav className="report-editor-outline no-print" aria-label={label}>
        <h2>{label}</h2>
        <OutlineList items={items} />
      </nav>
      <div className="report-editor-outline-mobile no-print">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={mobileId}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {label}
        </button>
        <nav id={mobileId} aria-label={label} hidden={!mobileOpen}>
          <OutlineList items={items} onNavigate={() => setMobileOpen(false)} />
        </nav>
      </div>
    </>
  );
}
