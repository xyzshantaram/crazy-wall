/**
 * Heuristic static detection of which gated ctx.* capabilities a Lua script
 * calls, mirroring tile-studio's regex-based approach. This is advisory: it
 * cross-checks the AI's self-declared `declaredCapabilities` against what the
 * script actually calls, surfacing a warning for undeclared usage so the
 * approval dialog can flag it -- it does not itself gate anything (the real
 * gate is the runtime's grant resolution, driven by what the user approves).
 */

import type { NostrCapability } from "../../types/graph";

const CTX_FN_TO_CAP: Record<string, NostrCapability> = {
  get_public_key: "get-pubkey",
  publish_event: "publish-event",
  encrypt_nip44: "nip44-encrypt",
  decrypt_nip44: "nip44-decrypt",
  fetch: "fetch",
  navigate: "navigate",
};

/** Strips Lua line comments (--...) and block comments (--[[...]]) so they
 *  don't produce false-positive matches. Does not touch string contents. */
function stripLuaComments(lua: string): string {
  let out = lua.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, "");
  out = out.replace(/--[^\n]*/g, "");
  return out;
}

export function detectCapabilities(lua: string): NostrCapability[] {
  const stripped = stripLuaComments(lua);
  const found = new Set<NostrCapability>();
  for (const [fn, cap] of Object.entries(CTX_FN_TO_CAP)) {
    const re = new RegExp(`ctx\\.${fn}\\s*\\(`);
    if (re.test(stripped)) found.add(cap);
  }
  if (/\$me\b|\$contacts\b/.test(stripped)) found.add("get-pubkey");
  return Array.from(found);
}

export interface CapabilityAudit {
  /** Capabilities the script actually appears to call. */
  detected: NostrCapability[];
  /** Declared-but-seemingly-unused (harmless, just noise). */
  overDeclared: NostrCapability[];
  /** Used-but-NOT-declared (real risk -- these calls will silently fail at runtime
   *  unless we grant them anyway, so we surface them prominently for the user). */
  underDeclared: NostrCapability[];
}

export function auditCapabilities(lua: string, declared: NostrCapability[]): CapabilityAudit {
  const detected = detectCapabilities(lua);
  const declaredSet = new Set(declared);
  const detectedSet = new Set(detected);
  return {
    detected,
    overDeclared: declared.filter((c) => !detectedSet.has(c)),
    underDeclared: detected.filter((c) => !declaredSet.has(c)),
  };
}
