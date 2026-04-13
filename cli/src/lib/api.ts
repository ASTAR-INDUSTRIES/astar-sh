import { getConfig } from "./config";

export interface SkillSummary {
  _id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  downloadCount?: number;
  _updatedAt?: string;
}

export interface SkillReference {
  filename: string;
  content: string;
  folder?: string;
}

export interface SkillFull extends SkillSummary {
  skillMd: string;
  referenceFiles: SkillReference[] | null;
  author?: string;
}

export interface NewsSource {
  name: string;
  region: string;
  url: string;
  perspective?: string;
}

export interface NewsEntity {
  name: string;
  domain: string;
}

export interface NewsSummary {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  coverImage?: string;
  sources?: NewsSource[];
  entities?: NewsEntity[];
  continues?: string;
  authorName: string;
  publishedAt: string;
  _updatedAt?: string;
}

export interface NewsFull extends NewsSummary {
  content: string;
  consensus?: string[];
  divergence?: string[];
  takeaway?: string;
  continuesTitle?: string;
}

export interface EventAttendee {
  kind: "internal" | "external";
  name: string;
  org?: string;
  role?: string;
  email?: string;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  visibility: string;
  owner: string;
}

export interface Project extends ProjectSummary {
  description?: string | null;
  members: string[];
  created_at: string;
  updated_at: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  date?: string | null;
  date_tentative?: boolean;
  location?: string | null;
  project_id?: string | null;
  project?: ProjectSummary | null;
}

export interface Event extends EventSummary {
  goal: string;
  attendees: EventAttendee[];
  visibility: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskLink {
  id: string;
  link_type: string;
  link_ref: string;
  created_at: string;
}

export interface Task {
  id: string;
  task_number: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  created_by: string;
  assigned_to?: string;
  completed_by?: string;
  due_date?: string;
  completed_at?: string;
  source: string;
  tags: string[];
  event_id?: string;
  event?: EventSummary | null;
  project_id?: string | null;
  project?: ProjectSummary | null;
  parent_task_id?: string;
  confidence?: number;
  requires_triage?: boolean;
  recurring?: { interval: string };
  estimated_hours?: number;
  created_at: string;
  updated_at: string;
  subtasks?: Task[];
}

export interface VelocityStats {
  period: string;
  completed: number;
  created: number;
  avg_days_to_close: number;
  backlog: number;
  overdue: number;
}

export interface TaskSuggestion {
  task: Task;
  score: number;
  reasons: string[];
}

export interface EtfFund {
  id: string;
  ticker: string;
  name: string;
  description?: string;
  strategy?: string;
  inception_date: string;
  base_nav: number;
  status: string;
  created_by: string;
  latest_nav?: number;
  daily_return?: number;
  cumulative_return?: number;
  holdings_count?: number;
  last_updated?: string;
}

export interface EtfHolding {
  symbol: string;
  name: string;
  domain?: string;
  sector?: string;
  weight: number;
  latest_price?: number;
  daily_change_pct?: number;
}

export interface EtfPerformancePoint {
  date: string;
  nav: number;
  daily_return: number;
  cumulative_return: number;
}

export interface Agent {
  id: string;
  slug: string;
  name: string;
  email?: string;
  role?: string;
  owner: string;
  skill_slug?: string;
  scopes: string[];
  status: string;
  machine?: string;
  project_id?: string | null;
  project?: ProjectSummary | null;
  config?: any;
  last_seen?: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor_email?: string;
  actor_name?: string;
  actor_type: string;
  actor_agent_id?: string;
  entity_type: string;
  entity_id?: string;
  action: string;
  project_id?: string | null;
  project?: ProjectSummary | null;
  state_before?: any;
  state_after?: any;
  channel?: string;
  context?: any;
}

export interface TaskActivity {
  id: string;
  actor: string;
  actor_type: string;
  action: string;
  details: Record<string, any>;
  created_at: string;
}

export interface Inquiry {
  id: string;
  type: string;
  content: string;
  author_email: string;
  author_name: string;
  status: string;
  response?: string;
  processed_by?: string;
  created_at: string;
  processed_at?: string;
}

export interface InboxMessage {
  id: string;
  agent_slug: string;
  type: string;
  content: string;
  author_email: string;
  author_name: string;
  status: string;
  response?: string;
  processed_by?: string;
  created_at: string;
  processed_at?: string;
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  category: string;
  created_by: string;
  project_id?: string | null;
  project?: ProjectSummary | null;
  created_at: string;
}

export interface FeedbackItem {
  id: string;
  content: string;
  type: string;
  source: string;
  author_email: string;
  author_name: string;
  linked_skill?: string;
  linked_news?: string;
  status: string;
  created_at: string;
}

export interface OvertimeRun {
  id: string;
  slug: string;
  spec_title: string;
  type: string;
  parent_task_number?: number | null;
  started_at: string;
  completed_at?: string | null;
  status: string;
  total_cycles_u: number;
  total_cycles_e: number;
  total_rejections: number;
  total_cost_usd?: number | null;
  model?: string | null;
  worktree_path?: string | null;
  branch_name?: string | null;
  git_commits: string[];
}

export interface OvertimeCycle {
  id: string;
  run_id: string;
  agent: "u" | "e";
  cycle_number: number;
  started_at: string;
  completed_at?: string | null;
  exit_code?: number | null;
  subtask_number?: number | null;
  action_taken?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  model?: string | null;
  tool_calls_count?: number | null;
  turns_used?: number | null;
  max_turns?: number | null;
}

export interface OvertimeRunComparison extends OvertimeRun {
  subtask_count: number;
  cost_per_subtask: number | null;
}

export interface OvertimeDashboard {
  summary: {
    total_runs: number;
    total_cost_usd: number;
    total_tokens_in: number;
    total_tokens_out: number;
    total_cycles: number;
    total_rejections: number;
    total_subtasks_delivered: number;
    avg_cost_per_run: number;
    avg_cost_per_subtask: number;
    avg_cycles_per_run: number;
    avg_rejection_rate: number;
  };
  daily: Array<{
    date: string;
    cost_usd: number;
    runs: number;
    cycles: number;
    subtasks_delivered: number;
  }>;
}

export class AstarAPI {
  constructor(private token?: string) {}

