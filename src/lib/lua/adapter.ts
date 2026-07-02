/**
 * NostrAdapter implementations for the two trust tiers Canvas uses:
 *
 * - `NullAdapter` — used for every ordinary graph node. No relay, no
 *   identity, no network. `ctx.subscribe` is a no-op (never delivers events),
 *   every gated capability call fails (`register()` grants nothing anyway,
 *   so this is belt-and-suspenders). `ctx.notify` is still forwarded to the
 *   host as a toast since it's ungated and harmless.
 *
 * - `LiveNostrAdapter` — used only for "Nostr dashboard" nodes the user has
 *   explicitly approved. Backed by a real relay pool and NIP-07
 *   (`window.nostr`) for signing. Every gated call additionally round-trips
 *   through a per-call confirmation callback before it's fulfilled, so an
 *   approved dashboard still can't silently publish/fetch without the user
 *   seeing exactly what's about to happen.
 */

import { SimplePool, type Filter, type NostrEvent, type UnsignedEvent } from "nostr-tools";
import type {
  FetchRequest,
  FetchResult,
  NavigateResult,
  NavigateTarget,
  NostrAdapter,
  ProfileData,
} from "@soapbox.pub/nostr-canvas";

export function createNullAdapter(_onNotify?: (message: string, variant?: string) => void): NostrAdapter {
  return {
    subscribe(_filter: Filter, _onEvent: (event: NostrEvent) => void) {
      return () => {};
    },
    async fetchEvents() {
      return [];
    },
  } satisfies NostrAdapter;
}

export interface ConfirmRequest {
  kind: "publish" | "fetch" | "navigate" | "encrypt" | "decrypt";
  detail: string;
}

export type ConfirmFn = (req: ConfirmRequest) => Promise<boolean>;

export interface LiveAdapterOptions {
  relays: string[];
  /** Called before every gated action executes; return false to abort it. */
  confirm: ConfirmFn;
  onNotify?: (message: string, variant?: string) => void;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: UnsignedEvent): Promise<NostrEvent>;
      getRelays?: () => Promise<Record<string, { read: boolean; write: boolean }>>;
      nip04?: { encrypt(pubkey: string, plaintext: string): Promise<string>; decrypt(pubkey: string, ciphertext: string): Promise<string> };
      nip44?: { encrypt(pubkey: string, plaintext: string): Promise<string>; decrypt(pubkey: string, ciphertext: string): Promise<string> };
    };
  }
}

export function hasNip07(): boolean {
  return typeof window !== "undefined" && Boolean(window.nostr);
}

export class LiveNostrAdapter implements NostrAdapter {
  private pool = new SimplePool();
  private relays: string[];
  private confirm: ConfirmFn;

  constructor(opts: LiveAdapterOptions) {
    this.relays = opts.relays;
    this.confirm = opts.confirm;
  }

  subscribe(filter: Filter, onEvent: (event: NostrEvent) => void): () => void {
    if (this.relays.length === 0) return () => {};
    const sub = this.pool.subscribe(this.relays, filter, { onevent: onEvent });
    return () => sub.close();
  }

  async fetchEvents(filter: Filter): Promise<NostrEvent[]> {
    if (this.relays.length === 0) return [];
    return this.pool.querySync(this.relays, filter);
  }

  async getPublicKey(): Promise<string> {
    if (!window.nostr) throw new Error("No NIP-07 extension found");
    return window.nostr.getPublicKey();
  }

  async getContacts(): Promise<string[]> {
    try {
      const pk = await this.getPublicKey();
      const events = await this.pool.querySync(this.relays, { kinds: [3], authors: [pk], limit: 1 });
      const latest = events[0];
      if (!latest) return [];
      return latest.tags.filter((t) => t[0] === "p" && t[1]).map((t) => t[1]);
    } catch {
      return [];
    }
  }

  async publishEvent(event: UnsignedEvent): Promise<NostrEvent> {
    const ok = await this.confirm({
      kind: "publish",
      detail: `Publish a kind ${event.kind} event: "${event.content.slice(0, 140)}"`,
    });
    if (!ok) throw new Error("User declined publish");
    if (!window.nostr) throw new Error("No NIP-07 extension found");
    const signed = await window.nostr.signEvent(event);
    await Promise.any(this.pool.publish(this.relays, signed));
    return signed;
  }

  async nip44Encrypt(recipientPubkey: string, plaintext: string): Promise<string> {
    const ok = await this.confirm({ kind: "encrypt", detail: `Encrypt a message to ${recipientPubkey.slice(0, 12)}…` });
    if (!ok) throw new Error("User declined encrypt");
    if (!window.nostr?.nip44) throw new Error("NIP-44 not supported by extension");
    return window.nostr.nip44.encrypt(recipientPubkey, plaintext);
  }

  async nip44Decrypt(senderPubkey: string, ciphertext: string): Promise<string> {
    const ok = await this.confirm({ kind: "decrypt", detail: `Decrypt a message from ${senderPubkey.slice(0, 12)}…` });
    if (!ok) throw new Error("User declined decrypt");
    if (!window.nostr?.nip44) throw new Error("NIP-44 not supported by extension");
    return window.nostr.nip44.decrypt(senderPubkey, ciphertext);
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    const ok = await this.confirm({ kind: "fetch", detail: `Make an outbound request to ${request.url}` });
    if (!ok) return { ok: false, error: "User declined network request" };
    try {
      const res = await globalThis.fetch(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
      });
      const body = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { ok: true, status: res.status, headers, body };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  getProfile(pubkey: string, callback: (pubkey: string, profile: ProfileData) => void): () => void {
    if (this.relays.length === 0) return () => {};
    const sub = this.pool.subscribe(this.relays, { kinds: [0], authors: [pubkey], limit: 1 }, {
      onevent: (event) => {
        try {
          callback(pubkey, JSON.parse(event.content) as ProfileData);
        } catch {
          /* ignore malformed profile */
        }
      },
    });
    return () => sub.close();
  }

  resolveHandle(pubkey: string, profile?: ProfileData): string {
    if (profile?.nip05) return `@${profile.nip05}`;
    if (profile?.name) return `@${profile.name}`;
    return `@${pubkey.slice(0, 8)}…`;
  }

  async navigate(target: NavigateTarget): Promise<NavigateResult> {
    const detail = "identifier" in target ? `Navigate to tile "${target.identifier}"` : `Navigate to "${target.pointer}"`;
    const ok = await this.confirm({ kind: "navigate", detail });
    if (!ok) return { ok: false, reason: "rejected" };
    return { ok: false, reason: "not_implemented" };
  }

  destroy(): void {
    this.pool.destroy();
  }
}
