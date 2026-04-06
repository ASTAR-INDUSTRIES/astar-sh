import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanityClient } from "@/lib/sanity";
import { format, subDays, startOfDay, startOfWeek, addDays } from "date-fns";
import {
  FileText, MessageCircle,
  BookOpen, Download, ExternalLink,
} from "lucide-react";

const REACTION_EMOJIS = ["🔥", "👏", "🧠", "💡", "🎯"];
import { ScrollArea } from "@/components/ui/scroll-area";
import ShippedCalendar from "@/components/ShippedCalendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ASTAR_VERSION = "0.0.7";

const regionColors: Record<string, string> = {
  US: "text-foreground/70 bg-foreground/5 border border-foreground/10",
  EU: "text-foreground/70 bg-foreground/5 border border-foreground/10",
  NO: "text-foreground/70 bg-foreground/5 border border-foreground/10",
  UK: "text-foreground/70 bg-foreground/5 border border-foreground/10",
  Intl: "text-foreground/70 bg-foreground/5 border border-foreground/10",
};

const HEATMAP_DAYS = 14;
const DAY_LABELS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];

const NewsAutoScroll = ({ posts, onSelect }: { posts: any[]; onSelect: (id: string) => void }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);

  useEffect(() => {
    if (posts.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;

    let raf: number;
    let lastTime = 0;
    const SPEED = 20; // pixels per second

    const tick = (time: number) => {
      if (lastTime === 0) lastTime = time;
      const delta = time - lastTime;
      lastTime = time;

      if (!hovered.current) {
        if (el.scrollTop <= 0) {
          // Seamlessly reset to bottom
          el.scrollTop = el.scrollHeight;
          lastTime = 0;
        } else {
          el.scrollTop -= (SPEED * delta) / 1000;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [posts.length]);

  return (
    <div className="bg-background flex flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
        <FileText className="h-3.5 w-3.5 text-foreground/40" />
        <span className="text-[10px] font-mono uppercase tracking-[1.17px] text-foreground/40">News</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onMouseEnter={() => { hovered.current = true; }}
        onMouseLeave={() => { hovered.current = false; }}
      >
        <div className="divide-y divide-border">
          {posts.length === 0 ? (
            <p className="px-4 py-6 text-sm font-mono text-foreground/20 text-center">—</p>
          ) : (
            posts.map((post: any) => (
              <div key={post._id} className="px-4 py-3 cursor-pointer hover:bg-foreground/5 transition-colors" onClick={() => onSelect(post._id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {post.entities?.[0]?.domain && (
                      <img
                        src={`https://logo.clearbit.com/${post.entities[0].domain}`}
                        alt=""
                        className="h-4 w-4 rounded-sm shrink-0"
                        onError={(e: any) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                    <span className="font-mono text-sm font-medium text-foreground leading-snug">{post.title}</span>
                  </div>
                  {post.publishedAt && (
                    <span className="text-[10px] font-mono text-foreground/25 shrink-0 mt-0.5">
                      {format(new Date(post.publishedAt), "MMM d HH:mm")}
                    </span>
                  )}
                </div>
                {post.excerpt && (
                  <p className="text-[11px] text-foreground/40 mt-1 line-clamp-2 leading-snug">{post.excerpt}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const PublicDashboard = () => {
  const [now, setNow] = useState(new Date());
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);
  const [newsDetail, setNewsDetail] = useState<any | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedNewsId) { setNewsDetail(null); return; }
    sanityClient.fetch(
      `*[_type == "newsPost" && _id == $id][0] {
        _id, title, excerpt, content, category, coverImage,
        sources[] { name, region, url, perspective },
        entities[] { name, domain },
        continues,
        "continuesTitle": *[_type == "newsPost" && slug.current == ^.continues][0].title,
        consensus, divergence, takeaway,
        authorName, publishedAt
      }`,
      { id: selectedNewsId }
    ).then(setNewsDetail);
  }, [selectedNewsId]);

  const { data: skills = [] } = useQuery({
    queryKey: ["public-skills"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "knowledgeSkill" && published == true] | order(_updatedAt desc) {
          _id, title, "slug": slug.current, description, tags, project, _updatedAt
        }`
      ),
    refetchInterval: 60000,
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["public-posts"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "newsPost" && published == true] | order(publishedAt desc)[0...10] {
          _id, title, excerpt, category, publishedAt, authorName, entities[] { name, domain }, continues
        }`
      ),
    refetchInterval: 60000,
  });

  const { data: tweets = [] } = useQuery({
    queryKey: ["public-tweets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tweets")
        .select("id, content, author_name, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: cliEvents = [], refetch: refetchEvents } = useQuery({
    queryKey: ["audit-events"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audit_events")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Fetch audit events for 14-day heatmap
  const { data: heatmapEvents = [] } = useQuery({
    queryKey: ["heatmap-events-14d"],
    queryFn: async () => {
      const since = subDays(new Date(), HEATMAP_DAYS).toISOString();
      const { data, error } = await (supabase as any)
        .from("audit_events")
        .select("timestamp, actor_email")
        .gte("timestamp", since)
        .order("timestamp", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("audit-events-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_events" },
        () => refetchEvents()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetchEvents]);

  // Reactions
  const queryClient = useQueryClient();
  const { data: reactions = [] } = useQuery({
    queryKey: ["tweet-reactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tweet_reactions")
        .select("tweet_id, emoji");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("tweet-reactions-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tweet_reactions" },
        () => queryClient.invalidateQueries({ queryKey: ["tweet-reactions"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const reactionCounts = reactions.reduce<Record<string, Record<string, number>>>((acc, r: any) => {
    if (!acc[r.tweet_id]) acc[r.tweet_id] = {};
    acc[r.tweet_id][r.emoji] = (acc[r.tweet_id][r.emoji] || 0) + 1;
    return acc;
  }, {});

  const [reactingId, setReactingId] = useState<string | null>(null);
  const handleReact = useCallback(async (tweetId: string, emoji: string) => {
    setReactingId(`${tweetId}-${emoji}`);
    await supabase.from("tweet_reactions").insert({ tweet_id: tweetId, emoji });
    setTimeout(() => setReactingId(null), 300);
  }, []);

  const downloadCounts = (cliEvents as any[]).reduce<Record<string, number>>((acc, ev: any) => {
    if (ev.entity_type === "skill" && ev.action === "downloaded" && ev.entity_id) {
      acc[ev.entity_id] = (acc[ev.entity_id] || 0) + 1;
    }
    return acc;
  }, {});

  const totalDownloads = Object.values(downloadCounts).reduce((a: number, b: number) => a + b, 0);
  const todayEvents = cliEvents.filter((ev: any) => {
    const d = new Date(ev.timestamp || ev.created_at);
    return d.toDateString() === now.toDateString();
  });

  // 14-day heatmap: per-user rows, Mon-Sun columns for 2 weeks
  const heatmapGrid = useMemo(() => {
    const today = startOfDay(new Date());
    // Find the Monday 2 weeks ago
    const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
    const gridStart = subDays(thisMonday, 7); // Monday of previous week

    // Group by user
    const userDays: Record<string, Record<string, number>> = {};
    (heatmapEvents as any[]).forEach((ev: any) => {
      const user = ev.actor_email?.split("@")[0] || "system";
      const day = format(new Date(ev.timestamp), "yyyy-MM-dd");
      if (!userDays[user]) userDays[user] = {};
      userDays[user][day] = (userDays[user][day] || 0) + 1;
    });

    // Build 14 day keys
    const dayKeys: string[] = [];
    for (let i = 0; i < 14; i++) {
      dayKeys.push(format(addDays(gridStart, i), "yyyy-MM-dd"));
    }

    const users = Object.keys(userDays).sort();
    const maxCount = Math.max(1, ...Object.values(userDays).flatMap(d => Object.values(d)));

    return { users, dayKeys, userDays, maxCount, gridStart };
  }, [heatmapEvents]);

  const getHeatColor = (count: number, max: number) => {
    if (count === 0) return "bg-foreground/5";
    const r = count / max;
    if (r < 0.25) return "bg-foreground/15";
    if (r < 0.5) return "bg-foreground/25";
    if (r < 0.75) return "bg-foreground/40";
    return "bg-foreground/60";
  };

  const stats = [
    { label: "Skills", value: skills.length },
    { label: "DL", value: totalDownloads },
    { label: "Active", value: todayEvents.length },
    { label: "Hours", value: "—" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* Top bar: Clock | Stats x4 | Brand */}
      <div className="flex-shrink-0 grid grid-cols-[minmax(140px,1fr)_repeat(4,minmax(70px,1fr))_minmax(110px,1fr)] gap-px border-b border-border bg-border">
        {/* Clock cell */}
        <div className="bg-background px-3 py-2 flex flex-col justify-center">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-mono font-bold text-foreground tabular-nums leading-none">
              {format(now, "HH:mm")}
            </span>
            <span className="text-sm font-mono text-foreground/30 tabular-nums">
              {format(now, "ss")}
            </span>
            <span className="text-[9px] font-mono text-foreground/20 tabular-nums">
              {String(now.getMilliseconds()).padStart(3, "0").slice(0, 2)}
            </span>
          </div>
          <span className="text-[10px] font-mono text-foreground/25 mt-0.5">
            {format(now, "EEE dd")}
          </span>
          <span className="w-full text-[7px] font-mono text-foreground/20 tracking-[0.2em] uppercase animate-clock-shimmer bg-clip-text mt-0.5" style={{ backgroundSize: '200% 100%' }}>
            every second counts
          </span>
        </div>

        {/* Stats cells */}
        {stats.map((stat) => (
          <div key={stat.label} className="bg-background px-3 py-2 flex flex-col justify-center items-center">
            <div className="text-xl font-mono font-bold text-foreground leading-none tabular-nums">
              {stat.value}
            </div>
            <div className="text-[8px] font-mono uppercase tracking-[1.17px] text-foreground/40 mt-0.5">
              {stat.label}
            </div>
          </div>
        ))}

        {/* Brand cell */}
        <div className="bg-background px-3 py-2 flex flex-col justify-center items-end">
          <span className="text-xs font-mono font-bold text-foreground tracking-wider flex items-center gap-1">
            ASTAR <span className="text-foreground/40">✦</span>
          </span>
          <span className="text-[9px] font-mono text-foreground/20 mt-0.5">
            v{ASTAR_VERSION}
          </span>
        </div>
      </div>

      {/* Main grid: left (heatmap+skills+shipped) | middle (thinking) | right (news) */}
      <div className="flex-1 grid grid-cols-[1fr_1fr_1fr] gap-px bg-border overflow-hidden min-h-0">

        {/* Left column */}
        <div className="bg-background flex flex-col overflow-hidden">
          {/* 14-day heatmap */}
          <div className="flex-shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-start gap-2">
              {/* Day labels */}
              <div className="flex flex-col gap-[3px] mr-1 pt-[18px]">
                {DAY_LABELS.map(d => (
                  <div key={d} className="h-[14px] text-[9px] font-mono text-foreground/25 leading-[14px]">{d}</div>
                ))}
              </div>
              {/* Grid: 2 weeks as columns, 7 days as rows */}
              <div className="flex-1">
                <div className="flex gap-[4px] mb-1.5">
                  <span className="text-[8px] font-mono text-foreground/15 flex-1 text-center">forrige uke</span>
                  <span className="text-[8px] font-mono text-foreground/15 flex-1 text-center">denne uke</span>
                </div>
                {heatmapGrid.users.length === 0 ? (
                  <div className="grid grid-cols-[repeat(14,1fr)] gap-[3px]">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-[2px] bg-foreground/5" />
                    ))}
                  </div>
                ) : (
                  heatmapGrid.users.map(user => (
                    <div key={user} className="flex items-center gap-1.5 mb-[3px]">
                      <div className="grid grid-cols-[repeat(14,1fr)] gap-[3px] flex-1">
                        {heatmapGrid.dayKeys.map(dayKey => {
                          const count = heatmapGrid.userDays[user]?.[dayKey] || 0;
                          return (
                            <div
                              key={dayKey}
                              className={`aspect-square rounded-[2px] ${getHeatColor(count, heatmapGrid.maxCount)}`}
                              title={`${user} · ${dayKey}: ${count}`}
                            />
                          );
                        })}
                      </div>
                      <span className="text-[8px] font-mono text-foreground/20 w-8 shrink-0 text-right">{user.slice(0, 5)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <p className="text-[8px] font-mono text-foreground/15 text-center mt-1.5 tracking-wider uppercase">
              Hours · siste 14d
            </p>
          </div>

          {/* Skills */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-foreground/40" />
                <span className="text-[10px] font-mono uppercase tracking-[1.17px] text-foreground/40">Skills</span>
              </div>
              <span className="text-[10px] font-mono text-foreground/20">{skills.length}</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {skills.map((skill: any, i: number) => {
                  const slug = skill.slug || skill.title?.toLowerCase().replace(/\s+/g, "-");
                  const count = downloadCounts[slug] || 0;
                  return (
                    <div key={skill._id} className="px-4 py-2 flex items-center gap-2">
                      <span className="text-[10px] font-mono text-foreground/15 w-5 shrink-0">{i + 1}</span>
                      <span className="font-mono text-sm text-foreground truncate flex-1">{skill.title}</span>
                      {count > 0 && (
                        <span className="text-[10px] font-mono text-foreground/25 flex items-center gap-0.5">
                          <Download className="h-3 w-3" />{count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Shipped Calendar — compact */}
          <div className="flex-shrink-0 border-t border-border">
            <ShippedCalendar />
          </div>
        </div>

        {/* Middle column: Thinking — full height */}
        <div className="bg-background flex flex-col overflow-hidden">
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
            <MessageCircle className="h-3.5 w-3.5 text-foreground/40" />
            <span className="text-[10px] font-mono uppercase tracking-[1.17px] text-foreground/40">Thinking</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {tweets.length === 0 ? (
                <p className="px-4 py-6 text-sm font-mono text-foreground/20 text-center">—</p>
              ) : (
                tweets.slice(0, 20).map((tweet) => {
                  const counts = reactionCounts[tweet.id] || {};
                  return (
                    <div key={tweet.id} className="px-4 py-3">
                      <p className="text-sm text-foreground/90 leading-relaxed font-mono">{tweet.content}</p>
                      <span className="text-[10px] font-mono text-foreground/25 mt-1.5 block">
                        {tweet.author_name && `${tweet.author_name} · `}
                        {format(new Date(tweet.created_at), "MMM d · HH:mm")}
                      </span>
                      {Object.keys(counts).length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {Object.entries(counts).map(([emoji, count]) => (
                            <span key={emoji} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-mono border border-foreground/10 bg-foreground/5 text-foreground/70">
                              {emoji} {count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right column: News — full height, auto-scroll */}
        <NewsAutoScroll posts={posts} onSelect={setSelectedNewsId} />
      </div>

      {/* News detail dialog */}
      <Dialog open={!!selectedNewsId} onOpenChange={(open) => !open && setSelectedNewsId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {newsDetail && (
            <>
              {newsDetail.entities?.length > 0 && (
                <div className="flex items-center gap-3 -mt-1 mb-3">
                  {newsDetail.entities.map((ent: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <img
                        src={`https://logo.clearbit.com/${ent.domain}`}
                        alt=""
                        className="h-6 w-6 rounded-sm"
                        onError={(e: any) => { e.currentTarget.style.display = "none"; }}
                      />
                      <span className="text-xs font-mono text-foreground/40">{ent.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {newsDetail.coverImage && !newsDetail.entities?.length && (
                <img src={newsDetail.coverImage} alt="" className="w-full h-48 object-cover rounded-md -mt-2 mb-4" />
              )}
              <DialogHeader>
                <DialogTitle className="font-mono text-xl leading-snug">{newsDetail.title}</DialogTitle>
                <div className="flex items-center gap-2 text-xs font-mono text-foreground/40 mt-1">
                  <span>{newsDetail.authorName}</span>
                  <span>·</span>
                  <span>{newsDetail.publishedAt && format(new Date(newsDetail.publishedAt), "MMM d, yyyy")}</span>
                  <span>·</span>
                  <span className="text-foreground/40 uppercase tracking-wider">{newsDetail.category}</span>
                </div>
                {newsDetail.continues && newsDetail.continuesTitle && (
                  <p className="text-xs font-mono text-foreground/40/60 mt-1">
                    Continues: {newsDetail.continuesTitle}
                  </p>
                )}
              </DialogHeader>

              {newsDetail.excerpt && (
                <div className="bg-secondary/50 border border-border rounded-md p-4 mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-foreground/40 mb-1">Summary</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{newsDetail.excerpt}</p>
                </div>
              )}

              {newsDetail.sources?.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-foreground/40 mb-3">Source Perspectives</p>
                  <div className="space-y-3">
                    {newsDetail.sources.map((src: any, i: number) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="shrink-0 mt-0.5">
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${regionColors[src.region] || regionColors.Intl}`}>
                            {src.region || "Intl"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-sm font-mono font-medium text-foreground hover:text-foreground/40 transition-colors inline-flex items-center gap-1">
                            {src.name}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {src.perspective && (
                            <p className="text-xs text-foreground/40 mt-0.5 leading-snug">{src.perspective}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {newsDetail.consensus?.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-foreground/40 mb-2">Where Sources Agree</p>
                  <ul className="space-y-1">
                    {newsDetail.consensus.map((point: string, i: number) => (
                      <li key={i} className="text-sm text-foreground/80 flex gap-2">
                        <span className="text-foreground/40 shrink-0">•</span>{point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {newsDetail.divergence?.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-foreground/40 mb-2">Where Sources Diverge</p>
                  <ul className="space-y-1">
                    {newsDetail.divergence.map((point: string, i: number) => (
                      <li key={i} className="text-sm text-foreground/80 flex gap-2">
                        <span className="text-foreground/30 shrink-0">•</span>{point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {newsDetail.takeaway && (
                <div className="mt-4 bg-foreground/5 border border-foreground/10 rounded-md p-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-foreground/40 mb-1">Astar Takeaway</p>
                  <p className="text-sm text-foreground leading-relaxed">{newsDetail.takeaway}</p>
                </div>
              )}

              {newsDetail.content && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-foreground/40 mb-2">Full Article</p>
                  <div className="prose prose-sm prose-invert max-w-none text-foreground/80">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{newsDetail.content}</ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicDashboard;
