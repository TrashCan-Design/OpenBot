import { useEffect, useRef, useState } from "react";
import { api, type ComputerControlState } from "@/state/store";
import { cn } from "@/lib/cn";

export interface SharedDesktopState {
  mode: "shared" | "per-bot";
  controller?: "bot" | "person" | null;
  recovering?: boolean;
  activeBot?: { id: string; name: string } | null;
  waitingQueue?: Array<{ id: string; name: string }>;
}

export function SharedVpsStatusLine<T extends { ready: boolean; sharedDesktop?: SharedDesktopState }>(props: {
  active: boolean;
  ready: boolean;
  botId: string;
  desktop?: SharedDesktopState;
  refresh: () => Promise<T>;
  onStatus: (status: T) => void;
  onSnapshot: (snap: Pick<ComputerControlState, "held" | "helpReason"> & { help?: ComputerControlState["help"] }) => void;
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
  const [frame, setFrame] = useState<{ png: string; at: number; epoch?: number } | null>(null);
  const [note, setNote] = useState("");
  const [mine, setMine] = useState(false);
  const [waitingForControl, setWaitingForControl] = useState(false);
  const controlRequest = useRef<AbortController | null>(null);
  const lease = useRef<string | null>(null);
  useEffect(() => {
    if (props.desktop?.controller === "bot" || props.desktop?.recovering) setMine(false);
  }, [props.desktop?.controller, props.desktop?.recovering]);
  if (!props.active) return null;
  const waiting = props.desktop?.waitingQueue ?? [];
  const you = waiting.findIndex(entry => entry.id === "person" || entry.name === "You");
  const observe = () => {
    setNote("");
    void api(`/api/bots/${props.botId}/computer/screenshot`, { method: "POST", body: "{}" }).then((body: { png?: string; capturedAt?: number; epoch?: number }) => {
      if (typeof body.png === "string" && body.png) setFrame({ png: body.png, at: typeof body.capturedAt === "number" ? body.capturedAt : Date.now(), epoch: body.epoch });
    }).catch((error: unknown) => setNote(error instanceof Error ? error.message : "The screen is unavailable"));
  };
  const requestControl = () => {
    const controller = new AbortController();
    const id = Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    controlRequest.current = controller;
    lease.current = id;
    setWaitingForControl(true);
    setNote("");
    void api(`/api/bots/${props.botId}/computer/control`, { method: "POST", body: JSON.stringify({ action: "take", controlLeaseId: id }), signal: controller.signal }).then((snap: { held?: boolean; owned?: boolean; helpReason?: string | null; help?: ComputerControlState["help"] }) => {
      setMine(snap.owned === true && snap.held === true);
      props.onSnapshot({ held: snap.held === true, helpReason: snap.helpReason ?? null, help: snap.help ?? null });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setNote(error instanceof Error ? error.message : "Control was not granted");
    }).finally(() => {
      if (controlRequest.current === controller) controlRequest.current = null;
      setWaitingForControl(false);
    });
  };
  const cancelRequest = () => controlRequest.current?.abort();
  const releaseControl = () => {
    const id = lease.current;
    setMine(false);
    void api(`/api/bots/${props.botId}/computer/control`, { method: "POST", body: JSON.stringify({ action: "release", ...(id ? { controlLeaseId: id } : {}) }) }).then((snap: { held?: boolean; helpReason?: string | null; help?: ComputerControlState["help"] }) => {
      props.onSnapshot({ held: snap.held === true, helpReason: snap.helpReason ?? null, help: snap.help ?? null });
    }).catch((error: unknown) => setNote(error instanceof Error ? error.message : "Control was not released"));
  };
  const availability = !props.ready ? "Offline" : props.desktop?.recovering ? "Recovering" : mine ? "You have control" : props.desktop?.controller === "person" ? "Another person has control" : props.desktop?.activeBot ? `${props.desktop.activeBot.name} is using it` : "Ready";
  return (
    <div className="mb-2 rounded-lg bg-card px-3 py-2 text-[12px] text-ink-secondary" aria-live="polite">
      <span className="font-medium text-ink">Shared VPS Desktop</span>
      <span className="ml-2">{availability}</span>
      <span className="ml-2">{mine ? "Input is on" : "Input is off"}</span>
      {waitingForControl && <span className="ml-2">Queued for control</span>}
      {you >= 0 && !mine && <span className="ml-2">Queue position {you + 1}</span>}
      {waiting.length > 0 && <div className="mt-1">Waiting: {waiting.map(entry => entry.name).join(", ")}</div>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg bg-control px-3 py-2 text-ink hover:bg-raised-hover" onClick={observe}>Observe</button>
        {!mine && !waitingForControl && <button type="button" className="rounded-lg bg-control px-3 py-2 text-ink hover:bg-raised-hover" onClick={requestControl}>Request control</button>}
        {waitingForControl && <button type="button" className="rounded-lg bg-control px-3 py-2 text-ink hover:bg-raised-hover" onClick={cancelRequest}>Cancel request</button>}
        {mine && <button type="button" className="rounded-lg bg-control px-3 py-2 text-ink hover:bg-raised-hover" onClick={releaseControl}>Release control</button>}
      </div>
      {frame && <img className="mt-2 max-h-40 rounded-md" alt="Shared desktop, observed without control" src={`data:image/png;base64,${frame.png}`} />}
      {frame && <div className="mt-1">Frame from {new Date(frame.at).toLocaleTimeString()}. It can be older than the live desktop.{typeof frame.epoch === "number" ? ` Epoch ${frame.epoch}.` : ""}</div>}
      {note && <div className="mt-1">{note}</div>}
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
