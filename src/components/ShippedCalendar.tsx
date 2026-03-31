import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  subWeeks,
  isToday,
} from "date-fns";
import { Rocket } from "lucide-react";

const WEEKS_TO_SHOW = 5;

const categoryColors: Record<string, string> = {
  contract: "text-accent",
  technical: "text-blue-400",
  product: "text-purple-400",
  team: "text-yellow-400",
  general: "text-muted-foreground",
};

const ShippedCalendar = () => {
  const today = new Date();
  const currentWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const rangeStart = startOfWeek(subWeeks(today, WEEKS_TO_SHOW - 1), { weekStartsOn: 1 });
  const rangeEnd = currentWeekEnd;

  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones", format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milestones")
        .select("*")
        .gte("date", format(rangeStart, "yyyy-MM-dd"))
        .lte("date", format(rangeEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

  const getMilestones = (day: Date) =>
    milestones.filter((m: any) => isSameDay(new Date(m.date + "T00:00:00"), day));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-8 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Rocket className="h-4 w-4 text-accent" />
          <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Astar Shipped
          </span>
          <span className="text-xs font-mono text-muted-foreground/40">
            {format(rangeStart, "MMM d")} — {format(rangeEnd, "MMM d")}
          </span>
        </div>
      </div>

      <div className="px-8 py-2 flex-1 overflow-auto">
        <div className="grid grid-cols-7 gap-px mb-px">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
            <div
              key={d}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/30 px-1.5 py-0.5"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid gap-px bg-border border border-border rounded overflow-hidden">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-px">
              {week.map((day, di) => {
                const dayMilestones = getMilestones(day);
                const hasEvents = dayMilestones.length > 0;
                const todayCell = isToday(day);
                return (
                  <div
                    key={di}
                    className={`bg-background min-h-[40px] px-1.5 py-1 ${
                      todayCell ? "ring-1 ring-inset ring-accent/40" : ""
                    } ${hasEvents ? "bg-accent/5" : ""}`}
                  >
                    <span
                      className={`text-[10px] font-mono ${
                        todayCell
                          ? "text-accent font-bold"
                          : hasEvents
                            ? "text-accent font-bold"
                            : "text-muted-foreground/25"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayMilestones.slice(0, 2).map((m: any) => (
                        <p
                          key={m.id}
                          className={`text-[9px] font-mono leading-tight truncate ${
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
