/**
 * Shared queue bridging LiveNostrAdapter's per-call confirm requests to the
 * ConfirmationHost UI component. Kept separate from the component itself so
 * the component file only exports a component (better fast-refresh behavior).
 */

import type { ConfirmRequest } from "./adapter";

export interface QueuedConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

let queueSetter: ((req: QueuedConfirm) => void) | null = null;

export function setConfirmationQueueSetter(setter: ((req: QueuedConfirm) => void) | null): void {
  queueSetter = setter;
}

/** Called by LiveNostrAdapter for every gated call. */
export function requestConfirmation(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    if (!queueSetter) {
      resolve(false);
      return;
    }
    queueSetter({ ...req, resolve });
  });
}