  private async fetch<T>(path: string, opts?: { method?: string; body?: string }): Promise<T> {
    const config = await getConfig();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(`${config.apiUrl}${path}`, { method: opts?.method || "GET", headers, body: opts?.body });
    } catch (e: any) {
      const err = new Error(`Network error: ${e.message || "could not reach API"}`);
      (err as any).code = "NETWORK_ERROR";
      throw err;
    }

    if (!res.ok) {
      if (res.status === 404) throw new Error("This feature isn't available yet. The API may need to be redeployed.");
      if (res.status === 401) {
        const err = new Error("Session expired. Run 'astar login' to sign in again.");
        (err as any).code = "AUTH_EXPIRED";
        throw err;
      }
      throw new Error(`API error ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  async listSkills(query?: string): Promise<SkillSummary[]> {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    const qs = params.toString();
    const data = await this.fetch<{ skills: SkillSummary[] }>(`/skills${qs ? `?${qs}` : ""}`);
    return data.skills;
  }

  async getSkill(slug: string): Promise<SkillFull> {
    const data = await this.fetch<{ skill: SkillFull }>(`/skills/${slug}`);
    return data.skill;
  }

  async pushSkill(skill: {
    title: string;
    slug: string;
    description?: string;
    tags?: string[];
    content: string;
    references?: SkillReference[];
    published?: boolean;
  }): Promise<{ ok: boolean; slug: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/skills`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(skill),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.json();
  }

  async listNews(category?: string): Promise<NewsSummary[]> {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const qs = params.toString();
    const data = await this.fetch<{ news: NewsSummary[] }>(`/news${qs ? `?${qs}` : ""}`);
    return data.news;
  }

  async getNews(slug: string): Promise<NewsFull> {
    const data = await this.fetch<{ article: NewsFull }>(`/news/${slug}`);
    return data.article;
  }

  async listFeedback(status?: string): Promise<FeedbackItem[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    const data = await this.fetch<{ feedback: FeedbackItem[] }>(`/feedback${qs ? `?${qs}` : ""}`);
    return data.feedback;
  }

  async submitFeedback(fb: {
    content: string;
    type?: string;
    linked_skill?: string;
    linked_news?: string;
    context?: Record<string, any>;
  }): Promise<void> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/feedback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fb),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  }

