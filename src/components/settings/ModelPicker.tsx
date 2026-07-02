/**
 * Model dropdown backed by live discovery (fetchModels), with a loading
 * state and graceful fallback to the provider's curated default list.
 */

import { useEffect, useState } from "react";
import { fetchModels, type ModelOption } from "../../lib/providers/modelDiscovery";
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
  const [options, setOptions] = useState<ModelOption[]>(
    PROVIDERS[providerId].suggestedModels.map((id) => ({ id, label: id })),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchModels(providerId, apiKey)
      .then((models) => {
        if (!cancelled) setOptions(models);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId, apiKey]);

  // Ensure the currently-selected value is always selectable even if it
  // hasn't loaded into `options` yet (e.g. a custom/typed-in model id).
  const hasValue = options.some((o) => o.id === value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "w-full bg-surface-3 border border-border-soft rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-dim focus:outline-none"}
    >
      {!hasValue && value && <option value={value}>{value}</option>}
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label !== m.id ? `${m.label} (${m.id})` : m.id}
        </option>
      ))}
      {loading && <option disabled>Loading models…</option>}
    </select>
  );
}
