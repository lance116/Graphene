"use client";

import { useState } from "react";

export default function ReadingHeatmap({ dates }: { dates: string[] }) {
  const currentYear = new Date().getFullYear();
  const [viewFullYear, setViewFullYear] = useState(false);

  // Count papers read per day
  const counts: Record<string, number> = {};
  for (const d of dates) {
    const key = new Date(d).toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start: Jan 1 of current year, aligned to previous Sunday
  const jan1 = new Date(currentYear, 0, 1);
  const jan1Dow = jan1.getDay();
  const startDate = new Date(jan1);
  if (jan1Dow > 0) startDate.setDate(startDate.getDate() - jan1Dow);

  // End: Dec 31 if viewing full year, otherwise today
  const endDate = viewFullYear ? new Date(currentYear, 11, 31) : new Date(today);

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

  // Total for current year
  const totalInYear = dates.filter((d) => new Date(d).getFullYear() === currentYear).length;

  // Color scale
  const visibleCounts = Object.entries(counts)
    .filter(([k]) => new Date(k).getFullYear() === currentYear)
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
  let lastCol = -4;
  weeks.forEach((week, i) => {
    const month = week[0].date.getMonth();
    if (month !== lastMonth && i - lastCol >= 3) {
      months.push({
        label: week[0].date.toLocaleDateString("en-US", { month: "short" }),
        col: i,
      });
      lastMonth = month;
      lastCol = i;
    } else if (month !== lastMonth) {
      lastMonth = month;
    }
  });

  return (
    <div className="border border-border p-4 mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-text-dim tracking-[0.2em] uppercase">
          {totalInYear} paper{totalInYear !== 1 ? "s" : ""} read in {currentYear}
        </p>
        <button
          onClick={() => setViewFullYear((v) => !v)}
          className={`px-2 py-0.5 text-[9px] tracking-wider transition-colors ${
            viewFullYear ? "bg-accent text-bg" : "text-text-dim hover:text-text border border-border"
          }`}
        >
          {currentYear}
        </button>
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
                const isFuture = day.date > today;
                const isOutsideYear = day.date.getFullYear() !== currentYear;
                return (
                  <div
                    key={wi}
                    className={`w-[11px] h-[11px] ${isFuture || isOutsideYear ? "" : getColor(day.count)}`}
                    title={
                      isFuture || isOutsideYear
                        ? ""
                        : `${day.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${day.count} paper${day.count !== 1 ? "s" : ""}`
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
