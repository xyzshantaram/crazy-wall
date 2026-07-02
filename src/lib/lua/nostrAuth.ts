/**
 * NIP-07 login flow. We only support browser-extension signing (Alby, nos2x,
 * etc.) -- no raw nsec handling, since AI-generated Lua tiles get real
 * signing power through this identity and we don't want a raw private key
 * sitting in memory/localStorage for that use case.
 */

import { hasNip07 } from "./adapter";
import { useSettingsStore } from "../../stores/settingsStore";

export class NostrLoginError extends Error {}

export async function loginWithNip07(): Promise<{ pubkey: string }> {
  if (!hasNip07()) {
    throw new NostrLoginError(
      "No Nostr browser extension found. Install a NIP-07 signer (e.g. Alby or nos2x) and reload the page.",
    );
  }
  try {
    const pubkey = await window.nostr!.getPublicKey();
    useSettingsStore.getState().setNostrIdentity({ pubkey });
    return { pubkey };
  } catch (err) {
    throw new NostrLoginError(err instanceof Error ? err.message : "Failed to get public key from extension.");
  }
}

export function logoutNostr(): void {
  useSettingsStore.getState().setNostrIdentity(null);
}
