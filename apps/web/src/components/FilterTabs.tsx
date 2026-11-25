"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

export interface Tab {
  id: string;
  label: string;
  count: number;
}

/** Schede secondo il pattern WAI-ARIA: frecce, Home e Fine per spostarsi; Tab entra nel pannello. */
export function FilterTabs({ tabs, active, onChange, children }: { tabs: Tab[]; active: string; onChange: (id: string) => void; children: ReactNode }) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Filtra i risultati" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`min-h-11 rounded-full border px-4 py-1.5 text-[0.9375rem] font-bold ${
                selected ? "border-accent bg-accent text-surface" : "border-line-strong bg-surface text-ink hover:bg-accent-soft"
              }`}
            >
              {t.label} <span className={selected ? "" : "text-ink-muted"}>({t.count})</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`} tabIndex={0} className="pt-6">
        {children}
      </div>
    </div>
  );
}
