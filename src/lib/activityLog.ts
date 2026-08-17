import type { ActivityAction, ActivityLogEntry, Session, User } from "../types";
import { get, set } from "./storage";
import { ACTIVITY_LOG_KEY, SESSION_KEY, USERS_KEY } from "./initStore";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function logActivity(
  action: ActivityAction,
  entity: string,
  entityId: string
): void {
  try {
    const session = get<Session>(SESSION_KEY);
    const users = get<User[]>(USERS_KEY) ?? [];
    const currentUser = users.find((u) => u.id === session?.userId);

    const userId = currentUser?.id ?? "unknown";
    const userName = currentUser?.name ?? "Unknown User";

    const logs = get<ActivityLogEntry[]>(ACTIVITY_LOG_KEY) ?? [];
    const entry: ActivityLogEntry = {
      id: uid("ACT"),
      userId,
      userName,
      action,
      entity,
      entityId,
      timestamp: new Date().toISOString(),
    };

    // Prepend new entry
    const nextLogs = [entry, ...logs].slice(0, 100); // keep reasonable limit
    set<ActivityLogEntry[]>(ACTIVITY_LOG_KEY, nextLogs);
  } catch (err) {
    console.error("[activityLog] Failed to log activity:", err);
  }
}

export function getRecentActivity(limit = 20, userFilter?: string): ActivityLogEntry[] {
  const logs = get<ActivityLogEntry[]>(ACTIVITY_LOG_KEY) ?? [];
  let filtered = logs;
  if (userFilter && userFilter !== "all") {
    filtered = logs.filter((l) => l.userId === userFilter);
  }
  return filtered.slice(0, limit);
}
