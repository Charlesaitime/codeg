/**
 * Grok anti-loop halt detection.
 *
 * When grok repeats the identical tool call N times, its CLI injects a synthetic
 * `<system-reminder>` ordering the model to stop and halts the turn if it keeps
 * going. That reminder is written ONLY to grok's model-facing
 * `chat_history.jsonl` — never to the ACP stream — and the turn still closes with
 * `stop_reason: "end_turn"`, so the reply that follows looks like any other. In
 * practice the model bails out and restates an EARLIER answer near-verbatim,
 * which reads as a real (but wrong) reply.
 *
 * `parsers/grok.rs::inject_grok_loop_halt_notices` recovers the reminder and
 * synthesizes a `tool_call` tagged `_meta.loopHalt` into the turn it degraded —
 * the same bridge shape the `auto_compact_completed` → `_meta.contextCompaction`
 * synthesis uses. Matching renders through the dedicated `<LoopHaltCard>` and
 * must NOT fold into a "调用 N 个工具" tool-group.
 *
 * History-only by construction: the live ACP stream carries no such signal, so
 * the notice appears once the conversation is (re)loaded from disk.
 *
 * Kept dependency-free so the grouping pass (`ai-elements-adapter.ts`) and the
 * card can share it without an import cycle.
 */

/** The versioned `_meta.loopHalt` payload, or `null` when the meta isn't one. */
export function loopHaltPayload(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null
  const marker = (meta as Record<string, unknown>).loopHalt
  if (!marker || typeof marker !== "object") return null
  const version = (marker as Record<string, unknown>).version
  if (
    !(typeof version === "number" && Number.isInteger(version) && version >= 1)
  )
    return null
  return marker as Record<string, unknown>
}

export function isLoopHaltMeta(meta: unknown): boolean {
  return loopHaltPayload(meta) !== null
}

/**
 * The repeated tool's name, when the reminder still named it. Absent whenever
 * grok rewords the template — the parser extracts best-effort and never guesses.
 */
export function loopHaltTool(meta: unknown): string | null {
  const tool = loopHaltPayload(meta)?.tool
  return typeof tool === "string" && tool.trim().length > 0 ? tool : null
}

/** How many identical calls in a row tripped the guard, when known. */
export function loopHaltRepeats(meta: unknown): number | null {
  const repeats = loopHaltPayload(meta)?.repeats
  return typeof repeats === "number" && Number.isFinite(repeats) && repeats > 0
    ? repeats
    : null
}
