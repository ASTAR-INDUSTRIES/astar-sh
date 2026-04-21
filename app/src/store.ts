import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { api, ApiError } from "./api";
import {
  startDeviceFlow,
  pollForTokens,
  persistAuth,
  openInBrowser,
  type DeviceFlow,
} from "./auth";
import type {
  AuthCache,
  CloseOutcome,
  Mode,
  Task,
  TaskDetail,
} from "./types";

const PRI_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function dueMs(t: Task): number {
  if (!t.due_date) return Number.POSITIVE_INFINITY;
  const ms = new Date(t.due_date).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function comparePriDueNum(a: Task, b: Task): number {
  const ap = PRI_RANK[a.priority] ?? 99;
  const bp = PRI_RANK[b.priority] ?? 99;
  if (ap !== bp) return ap - bp;
  const ad = dueMs(a);
  const bd = dueMs(b);
  if (ad !== bd) return ad - bd;
  return a.task_number - b.task_number;
}

export type SignInState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "awaiting"; flow: DeviceFlow }
  | { phase: "error"; error: string };

type State = {
  auth: AuthCache | null;
  authError: string | null;
  authLoading: boolean;

  signIn: SignInState;

  tasks: Task[];
  doneToday: Task[];
  detail: Record<number, TaskDetail | undefined>;
  lastFetch: number | null;
  fetchError: string | null;

  selected: number | null;
  expanded: number | null;
  mode: Mode;
  closeOutcome: CloseOutcome;
  search: string;

  // actions
  loadAuth: () => Promise<void>;
  startSignIn: () => Promise<void>;
  cancelSignIn: () => void;
  poll: () => Promise<void>;
  loadDetail: (num: number) => Promise<void>;
  select: (num: number) => void;
  selectDelta: (delta: number) => void;
  selectFirst: () => void;
  selectLast: () => void;
  expand: (num: number) => Promise<void>;
  collapse: () => void;
  setMode: (m: Mode) => void;
  beginClose: (outcome: CloseOutcome) => Promise<void>;
  toggleCloseOutcome: () => void;
  postComment: (text: string) => Promise<void>;
  confirmClose: (text: string) => Promise<void>;
};

let signInAbort: AbortController | null = null;

