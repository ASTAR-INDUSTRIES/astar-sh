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
import { Rocket, Zap, FileText, Users, Briefcase } from "lucide-react";

const WEEKS_TO_SHOW = 5;

const categoryConfig: Record<string, { color: string; icon: typeof Zap }> = {
  contract: { color: "text-accent", icon: Briefcase },
  technical: { color: "text-blue-400", icon: Zap },
  product: { color: "text-purple-400", icon: FileText },
  team: { color: "text-yellow-400", icon: Users },
  general: { color: "text-muted-foreground", icon: Zap },
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
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
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

      <div className="px-6 py-2 flex-1 overflow-auto">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px mb-px">
          {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
            <div
              key={d}
              className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 px-2 py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid gap-px bg-border/50 border border-border/50 rounded overflow-hidden">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-px">
              {week.map((day, di) => {
                const dayMilestones = getMilestones(day);
                const hasEvents = dayMilestones.length > 0;
                const todayCell = isToday(day);

                return (
                  <div
                    key={di}
                    className={`min-h-[52px] px-2 py-1.5 transition-colors ${
                      hasEvents
                        ? "bg-accent/15"
                        : "bg-background"
                    } ${todayCell ? "ring-1 ring-inset ring-accent/50" : ""}`}
                  >
                    <span
                      className={`text-[11px] font-mono leading-none ${
                        hasEvents
                          ? "text-accent font-bold"
                          : todayCell
                            ? "text-accent font-bold"
                            : "text-muted-foreground/20"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {hasEvents && (
                      <div className="mt-1.5 space-y-1">
                        {dayMilestones.slice(0, 3).map((m: any) => {
                          const config = categoryConfig[m.category] ?? categoryConfig.general;
                          const Icon = config.icon;
                          return (
                            <div
                              key={m.id}
                              className="flex items-start gap-1"
                              title={m.title}
                            >
                              <Icon className={`h-2.5 w-2.5 mt-px shrink-0 ${config.color}`} />
                              <span className={`text-[9px] font-mono leading-tight line-clamp-2 ${config.color}`}>
                                {m.title}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