  async updateFeedback(id: string, status: string, resolution?: string): Promise<void> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/feedback/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  async listMilestones(filters?: { month?: string; project?: string } | string): Promise<Milestone[]> {
    const params = new URLSearchParams();
    const month = typeof filters === "string" ? filters : filters?.month;
    const project = typeof filters === "string" ? undefined : filters?.project;
    if (month) params.set("month", month);
    if (project) params.set("project", project);
    const qs = params.toString();
    const data = await this.fetch<{ milestones: Milestone[] }>(`/milestones${qs ? `?${qs}` : ""}`);
    return data.milestones;
  }

  async listProjects(filters?: { search?: string }): Promise<Project[]> {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);
    const qs = params.toString();
    const data = await this.fetch<{ projects: Project[] }>(`/projects${qs ? `?${qs}` : ""}`);
    return data.projects;
  }

  async getProject(slug: string): Promise<{ project: Project; tasks: Task[]; events: Event[]; agents: Agent[]; milestones: Milestone[] }> {
    return this.fetch(`/projects/${slug}`);
  }

  async createProject(project: {
    name: string;
    slug?: string;
    description?: string;
    visibility?: string;
    owner?: string;
    members?: string[];
  }): Promise<{ ok: boolean; slug: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/projects`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(project),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async updateProject(slug: string, updates: Record<string, any>): Promise<{ ok: boolean; slug: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/projects/${slug}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async deleteProject(slug: string): Promise<void> {
    return this.fetch(`/projects/${slug}`, { method: "DELETE" });
  }

  async listEvents(filters?: { status?: string; type?: string; month?: string; search?: string; project?: string; limit?: number }): Promise<Event[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.type) params.set("type", filters.type);
    if (filters?.month) params.set("month", filters.month);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.project) params.set("project", filters.project);
    if (filters?.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();
    const data = await this.fetch<{ events: Event[] }>(`/events${qs ? `?${qs}` : ""}`);
    return data.events;
  }

  async getEvent(slug: string): Promise<{ event: Event; tasks: Task[] }> {
    return this.fetch(`/events/${slug}`);
  }

  async createEvent(event: {
    title: string;
    goal: string;
    slug?: string;
    type?: string;
    status?: string;
    date?: string;
    date_tentative?: boolean;
    location?: string;
    attendees?: EventAttendee[];
    visibility?: string;
    project?: string;
  }): Promise<{ ok: boolean; slug: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async updateEvent(slug: string, updates: Record<string, any>): Promise<{ ok: boolean; slug: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/events/${slug}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async createMilestone(m: { title: string; category?: string; date?: string; project?: string }): Promise<void> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/milestones`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(m),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  }

  async submitInquiry(content: string, type: string = "question"): Promise<{ ok: boolean; id: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/inquiries`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content, type }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async listOwnInquiries(status?: string): Promise<Inquiry[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    const data = await this.fetch<{ inquiries: Inquiry[] }>(`/inquiries${qs ? `?${qs}` : ""}`);
    return data.inquiries;
  }

  async getInquiry(id: string): Promise<Inquiry> {
    const data = await this.fetch<{ inquiry: Inquiry }>(`/inquiries/${id}`);
    return data.inquiry;
  }

  async askAgent(slug: string, content: string, type?: string): Promise<{ ok: boolean; id: string; type: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/ask/${slug}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content, type }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async listAgentMessages(slug: string, status?: string): Promise<InboxMessage[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    const data = await this.fetch<{ messages: InboxMessage[] }>(`/ask/${slug}${qs ? `?${qs}` : ""}`);
    return data.messages;
  }

  async getAgentMessage(slug: string, id: string): Promise<InboxMessage> {
    const data = await this.fetch<{ message: InboxMessage }>(`/ask/${slug}/${id}`);
    return data.message;
  }

  async checkAgentHealth(slug: string): Promise<{ pending_count: number; oldest_pending_age_seconds: number; last_completed_at: string | null }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/ask/${slug}/health`);
    if (!res.ok) return { pending_count: 0, oldest_pending_age_seconds: 0, last_completed_at: null };
    return res.json();
  }

  async listTasks(filters?: { status?: string; priority?: string; assigned_to?: string; due?: string; search?: string; event?: string; project?: string; include_subtasks?: boolean }): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.priority) params.set("priority", filters.priority);
    if (filters?.assigned_to) params.set("assigned_to", filters.assigned_to);
    if (filters?.due) params.set("due", filters.due);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.event) params.set("event", filters.event);
    if (filters?.project) params.set("project", filters.project);
    if (filters?.include_subtasks) params.set("include_subtasks", "true");
    const qs = params.toString();
    const data = await this.fetch<{ tasks: Task[] }>(`/tasks${qs ? `?${qs}` : ""}`);
    return data.tasks;
  }

  async createTask(task: {
    title: string;
    description?: string;
    priority?: string;
    assigned_to?: string;
    due_date?: string;
    tags?: string[];
    parent_task_number?: number;
    estimated_hours?: number;
    recurring?: { interval: string };
    links?: { type: string; ref: string }[];
    event?: string;
    project?: string;
  }): Promise<{ ok: boolean; task_number: number }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async getTask(num: number): Promise<{ task: Task; activity: TaskActivity[]; subtasks: Task[]; links: TaskLink[] }> {
    return this.fetch(`/tasks/${num}`);
  }

  async updateTask(num: number, updates: Record<string, any>): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks/${num}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async cancelTask(num: number): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks/${num}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async triageTasks(): Promise<Task[]> {
    const data = await this.fetch<{ tasks: Task[] }>("/tasks?triage=true&assigned_to=all");
    return data.tasks;
  }

  async triageAction(num: number, action: "accept" | "dismiss", reason?: string): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks/${num}/triage`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async getVelocity(period?: string, assigned_to?: string): Promise<VelocityStats> {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (assigned_to) params.set("assigned_to", assigned_to);
    const qs = params.toString();
    return this.fetch(`/tasks/velocity${qs ? `?${qs}` : ""}`);
  }

  async suggestNextTask(): Promise<TaskSuggestion[]> {
    const data = await this.fetch<{ suggestions: TaskSuggestion[] }>("/tasks/suggest");
    return data.suggestions;
  }

  async getStatus(): Promise<any> {
    return this.fetch("/status");
  }

  async queryAudit(filters?: { entity_type?: string; entity_id?: string; project?: string; actor?: string; actor_agent_id?: string; channel?: string; action?: string; since?: string; limit?: number }): Promise<AuditEvent[]> {
    const params = new URLSearchParams();
    if (filters?.entity_type) params.set("entity_type", filters.entity_type);
    if (filters?.entity_id) params.set("entity_id", filters.entity_id);
    if (filters?.project) params.set("project", filters.project);
    if (filters?.actor) params.set("actor", filters.actor);
    if (filters?.actor_agent_id) params.set("actor_agent_id", filters.actor_agent_id);
    if (filters?.channel) params.set("channel", filters.channel);
    if (filters?.action) params.set("action", filters.action);
    if (filters?.since) params.set("since", filters.since);
    if (filters?.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();
    const data = await this.fetch<{ events: AuditEvent[] }>(`/audit${qs ? `?${qs}` : ""}`);
    return data.events;
  }

  async listAgents(filters?: { status?: string; project?: string }): Promise<Agent[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.project) params.set("project", filters.project);
    const qs = params.toString();
    const data = await this.fetch<{ agents: Agent[] }>(`/agents${qs ? `?${qs}` : ""}`);
    return data.agents;
  }

  async getAgent(slug: string): Promise<{ agent: Agent; activity: AuditEvent[] }> {
    return this.fetch(`/agents/${slug}`);
  }

  async registerAgent(agent: { slug: string; name: string; owner?: string; email?: string; skill_slug?: string; scopes?: string[]; machine?: string; project?: string }): Promise<{ ok: boolean; slug: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/agents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(agent),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async updateAgent(slug: string, updates: Record<string, any>): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/agents/${slug}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async linkTask(num: number, linkType: string, linkRef: string): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks/${num}/links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ link_type: linkType, link_ref: linkRef }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async listEtf(): Promise<EtfFund[]> {
    const data = await this.fetch<{ funds: EtfFund[] }>("/etf");
    return data.funds;
  }

  async getEtf(ticker: string): Promise<{ fund: EtfFund; holdings: EtfHolding[]; performance: any }> {
    return this.fetch(`/etf/${ticker.toUpperCase()}`);
  }

  async getEtfPerformance(ticker: string, range?: string): Promise<EtfPerformancePoint[]> {
    const qs = range ? `?range=${range}` : "";
    const data = await this.fetch<{ data: EtfPerformancePoint[] }>(`/etf/${ticker.toUpperCase()}/performance${qs}`);
    return data.data;
  }

  async getEtfPerformanceFull(ticker: string, range?: string): Promise<{ data: EtfPerformancePoint[]; benchmark: { date: string; cumulative_return: number }[] }> {
    const qs = range ? `?range=${range}` : "";
    return this.fetch(`/etf/${ticker.toUpperCase()}/performance${qs}`);
  }

  async getEtfNews(ticker: string): Promise<any[]> {
    const data = await this.fetch<{ news: any[] }>(`/etf/${ticker.toUpperCase()}/news`);
    return data.news;
  }

  async createEtf(fund: { ticker: string; name: string; description?: string; strategy?: string; holdings: { symbol: string; name: string; domain?: string; sector?: string; weight: number }[] }): Promise<{ ok: boolean; ticker: string }> {
    return this.fetch("/etf", { method: "POST", body: JSON.stringify(fund) });
  }

  async rebalanceEtf(ticker: string, holdings: { symbol: string; name?: string; domain?: string; sector?: string; weight: number }[]): Promise<{ ok: boolean }> {
    return this.fetch(`/etf/${ticker.toUpperCase()}/rebalance`, { method: "POST", body: JSON.stringify({ holdings }) });
  }

  async refreshEtfPrices(ticker?: string): Promise<{ ok: boolean; prices_fetched: number; navs_calculated: number }> {
    const qs = ticker ? `?ticker=${ticker.toUpperCase()}` : "";
    return this.fetch(`/etf/refresh-prices${qs}`, { method: "POST" });
  }

  async createOvertimeRun(run: {
    slug: string;
    spec_title: string;
    type?: string;
    parent_task_number?: number | null;
    model?: string | null;
    worktree_path?: string | null;
    branch_name?: string | null;
  }): Promise<{ ok: boolean; id: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/overtime/runs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(run),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async updateOvertimeRun(id: string, updates: {
    status?: string;
    completed_at?: string | null;
    total_cycles_u?: number;
    total_cycles_e?: number;
    total_rejections?: number;
    total_cost_usd?: number | null;
    model?: string | null;
    git_commits?: string[];
  }): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/overtime/runs/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async listOvertimeRuns(): Promise<OvertimeRun[]> {
    const data = await this.fetch<{ runs: OvertimeRun[] }>("/overtime/runs");
    return data.runs;
  }

  async getOvertimeRun(id: string): Promise<OvertimeRun> {
    const data = await this.fetch<{ run: OvertimeRun }>(`/overtime/runs/${id}`);
    return data.run;
  }

  async listOvertimeCycles(runId: string): Promise<OvertimeCycle[]> {
    const data = await this.fetch<{ cycles: OvertimeCycle[] }>(`/overtime/runs/${runId}/cycles`);
    return data.cycles;
  }

  async getOvertimeDashboard(): Promise<OvertimeDashboard> {
    return this.fetch<OvertimeDashboard>("/overtime/dashboard");
  }

  async getOvertimeComparison(): Promise<OvertimeRunComparison[]> {
    const data = await this.fetch<{ runs: OvertimeRunComparison[] }>("/overtime/comparison");
    return data.runs;
  }
}
