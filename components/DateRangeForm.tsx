"use client";

import { useRef, useState } from "react";

function fmt(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Pick date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${v}T00:00:00Z`));
}

function CalendarIcon() {
  return (
    <svg
      className="dr-cal"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function DateField({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = ref.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };
  return (
    <span className="dr-field-wrap">
      <button
        type="button"
        className="dr-field"
        onClick={open}
        aria-label={`${label}: ${fmt(value)}`}
      >
        <span>{fmt(value)}</span>
        <CalendarIcon />
      </button>
      <input
        ref={ref}
        className="dr-native"
        type="date"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </span>
  );
}

/** Browser-consistent date-range picker: styled buttons that open the native
 * calendar (showPicker) backed by visually-hidden date inputs that submit the
 * GET form. Reused by Reports and Tax via the `action` prop. */
export default function DateRangeForm({
  action,
  from,
  to,
}: {
  action: string;
  from: string;
  to: string;
}) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  return (
    <form className="date-range" method="get" action={action}>
      <DateField name="from" label="From date" value={f} onChange={setF} />
      <span className="dash">–</span>
      <DateField name="to" label="To date" value={t} onChange={setT} />
      <button type="submit" className="dr-apply">
        Apply
      </button>
    </form>
  );
}
