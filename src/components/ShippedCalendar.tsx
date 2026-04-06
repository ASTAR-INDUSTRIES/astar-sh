import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subWeeks } from "date-fns";
import { Rocket, Zap, FileText, Users, Briefcase } from "lucide-react";

const categoryConfig: Record<string, { color: string; icon: typeof Zap }> = {
  contract: { color: "text-foreground/60", icon: Briefcase },
  technical: { color: "text-foreground/50", icon: Zap },
  product: { color: "text-foreground/50", icon: FileText },
  team: { color: "text-foreground/50", icon: Users },
  general: { color: "text-foreground/30", icon: Zap },
};

const ShippedCalendar = () => {
  const rangeStart = subWeeks(new Date(), 8);

  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones-compact"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milestones")
        .select("*")
        .gte("date", format(rangeStart, "yyyy-MM-dd"))
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
        <Rocket className="h-3.5 w-3.5 text-foreground/40" />
        <span className="text-[10px] font-mono uppercase tracking-[1.17px] text-foreground/40">
          Shipped
        </span>
        <span className="text-[10px] font-mono text-foreground/20 ml-auto">
          {milestones.length}
        </span>
      </div>

      <div className="divide-y divide-border/50">
        {milestones.length === 0 ? (
          <p className="px-4 py-3 text-sm font-mono text-foreground/20 text-center">—</p>
        ) : (
          milestones.map((m: any) => {
            const config = categoryConfig[m.category] ?? categoryConfig.general;
            const Icon = config.icon;
            return (
              <div key={m.id} className="px-4 py-1.5 flex items-center gap-2">
                <span className="text-[10px] font-mono text-foreground/20 w-12 shrink-0 uppercase">
                  {format(new Date(m.date + "T00:00:00"), "MMM d")}
                </span>
                <Icon className={`h-3 w-3 shrink-0 ${config.color}`} />
                <span className={`font-sans text-xs leading-snug truncate ${config.color}`}>
                  {m.title}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ShippedCalendar;
