import { fetch } from "@tauri-apps/plugin-http";
import type { Task, TaskDetail } from "./types";

const BASE = "https://owerciqeeelwrqseajqq.supabase.co/functions/v1/skills-api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listOpen: (token: string) =>
    request<{ tasks: Task[] }>(token, "/tasks?status=open").then(
      (r) => r.tasks,
    ),

  listClosed: (token: string) =>
    Promise.all([
      request<{ tasks: Task[] }>(token, "/tasks?status=completed").then(
        (r) => r.tasks,
      ),
      request<{ tasks: Task[] }>(token, "/tasks?status=cancelled").then(
        (r) => r.tasks,
      ),
    ]).then(([done, cancelled]) => [...done, ...cancelled]),

  getTask: (token: string, num: number) =>
    request<TaskDetail>(token, `/tasks/${num}`),

  patchTask: (token: string, num: number, patch: Record<string, unknown>) =>
    request<{ ok: true }>(token, `/tasks/${num}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  addComment: (token: string, num: number, comment: string) =>
    request<{ ok: true }>(token, `/tasks/${num}/comments`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }),

  createTask: (token: string, task: Record<string, unknown>) =>
    request<{ ok: true; task_number: number }>(token, "/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    }),
};
