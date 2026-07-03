/**
 * Ephemeral cross-component navigation requests — e.g. "jump to this node"
 * from the search palette, which may live in a different wall than the one
 * currently open. `ChatCanvas` watches `focusRequest` and, once mounted for
 * the target chat, frames + selects the node then clears the request.
 */

import { create } from "zustand";

export interface FocusRequest {
  chatId: string;
  nodeId: string;
}

interface NavigationState {
  focusRequest: FocusRequest | null;
  requestFocus: (req: FocusRequest) => void;
  clearFocusRequest: () => void;
}

export const useNavigationStore = create<NavigationState>()((set) => ({
  focusRequest: null,
  requestFocus: (req) => set({ focusRequest: req }),
  clearFocusRequest: () => set({ focusRequest: null }),
}));
