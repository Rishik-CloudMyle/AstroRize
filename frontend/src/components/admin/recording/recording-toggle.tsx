"use client";

import { useAction } from "@/components/admin/admin-provider";
import { api } from "@/lib/api/client";
import type { RecordingModality } from "@/lib/admin/types";

/**
 * The status pill of one recording type. Enabled/disabled pills switch the type through the API,
 * which refuses while the cost & capability checklist is incomplete; blocked types never switch.
 */
export default function RecordingToggle({
  modality,
  label,
  className,
}: {
  modality: RecordingModality;
  label: string;
  className: string;
}) {
  const { run } = useAction();
  if (modality.status === "blocked") return <span className={className}>{label}</span>;

  const next = modality.status === "enabled" ? "disabled" : "enabled";
  const toggle = () =>
    void run(
      () => api.patch(`/admin/recording/${encodeURIComponent(modality.mode)}`, { status: next }),
      `${modality.mode} recording ${next}. Dual audit recorded.`,
    );

  return (
    <button type="button" onClick={toggle} aria-pressed={modality.status === "enabled"} className={className}>
      {label}
    </button>
  );
}
