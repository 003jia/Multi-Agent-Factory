import type { ValidationState } from "../types";
import { validationLabels } from "../lib/stage";

interface StatusBadgeProps {
  state: ValidationState;
  compact?: boolean;
}

export function StatusBadge({ state, compact = false }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-${state} ${compact ? "status-compact" : ""}`}>
      <span className="status-dot" />
      {validationLabels[state]}
    </span>
  );
}
