/**
 * Model dropdown backed by live discovery (fetchModels).
 *
 * For OpenRouter the list is grouped into price tiers rendered as <optgroup>s.
 * For DeepSeek / Z.AI it's a flat list.
 *
 * Falls back to the provider's curated suggestedModels while loading or on
 * error.
 */

import { useEffect, useState } from "react";
import { fetchModels, isGrouped, type FetchModelsResult } from "../../lib/providers/modelDiscovery";
import type { ProviderId } from "../../lib/providers/registry";
import { PROVIDERS } from "../../lib/providers/registry";

interface Props {
  providerId: ProviderId;
  apiKey: string;
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
}

export function ModelPicker({ providerId, apiKey, value, onChange, className }: Props) {
  const [result, setResult] = useState<FetchModelsResult>(
    PROVIDERS[providerId].suggestedModels.map((id) => ({ id, label: id })),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchModels(providerId, apiKey)
      .then((r) => { if (!cancelled) setResult(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [providerId, apiKey]);

  const cls = className ?? "w-full bg-surface-3 border border-border-soft rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-dim focus:outline-none";

  // Check whether the current value appears anywhere in the result
  const allOptions = isGrouped(result)
    ? result.flatMap((g) => g.models)
    : result;
  const hasValue = allOptions.some((o) => o.id === value);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
      {/* Always keep the currently selected value selectable */}
      {!hasValue && value && <option value={value}>{value}</option>}

      {isGrouped(result) ? (
        result.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label !== m.id ? `${m.label}` : m.id}
              </option>
            ))}
          </optgroup>
        ))
      ) : (
        result.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label !== m.id ? `${m.label} (${m.id})` : m.id}
          </option>
        ))
      )}

      {loading && <option disabled>Loading…</option>}
    </select>
  );
}