export const useStore = create<State>((set, get) => ({
  auth: null,
  authError: null,
  authLoading: true,

  signIn: { phase: "idle" },

  tasks: [],
  doneToday: [],
  detail: {},
  lastFetch: null,
  fetchError: null,

  selected: null,
  expanded: null,
  mode: "list",
  closeOutcome: "done",
  search: "",

  async loadAuth() {
    set({ authLoading: true, authError: null });
    try {
      const auth = await invoke<AuthCache>("read_auth");
      const expired = auth.expires_at <= Date.now();
      set({
        auth,
        authError: expired ? "Session expired — sign in again." : null,
        authLoading: false,
      });
    } catch {
      // Not signed in yet — surface as a clean state, not an error.
      set({
        auth: null,
        authError: null,
        authLoading: false,
      });
    }
  },

  async startSignIn() {
    signInAbort?.abort();
    signInAbort = new AbortController();
    set({ signIn: { phase: "starting" } });
    try {
      const flow = await startDeviceFlow();
      set({ signIn: { phase: "awaiting", flow } });
      openInBrowser(flow.verification_uri);
      const tokens = await pollForTokens(flow, signInAbort.signal);
      await persistAuth(tokens);
      set({ signIn: { phase: "idle" } });
      await get().loadAuth();
      get().poll();
    } catch (e) {
      const msg = String(e);
      if (msg.includes("aborted")) {
        set({ signIn: { phase: "idle" } });
      } else {
        set({ signIn: { phase: "error", error: msg } });
      }
    }
  },

  cancelSignIn() {
    signInAbort?.abort();
    signInAbort = null;
    set({ signIn: { phase: "idle" } });
  },

  async poll() {
    const auth = get().auth;
    if (!auth || get().authError) return;
    try {
      const [openRaw, closed] = await Promise.all([
        api.listOpen(auth.token),
        api.listClosed(auth.token),
      ]);

      // Sort open: critical → high → medium → low; then due (earliest first,
      // null due last); then task_number ascending.
      const tasks = [...openRaw].sort(comparePriDueNum);

      // Filter closed → only those completed/cancelled today (local time)
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startMs = startOfToday.getTime();
      const doneToday = closed
        .filter((t) => {
          if (!t.completed_at) return false;
          const ms = new Date(t.completed_at).getTime();
          return Number.isFinite(ms) && ms >= startMs;
        })
        .sort(
          (a, b) =>
            new Date(b.completed_at!).getTime() -
            new Date(a.completed_at!).getTime(),
        );
      set((s) => {
        const all = [...tasks, ...doneToday];
        const present = all.some((t) => t.task_number === s.selected);
        return {
          tasks,
          doneToday,
          lastFetch: Date.now(),
          fetchError: null,
          selected: present
            ? s.selected
            : tasks.length > 0
            ? tasks[0].task_number
            : doneToday[0]?.task_number ?? null,
        };
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        set({ authError: "Session expired — sign in again." });
        return;
      }
      set({ fetchError: String(e) });
    }
  },

  async loadDetail(num) {
    const auth = get().auth;
    if (!auth) return;
    try {
      const detail = await api.getTask(auth.token, num);
      set((s) => ({ detail: { ...s.detail, [num]: detail } }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        set({ authError: "Session expired — sign in again." });
      }
    }
  },

  select(num) {
    set({ selected: num });
  },

  selectDelta(delta) {
    const { tasks, doneToday, selected } = get();
    const all = [...tasks, ...doneToday];
    if (all.length === 0) return;
    const idx = Math.max(
      0,
      all.findIndex((t) => t.task_number === selected),
    );
    const next = Math.max(0, Math.min(all.length - 1, idx + delta));
    set({ selected: all[next].task_number });
  },

  selectFirst() {
    const { tasks, doneToday } = get();
    const all = [...tasks, ...doneToday];
    if (all.length > 0) set({ selected: all[0].task_number });
  },

  selectLast() {
    const { tasks, doneToday } = get();
    const all = [...tasks, ...doneToday];
    if (all.length > 0) set({ selected: all[all.length - 1].task_number });
  },

  async expand(num) {
    set({ expanded: num, selected: num, mode: "card" });
    await get().loadDetail(num);
  },

  collapse() {
    set({ expanded: null, mode: "list" });
  },

  setMode(m) {
    set({ mode: m });
  },

  async beginClose(outcome) {
    const num = get().selected;
    if (num == null) return;
    set({ expanded: num, mode: "closing", closeOutcome: outcome });
    await get().loadDetail(num);
  },

  toggleCloseOutcome() {
    set((s) => ({ closeOutcome: s.closeOutcome === "done" ? "wont" : "done" }));
  },

  async postComment(text) {
    const auth = get().auth;
    const num = get().expanded;
    if (!auth || num == null) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await api.addComment(auth.token, num, trimmed);
      await get().loadDetail(num);
    } catch (e) {
      set({ fetchError: String(e) });
    }
  },

  async confirmClose(text) {
    const auth = get().auth;
    const num = get().expanded;
    if (!auth || num == null) return;
    const status = get().closeOutcome === "done" ? "completed" : "cancelled";
    try {
      await api.patchTask(auth.token, num, { status });
    } catch (e) {
      set({ fetchError: `close failed: ${e}` });
      return;
    }

    // Close succeeded — optimistic UI immediately, then try the comment.
    set((s) => ({
      tasks: s.tasks.filter((t) => t.task_number !== num),
      expanded: null,
      mode: "list",
      fetchError: null,
    }));

    const trimmed = text.trim();
    if (trimmed) {
      try {
        await api.addComment(auth.token, num, trimmed);
      } catch (e) {
        set({
          fetchError: `closed, but comment failed: ${e}`,
        });
      }
    }

    get().poll();
  },
}));
