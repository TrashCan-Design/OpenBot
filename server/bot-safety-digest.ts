import type { BotRecord, TaskRecord } from "./store.ts";

export const BOT_SAFETY_FIELDS = [
  "approvalMode", "autoApprove", "alwaysAllow", "approvalGrant", "toolScope", "connectorTools", "connectorScopes",
  "outbound", "composio", "computer", "cloudBackend", "browser", "browserProfile", "mcpServers", "phoneApps", "cwd",
  "chiefOfStaff", "managedSections", "reportsTo", "visibility", "access", "createdBy", "hidden",
] as const satisfies readonly (keyof BotRecord)[];

export const THREAD_SAFETY_FIELDS = [
  "approvalMode", "autoApprove", "alwaysAllow", "cwd", "private",
] as const satisfies readonly (keyof TaskRecord)[];

export function botSafetyDigest(bot: BotRecord): string {
  const parts: string[] = [];
  for (const key of BOT_SAFETY_FIELDS) if (bot[key] !== undefined) parts.push(key, JSON.stringify(bot[key]) ?? "");
  for (const task of bot.tasks ?? []) {
    let named = false;
    for (const key of THREAD_SAFETY_FIELDS) {
      if (task[key] === undefined) continue;
      if (!named) parts.push(`#${task.threadId}`);
      named = true;
      parts.push(key, JSON.stringify(task[key]) ?? "");
    }
  }
  return parts.join("\u0000");
}
