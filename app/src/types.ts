export type Priority = "critical" | "high" | "medium" | "low";
export type TaskStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "blocked"
  | "cancelled";

export type Task = {
  id: string;
  task_number: number;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  created_by: string;
  assigned_to: string;
  due_date?: string | null;
  completed_at?: string | null;
  tags?: string[] | null;
  parent_task_id?: string | null;
  source?: string;
};

export type ActorType = "human" | "agent" | "system";

export type TaskActivity = {
  id: string;
  actor_email?: string;
  actor_name?: string;
  actor_type: ActorType;
  action: string;
  timestamp: string;
  state_before?: Record<string, unknown> | null;
  state_after?: Record<string, unknown> | null;
  channel?: string | null;
};

export type TaskDetail = {
  task: Task;
  activity: TaskActivity[];
  subtasks: Task[];
  links: unknown[];
};

export type AuthCache = {
  token: string;
  expires_at: number;
  account_email: string;
  account_name: string;
};

export type Mode = "list" | "card" | "composer" | "closing" | "palette";
export type CloseOutcome = "done" | "wont";
