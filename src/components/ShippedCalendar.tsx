import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Rocket } from "lucide-react";

const categoryColors: Record<string, string> = {
  contract: "text-accent",
  technical: "text-blue-400",
  product: "text-purple-400",
  team: "text-yellow-400",
  general: "text-muted-foreground",
};

const ShippedCalendar = () => {
  const [viewDate, setViewDate] = useState(new Date());
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);

  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", format(viewDate, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milestones")
        .select("*")
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = (getDay(monthStart) + 6) % 7;
  const cells: (Date | null)[] = [...Array(startPad).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const getMilestones = (day: Date) =>
    milestones.filter((m: any) => isSameDay(new Date(m.date + "T00:00:00"), day));

  return (
    <div className="flex-shrink-0 border-b border-border">
      <div className="flex items-center justify-between px-8 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Rocket className="h-4 w-4 text-accent" />
          <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Astar Shipped
          </span>
          <span className="text-xs font-mono text-muted-foreground/40">
            {format(viewDate, "MMMM yyyy")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewDate((d) => subMonths(d, 1))}
            className="p-1 text-muted-foreground/40 hover:text-accent transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewDate((d) => addMonths(d, 1))}
            className="p-1 text-muted-foreground/40 hover:text-accent transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="px-8 py-3">
        <div className="grid grid-cols-7 gap-px mb-px">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
            <div
              key={d}
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/30 px-2 py-1"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid gap-px bg-border border border-border rounded overflow-hidden">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-px">
              {week.map((day, di) => {
                if (!day)
                  return <div key={di} className="bg-background min-h-[64px]" />;
                const dayMilestones = getMilestones(day);
                const hasEvents = dayMilestones.length > 0;
                return (
                  <div
                    key={di}
                    className={`bg-background min-h-[64px] px-2 py-1.5 ${
                      hasEvents ? "bg-accent/5" : ""
                    }`}
                  >
                    <span
                      className={`text-[11px] font-mono ${
                        hasEvents
                          ? "text-accent font-bold"
                          : "text-muted-foreground/25"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayMilestones.map((m: any) => (
                        <p
                          key={m.id}
                          className={`text-[10px] font-mono leading-tight truncate ${
                            categoryColors[m.category] ?? categoryColors.general
                          }`}
                          title={m.title}
                        >
                          {m.title}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShippedCalendar;
