import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanityClient } from "@/lib/sanity";
import { format, formatDistanceToNow } from "date-fns";
import {
  FileText, FlaskConical, MessageCircle,
  BookOpen, Activity, Download, Terminal, Zap, ExternalLink, Globe,
} from "lucide-react";

const REACTION_EMOJIS = ["🔥", "👏", "🧠", "💡", "🎯"];
import { ScrollArea } from "@/components/ui/scroll-area";
import ShippedCalendar from "@/components/ShippedCalendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const eventLabels: Record<string, string> = {
  downloaded: "downloaded",
  listed: "listed",
  pushed: "pushed",
  published: "published",
  submitted: "submitted",
  created: "created",
  completed: "completed",
  assigned: "assigned",
  processed: "processed",
};

const ASTAR_VERSION = "0.0.1";

const regionColors: Record<string, string> = {
  US: "text-blue-400 bg-blue-400/10",
  EU: "text-yellow-400 bg-yellow-400/10",
  NO: "text-red-400 bg-red-400/10",
  UK: "text-purple-400 bg-purple-400/10",
  Intl: "text-emerald-400 bg-emerald-400/10",
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
        `*[_type == "newsPost" && published == true] | order(publishedAt desc)[0...6] {
          _id, title, excerpt, category, publishedAt, authorName
        }`
      ),
    refetchInterval: 60000,
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["public-research"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "researchArticle" && published == true] | order(publishedAt desc)[0...6] {
          _id, title, abstract, authors, tags, publishedAt
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

  const stats = [
    { label: "Skills", value: skills.length, icon: BookOpen },
    { label: "Downloads", value: totalDownloads, icon: Download },
    { label: "CLI Events", value: cliEvents.length, icon: Terminal },
    { label: "Active Today", value: todayEvents.length, icon: Zap },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* Stats bar */}
      <div className="flex-shrink-0 grid grid-cols-4 gap-px border-b border-border bg-border">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-background px-8 py-5 flex items-center gap-5">
            <stat.icon className="h-5 w-5 text-accent shrink-0" />
            <div>
              <div className="text-4xl font-mono font-bold text-foreground leading-none">
                {stat.value}
              </div>
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mt-1">
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-[45fr_28fr_27fr] gap-px bg-border overflow-hidden">

        {/* LEFT: Skills + Calendar 50/50 */}
        <div className="bg-background flex flex-col overflow-hidden">
          {/* Skills - top half */}
          <div className="flex-1 flex flex-col overflow-hidden border-b border-border">
            <div className="flex-shrink-0 flex items-center justify-between px-8 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <BookOpen className="h-4 w-4 text-accent" />
                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                  Skills & Knowledge
                </span>
              </div>
              <span className="text-xs font-mono text-muted-foreground/40">
                {skills.length} published
              </span>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {skills.map((skill: any, i: number) => {
                  const slug = skill.slug || skill.title?.toLowerCase().replace(/\s+/g, "-");
                  const count = downloadCounts[slug] || 0;
                  return (
                    <div key={skill._id} className="px-8 py-3 flex items-start gap-5">
                      <span className="text-sm font-mono text-muted-foreground/30 w-6 shrink-0 pt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-3 mb-0.5">
                          <span className="font-mono text-sm font-medium text-foreground">
                            {skill.title}
                          </span>
                          {skill.project && skill.project !== "general" && (
                            <span className="text-[10px] font-mono text-accent/60 uppercase tracking-wider">
                              {skill.project}
                            </span>
                          )}
                        </div>
                        {skill.tags?.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {skill.tags.slice(0, 4).map((tag: string) => (
                              <span key={tag} className="text-[9px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-1 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {count > 0 && (
                          <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                            <Download className="h-3 w-3" />
                            {count}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {skills.length === 0 && (
                  <div className="px-8 py-8 text-center">
                    <p className="text-muted-foreground font-mono text-sm">No skills published yet.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          {/* Calendar - bottom half */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <ShippedCalendar />
          </div>
        </div>

        {/* MIDDLE: Thinking + CLI Activity */}
        <div className="bg-background flex flex-col overflow-hidden">

          {/* Thinking */}
          <div className="flex-[3] flex flex-col overflow-hidden border-b border-border">
            <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-border">
              <MessageCircle className="h-4 w-4 text-accent" />
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Thinking</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {tweets.length === 0 ? (
                  <p className="px-6 py-8 text-sm font-mono text-muted-foreground/40 text-center">—</p>
                ) : (
                  tweets.slice(0, 10).map((tweet) => {
                    const counts = reactionCounts[tweet.id] || {};
                    return (
                    <div key={tweet.id} className="px-6 py-4">
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {tweet.content}
                      </p>
                      <span className="text-[11px] font-mono text-muted-foreground/50 mt-2 block">
                        {tweet.author_name && `${tweet.author_name} · `}
                        {format(new Date(tweet.created_at), "MMM d · HH:mm")}
                      </span>
                      {Object.keys(counts).length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {Object.entries(counts).map(([emoji, count]) => (
                            <span
                              key={emoji}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border border-accent/30 bg-accent/10 text-foreground/80"
                            >
                              <span>{emoji}</span>
                              <span>{count}</span>
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

          {/* CLI Activity */}
          <div className="flex-[2] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Terminal className="h-4 w-4 text-accent" />
                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">CLI Activity</span>
              </div>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                <span className="text-[11px] font-mono text-muted-foreground/40">live</span>
              </span>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {cliEvents.length === 0 ? (
                  <p className="px-6 py-8 text-sm font-mono text-muted-foreground/40 text-center">No activity yet</p>
                ) : (
                  cliEvents.map((ev: any) => {
                    const label = eventLabels[ev.action] || ev.action;
                    const actor = ev.actor_name || ev.actor_email?.split("@")[0] || ev.actor_type || "system";
                    const entity = ev.state_after?.title || ev.entity_id || "";
                    const channelBadge = ev.channel === "mcp" ? "mcp" : ev.channel === "cli" ? "cli" : "";
                    return (
                      <div key={ev.id} className="px-6 py-3 flex items-start gap-3">
                        <Activity className="h-3.5 w-3.5 text-accent/60 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono text-foreground/80 leading-tight">
                            <span className="text-accent">{entity || actor}</span>
                            {" "}<span className="text-muted-foreground">{label}</span>
                            {entity ? <span className="text-muted-foreground/50">{" "}by {actor}</span> : null}
                            {channelBadge && (
                              <span className="ml-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/30 bg-muted/50 px-1 py-0.5 rounded">{channelBadge}</span>
                            )}
                          </p>
                          <span className="text-[11px] font-mono text-muted-foreground/40">
                            {formatDistanceToNow(new Date(ev.timestamp || ev.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* RIGHT: News + Research + Clock */}
        <div className="bg-background flex flex-col overflow-hidden">

          {/* Clock */}
          <div className="flex-shrink-0 px-6 py-5 border-b border-border flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-4xl font-mono font-bold text-foreground tabular-nums">
                {format(now, "HH:mm:ss")}
                <span className="text-2xl text-muted-foreground/70">.{String(now.getMilliseconds()).padStart(3, "0").slice(0, 2)}</span>
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/20">v{ASTAR_VERSION}</span>
              <span className="text-sm font-mono text-muted-foreground/60">
                {format(now, "EEE MMM d")}
              </span>
            </div>
            <span className="w-full text-[10px] font-mono text-muted-foreground/40 tracking-[0.3em] uppercase animate-clock-shimmer bg-clip-text" style={{ backgroundSize: '200% 100%' }}>
              every second counts
            </span>
          </div>

          {/* News */}
          <div className="flex-[1] flex flex-col overflow-hidden border-b border-border">
            <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-border">
              <FileText className="h-4 w-4 text-accent" />
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">News</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {posts.length === 0 ? (
                  <p className="px-6 py-6 text-sm font-mono text-muted-foreground/40 text-center">—</p>
                ) : (
                  posts.map((post: any) => (
                    <div key={post._id} className="px-6 py-4 cursor-pointer hover:bg-accent/5 transition-colors" onClick={() => setSelectedNewsId(post._id)}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-mono text-sm font-medium text-foreground leading-snug">
                          {post.title}
                        </span>
                        {post.publishedAt && (
                          <span className="text-[11px] font-mono text-muted-foreground/50 shrink-0 mt-0.5">
                            {format(new Date(post.publishedAt), "MMM d")}
                          </span>
                        )}
                      </div>
                      {post.excerpt && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">
                          {post.excerpt}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Research */}
          <div className="flex-[1] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 flex items-center gap-3 px-6 py-4 border-b border-border">
              <FlaskConical className="h-4 w-4 text-accent" />
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Research</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {articles.length === 0 ? (
                  <p className="px-6 py-6 text-sm font-mono text-muted-foreground/40 text-center">—</p>
                ) : (
                  articles.map((article: any) => (
                    <div key={article._id} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-mono text-sm font-medium text-foreground leading-snug">
                          {article.title}
                        </span>
                        {article.publishedAt && (
                          <span className="text-[11px] font-mono text-muted-foreground/50 shrink-0 mt-0.5">
                            {format(new Date(article.publishedAt), "MMM d")}
                          </span>
                        )}
                      </div>
                      {article.abstract && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">
                          {article.abstract}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedNewsId} onOpenChange={(open) => !open && setSelectedNewsId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {newsDetail && (
            <>
              {newsDetail.coverImage && (
                <img src={newsDetail.coverImage} alt="" className="w-full h-48 object-cover rounded-md -mt-2 mb-4" />
              )}
              <DialogHeader>
                <DialogTitle className="font-mono text-xl leading-snug">
                  {newsDetail.title}
                </DialogTitle>
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mt-1">
                  <span>{newsDetail.authorName}</span>
                  <span>·</span>
                  <span>{newsDetail.publishedAt && format(new Date(newsDetail.publishedAt), "MMM d, yyyy")}</span>
                  <span>·</span>
                  <span className="text-accent uppercase tracking-wider">{newsDetail.category}</span>
                </div>
              </DialogHeader>

              {newsDetail.excerpt && (
                <div className="bg-secondary/50 border border-border rounded-md p-4 mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{newsDetail.excerpt}</p>
                </div>
              )}

              {newsDetail.sources?.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">Source Perspectives</p>
                  <div className="space-y-3">
                    {newsDetail.sources.map((src: any, i: number) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="shrink-0 mt-0.5">
                          <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${regionColors[src.region] || regionColors.Intl}`}>
                            {src.region || "Intl"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-sm font-mono font-medium text-foreground hover:text-accent transition-colors inline-flex items-center gap-1">
                            {src.name}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {src.perspective && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{src.perspective}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {newsDetail.consensus?.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Where Sources Agree</p>
                  <ul className="space-y-1">
                    {newsDetail.consensus.map((point: string, i: number) => (
                      <li key={i} className="text-sm text-foreground/80 flex gap-2">
                        <span className="text-emerald-400 shrink-0">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {newsDetail.divergence?.length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Where Sources Diverge</p>
                  <ul className="space-y-1">
                    {newsDetail.divergence.map((point: string, i: number) => (
                      <li key={i} className="text-sm text-foreground/80 flex gap-2">
                        <span className="text-yellow-400 shrink-0">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {newsDetail.takeaway && (
                <div className="mt-4 bg-accent/5 border border-accent/20 rounded-md p-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-accent mb-1">Astar Takeaway</p>
                  <p className="text-sm text-foreground leading-relaxed">{newsDetail.takeaway}</p>
                </div>
              )}

              {newsDetail.content && (
                <div className="mt-4">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Full Article</p>
                  <div className="prose prose-sm prose-invert max-w-none text-foreground/80">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {newsDetail.content}
                    </ReactMarkdown>
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
