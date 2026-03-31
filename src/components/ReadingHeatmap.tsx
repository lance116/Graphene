"use client";

import { useState } from "react";

export default function ReadingHeatmap({ dates }: { dates: string[] }) {
  const currentYear = new Date().getFullYear();

  // Determine available years from data
  const years = new Set<number>();
  years.add(currentYear);
  for (const d of dates) {
    years.add(new Date(d).getFullYear());
  }
  const sortedYears = [...years].sort((a, b) => b - a);

  const [selectedYear, setSelectedYear] = useState<number | null>(null); // null = trailing 12 months

  // Count papers read per day
  const counts: Record<string, number> = {};
  for (const d of dates) {
    const key = new Date(d).toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate: Date;
  let endDate: Date;

  if (selectedYear === null) {
    // Trailing 12 months: end at today, start 52 weeks + padding ago (aligned to Sunday)
    endDate = new Date(today);
    startDate = new Date(today);
    const dayOfWeek = today.getDay();
    startDate.setDate(startDate.getDate() - 52 * 7 - dayOfWeek);
  } else {
    // Full calendar year: Jan 1 to Dec 31, aligned to week boundaries
    startDate = new Date(selectedYear, 0, 1);
    // Align to previous Sunday
    const janDow = startDate.getDay();
    if (janDow > 0) startDate.setDate(startDate.getDate() - janDow);
    endDate = new Date(selectedYear, 11, 31);
  }

  // Build weeks grid
  const weeks: { date: Date; count: number }[][] = [];
  let currentWeek: { date: Date; count: number }[] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    currentWeek.push({ date: new Date(cursor), count: counts[key] || 0 });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  // Count only dates in the selected range for the total
  const rangeStart = selectedYear === null
    ? new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
    : new Date(selectedYear, 0, 1);
  const rangeEnd = selectedYear === null ? today : new Date(selectedYear, 11, 31);
  const totalInRange = dates.filter((d) => {
    const dt = new Date(d);
    return dt >= rangeStart && dt <= rangeEnd;
  }).length;

  // Color scale based on visible range max
  const visibleCounts = Object.entries(counts)
    .filter(([k]) => {
      const dt = new Date(k);
      return dt >= startDate && dt <= endDate;
    })
    .map(([, v]) => v);
  const maxCount = Math.max(1, ...visibleCounts, 1);

  const getColor = (count: number) => {
    if (count === 0) return "bg-surface-2";
    const intensity = count / maxCount;
    if (intensity <= 0.25) return "bg-emerald-900/60";
    if (intensity <= 0.5) return "bg-emerald-700/70";
    if (intensity <= 0.75) return "bg-emerald-500/80";
    return "bg-emerald-400";
  };

  // Month labels
  const months: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const month = week[0].date.getMonth();
    if (month !== lastMonth) {
      months.push({
        label: week[0].date.toLocaleDateString("en-US", { month: "short" }),
        col: i,
      });
      lastMonth = month;
    }
  });

  return (
    <div className="border border-border p-4 mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-text-dim tracking-[0.2em] uppercase">
          {totalInRange} paper{totalInRange !== 1 ? "s" : ""} read {selectedYear === null ? "in the last year" : `in ${selectedYear}`}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedYear(null)}
            className={`px-2 py-0.5 text-[9px] tracking-wider transition-colors ${
              selectedYear === null ? "bg-accent text-bg" : "text-text-dim hover:text-text border border-border"
            }`}
          >
            Last year
          </button>
          {sortedYears.map((y) => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`px-2 py-0.5 text-[9px] tracking-wider transition-colors ${
                selectedYear === y ? "bg-accent text-bg" : "text-text-dim hover:text-text border border-border"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-0.5" style={{ minWidth: "max-content" }}>
          {/* Month labels */}
          <div className="flex gap-0.5 ml-[28px]">
            {weeks.map((_, i) => {
              const month = months.find((m) => m.col === i);
              return (
                <div key={i} className="w-[11px] shrink-0">
                  {month && (
                    <span className="text-[8px] text-text-dim">{month.label}</span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Day rows */}
          {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => (
            <div key={dayIdx} className="flex items-center gap-0.5">
              <span className="text-[8px] text-text-dim w-[24px] text-right pr-1">
                {dayIdx === 1 ? "Mon" : dayIdx === 3 ? "Wed" : dayIdx === 5 ? "Fri" : ""}
              </span>
              {weeks.map((week, wi) => {
                const day = week[dayIdx];
                if (!day) return <div key={wi} className="w-[11px] h-[11px]" />;
                const isOutOfRange = selectedYear !== null
                  ? (day.date.getFullYear() !== selectedYear)
                  : (day.date > today);
                const isFuture = day.date > today;
                return (
                  <div
                    key={wi}
                    className={`w-[11px] h-[11px] ${isOutOfRange || isFuture ? "" : getColor(day.count)}`}
                    title={
                      isOutOfRange || isFuture
                        ? ""
                        : `${day.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}: ${day.count} paper${day.count !== 1 ? "s" : ""}`
                    }
                  />
                );
              })}
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center justify-end gap-1 mt-1 mr-1">
            <span className="text-[8px] text-text-dim">Less</span>
            <div className="w-[11px] h-[11px] bg-surface-2" />
            <div className="w-[11px] h-[11px] bg-emerald-900/60" />
            <div className="w-[11px] h-[11px] bg-emerald-700/70" />
            <div className="w-[11px] h-[11px] bg-emerald-500/80" />
            <div className="w-[11px] h-[11px] bg-emerald-400" />
            <span className="text-[8px] text-text-dim">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
