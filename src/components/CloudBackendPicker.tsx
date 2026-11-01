import type { CloudBackend } from "../../shared/wire";
import { useStore } from "@/state/store";
import { t } from "@/lib/i18n";

export function CloudBackendPicker({
  value,
  compact = false,
  onChange,
}: {
  value: CloudBackend;
  compact?: boolean;
  onChange: (backend: CloudBackend) => void;
}) {
  const { state } = useStore();
  if (state.config?.cloudHome) return null;
  return (
    <div className="mt-3 rounded-lg bg-inset p-3">
      <div className="text-[12px] font-medium text-ink">{compact ? t("botAccess.cloud.provider") : t("botAccess.cloud.backend")}</div>
      <div className="mt-0.5 text-[12px] text-ink-secondary">{t(compact ? "botAccess.cloud.vpsDescription" : "botAccess.cloud.vpsAutoDescription")}</div>
      {value === "box" ? <button type="button" onClick={() => onChange("vps")} className="mt-2 rounded-lg bg-raised px-3 py-1.5 text-[12px] text-ink hover:bg-raised-hover">{t("botAccess.cloud.selfHostedVps")}</button> :
        <div className="mt-2 rounded-lg bg-raised px-3 py-1.5 text-[12px] text-ink">{t("botAccess.cloud.selfHostedVps")}</div>}
    </div>
  );
}
