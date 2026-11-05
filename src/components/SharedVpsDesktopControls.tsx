import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export interface SharedDesktopState {
  mode: "shared" | "per-bot";
  controller?: "bot" | "person" | null;
  activeBot?: { id: string; name: string } | null;
  waitingQueue?: Array<{ id: string; name: string }>;
}

export function SharedVpsStatusLine<T extends { ready: boolean; sharedDesktop?: SharedDesktopState }>(props: {
  active: boolean;
  ready: boolean;
  desktop?: SharedDesktopState;
  refresh: () => Promise<T>;
  onStatus: (status: T) => void;
}) {
  const refresh = useRef(props.refresh);
  const onStatus = useRef(props.onStatus);
  refresh.current = props.refresh;
  onStatus.current = props.onStatus;
  useEffect(() => {
    if (!props.active) return;
    let alive = true;
    const tick = () => void refresh.current().then((status) => { if (alive) onStatus.current(status); }).catch(() => {});
    const interval = window.setInterval(tick, 2_000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [props.active]);
  if (!props.active) return null;
  const waiting = props.desktop?.waitingQueue ?? [];
  return (
    <div className="mb-2 rounded-lg bg-card px-3 py-2 text-[12px] text-ink-secondary" aria-live="polite">
      <span className="font-medium text-ink">Shared VPS Desktop</span>
      <span className="ml-2">{!props.ready ? "Offline" : props.desktop?.controller === "person" ? "You have control" : props.desktop?.activeBot ? `${props.desktop.activeBot.name} is using it` : "Ready"}</span>
      {waiting.length > 0 && <div className="mt-1">Waiting: {waiting.map(entry => entry.name).join(", ")}</div>}
    </div>
  );
}

export function SharedVpsModePicker(props: {
  mode: "per-bot" | "shared";
  disabled: boolean;
  onChange: (mode: "per-bot" | "shared") => void;
}) {
  return (
    <div role="group" aria-label="VPS desktop mode" className="mt-3 flex flex-wrap gap-2 text-[12px]">
      {(["per-bot", "shared"] as const).map(mode => (
        <button key={mode} type="button" aria-pressed={props.mode === mode} disabled={props.disabled}
          onClick={() => props.onChange(mode)}
          className={cn("rounded-lg px-3 py-2 disabled:opacity-50", props.mode === mode ? "bg-accent text-white" : "bg-control text-ink hover:bg-raised-hover")}>
          {mode === "shared" ? "Shared VPS Desktop" : "Per-Bot VPS"}
        </button>
      ))}
      {props.mode === "shared" && <span className="w-full text-ink-secondary">Uses the default VPS SSH alias. All shared bots use this desktop and its files.</span>}
    </div>
  );
}
