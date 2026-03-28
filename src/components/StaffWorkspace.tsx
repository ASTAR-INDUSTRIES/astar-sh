import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { sanityClient } from "@/lib/sanity";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Trash2, Plus, Edit, Eye, EyeOff,
  FileText, FlaskConical, MessageCircle, Send,
  BookOpen, Search, Tag, ChevronDown, ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type TweetForm = { content: string };
const emptyTweet: TweetForm = { content: "" };

const StaffWorkspace = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tweetForm, setTweetForm] = useState<TweetForm>(emptyTweet);
  const [skillSearch, setSkillSearch] = useState("");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  // Tweets
  const { data: tweets = [] } = useQuery({
    queryKey: ["admin-tweets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tweets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Skills
  const { data: skills = [], isLoading: skillsLoading } = useQuery({
    queryKey: ["admin-skills"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "knowledgeSkill"] | order(_updatedAt desc) {
          _id, title, "slug": slug.current, description, tags, markdownContent, references, published, author, _updatedAt
        }`
      ),
  });

  const postTweet = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tweets").insert({
        content: tweetForm.content,
        author_name: user?.user_metadata?.full_name || user?.email?.split("@")[0] || null,
        author_email: user?.email || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tweets"] });
      queryClient.invalidateQueries({ queryKey: ["public-tweets"] });
      setTweetForm(emptyTweet);
      toast.success("Thought posted");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTweet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tweets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tweets"] });
      toast.success("Thought deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredSkills = skills.filter((s: any) => {
    if (!skillSearch.trim()) return true;
    const q = skillSearch.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.tags?.some((t: string) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-mono font-bold text-foreground mb-1">
          Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground font-mono text-xs">{user?.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Thoughts", value: tweets.length, icon: MessageCircle },
          { label: "Skills", value: skills.length, icon: BookOpen },
          { label: "News (Sanity)", value: "→", icon: FileText },
          { label: "Research (Sanity)", value: "→", icon: FlaskConical },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-md p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </span>
            </div>
            <span className="text-2xl font-mono font-bold text-foreground">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Content Management */}
      <Tabs defaultValue="skills" className="w-full">
        <TabsList className="bg-secondary border border-border mb-6">
          <TabsTrigger value="skills" className="font-mono text-xs gap-1.5">
            <BookOpen className="h-3 w-3" /> Skills
          </TabsTrigger>
          <TabsTrigger value="tweets" className="font-mono text-xs gap-1.5">
            <MessageCircle className="h-3 w-3" /> Thinking
          </TabsTrigger>
        </TabsList>

        {/* Skills Tab */}
        <TabsContent value="skills">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              className="pl-9 font-mono text-sm bg-secondary border-border"
            />
          </div>

          {skillsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-card border border-border rounded-md p-5 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : filteredSkills.length === 0 ? (
            <p className="text-muted-foreground font-mono text-xs text-center py-8">
              {skillSearch ? "No skills match your search." : "No skills yet. Create one via Claude Desktop MCP."}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredSkills.map((skill: any) => (
                <div key={skill._id} className="bg-card border border-border rounded-md overflow-hidden">
                  <button
                    onClick={() => setExpandedSkill(expandedSkill === skill._id ? null : skill._id)}
                    className="w-full text-left px-4 py-3 hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-mono text-sm font-medium text-foreground">
                            {skill.title}
                          </h3>
                          {skill.published ? (
                            <Eye className="h-3 w-3 text-accent" />
                          ) : (
                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{skill.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {skill.tags?.slice(0, 4).map((tag: string) => (
                            <span
                              key={tag}
                              className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                          {skill.author && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              by {skill.author}
                            </span>
                          )}
                          {skill._updatedAt && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {format(new Date(skill._updatedAt), "MMM d")}
                            </span>
                          )}
                        </div>
                      </div>
                      {expandedSkill === skill._id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  </button>

                  {expandedSkill === skill._id && (
                    <div className="border-t border-border px-4 py-3">
                      {skill.markdownContent && (
                        <div className="prose prose-sm dark:prose-invert max-w-none font-sans">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {skill.markdownContent}
                          </ReactMarkdown>
                        </div>
                      )}
                      {skill.references?.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-border">
                          <h4 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                            Reference Files ({skill.references.length})
                          </h4>
                          <div className="space-y-1.5">
                            {skill.references.map((ref: any, i: number) => (
                              <details key={ref._key || i} className="group">
                                <summary className="cursor-pointer text-xs font-mono text-accent hover:underline flex items-center gap-1.5">
                                  <FileText className="h-3 w-3" />
                                  {ref.folder ? `${ref.folder}/` : ""}{ref.filename}
                                </summary>
                                <div className="mt-2 ml-4 prose prose-xs dark:prose-invert max-w-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {ref.content || ""}
                                  </ReactMarkdown>
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 bg-secondary/50 border border-border border-dashed rounded-md p-4">
            <p className="text-xs font-mono text-muted-foreground">
              <strong className="text-foreground">Skills</strong> can be created and managed via{" "}
              <strong className="text-accent">Claude Desktop MCP</strong> or{" "}
              <a
                href="https://fkqm34od.sanity.studio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Sanity Studio
              </a>
              . Use tools like <code className="text-accent">create_skill</code>,{" "}
              <code className="text-accent">update_skill</code>, and{" "}
              <code className="text-accent">upload_skill_file</code>.
            </p>
          </div>
        </TabsContent>

        {/* Tweets Tab */}
        <TabsContent value="tweets">
          <div className="bg-card border border-border rounded-md p-4 mb-6">
            <Textarea
              placeholder="Share a thought..."
              value={tweetForm.content}
              onChange={(e) => setTweetForm({ content: e.target.value })}
              className="font-sans text-sm bg-secondary border-border min-h-[80px] mb-3"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                className="font-mono text-xs gap-1.5"
                onClick={() => postTweet.mutate()}
                disabled={!tweetForm.content.trim()}
              >
                <Send className="h-3 w-3" /> Post
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {tweets.map((tweet) => (
              <div
                key={tweet.id}
                className="flex items-start justify-between bg-card border border-border rounded-md px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground font-sans leading-relaxed">
                    {tweet.content}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    {tweet.author_name && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {tweet.author_name}
                      </span>
                    )}
                    <span className="text-xs font-mono text-muted-foreground">
                      {format(new Date(tweet.created_at), "MMM d · HH:mm")}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive shrink-0"
                  onClick={() => deleteTweet.mutate(tweet.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {tweets.length === 0 && (
              <p className="text-muted-foreground font-mono text-xs text-center py-8">
                No thoughts yet. Share what's on the team's mind.
              </p>
            )}
          </div>

          <div className="mt-8 bg-secondary/50 border border-border border-dashed rounded-md p-4">
            <p className="text-xs font-mono text-muted-foreground">
              <strong className="text-foreground">News & Research</strong> are managed in{" "}
              <a
                href="https://fkqm34od.sanity.studio"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Sanity Studio
              </a>
              . Tweets are posted directly from here.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StaffWorkspace;
