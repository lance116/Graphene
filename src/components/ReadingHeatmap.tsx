"use client";

export default function ReadingHeatmap({ dates }: { dates: string[] }) {
  // Count papers read per day
  const counts: Record<string, number> = {};
  for (const d of dates) {
    const key = new Date(d).toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  }

  // Build 52 weeks of days ending today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0=Sun
  const endDate = new Date(today);
  // Start from 52 weeks ago, aligned to Sunday
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 52 * 7 - dayOfWeek);

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

  const maxCount = Math.max(1, ...Object.values(counts));

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

  const totalRead = dates.length;

  return (
    <div className="border border-border p-4 mb-4 sm:mb-6">
      <p className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-3">
        {totalRead} paper{totalRead !== 1 ? "s" : ""} read in the last year
      </p>
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
                const isAfterToday = day.date > today;
                return (
                  <div
                    key={wi}
                    className={`w-[11px] h-[11px] ${isAfterToday ? "" : getColor(day.count)}`}
                    title={
                      isAfterToday
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
