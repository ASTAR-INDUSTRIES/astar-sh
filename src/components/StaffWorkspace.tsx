import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Trash2, Plus, Edit, Eye, EyeOff,
  FileText, FlaskConical, MessageCircle, Send,
} from "lucide-react";
import { format } from "date-fns";

type TweetForm = {
  content: string;
};

const emptyTweet: TweetForm = { content: "" };

const StaffWorkspace = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tweetForm, setTweetForm] = useState<TweetForm>(emptyTweet);

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

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-mono font-bold text-foreground mb-1">
          Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground font-mono text-xs">
          {user?.email}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "Thoughts", value: tweets.length, icon: MessageCircle },
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
      <Tabs defaultValue="tweets" className="w-full">
        <TabsList className="bg-secondary border border-border mb-6">
          <TabsTrigger value="tweets" className="font-mono text-xs gap-1.5">
            <MessageCircle className="h-3 w-3" /> Thinking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tweets">
          {/* Compose */}
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

          {/* Timeline */}
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
