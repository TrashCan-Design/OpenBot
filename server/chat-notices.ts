import { failedTurnTool, type FailedTurnTool } from "../shared/failed-turn.ts";
import { redactParams } from "../shared/redact.ts";

export type ServerTextParams = Record<string, string | number>;

export interface ServerText {
  key: string;
  params?: ServerTextParams;
}

export const CHAT_NOTICE = {
  "chat.notice.stalled": "no activity for {minutes} minutes — the turn was stopped",
  "chat.notice.stalledCommand": "the command `{command}` ran for {minutes} minutes without finishing and looks stuck — the turn was stopped",
} as const;

export type ChatNoticeKey = keyof typeof CHAT_NOTICE;

export function formatServerText(template: string, params: ServerTextParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function chatNotice(key: ChatNoticeKey, params?: ServerTextParams): string {
  return formatServerText(CHAT_NOTICE[key], params);
}

export function noticeLine<Key extends ChatNoticeKey, Params extends ServerTextParams = ServerTextParams>(key: Key, params?: Params) {
  const safe = params && redactParams(params);
  return { text: chatNotice(key, safe), textCode: key, ...(safe ? { textParams: safe } : {}) };
}

export function failedNoticeTool(key: ChatNoticeKey, params?: ServerTextParams): FailedTurnTool {
  const safe = params && redactParams(params);
  return failedTurnTool(chatNotice(key, safe), { text: { key, ...(safe ? { params: safe } : {}) } });
}
