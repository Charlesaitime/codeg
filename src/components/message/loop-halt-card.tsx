"use client"

/**
 * Grok's anti-loop guard fired on this turn: the model repeated one tool call
 * until the CLI ordered it to stop (see `@/lib/loop-halt`). The reply that
 * follows was produced under that halt order and, in observed captures, is often
 * a near-verbatim restatement of an earlier answer rather than a real one — so
 * this card exists to say that out loud instead of letting it pass as a normal
 * reply.
 *
 * Rendered as a centered divider like <ContextCompactionCard> (it marks a point
 * in the turn, not a tool the user ran) but in the warning color: unlike a
 * compaction, this one means the answer below is suspect.
 */

import { useTranslations } from "next-intl"
import { RotateCcw } from "lucide-react"

import { loopHaltRepeats, loopHaltTool } from "@/lib/loop-halt"

interface Props {
  /** ACP tool-call `_meta` carrying the versioned `loopHalt` payload. */
  meta?: Record<string, unknown> | null
}

export function LoopHaltCard({ meta }: Props) {
  const t = useTranslations("Folder.chat.loopHalt")
  const tool = loopHaltTool(meta)
  const repeats = loopHaltRepeats(meta)
  // Detail only when the parser actually recovered it — never a guessed count.
  const label =
    tool && repeats !== null
      ? t("haltedWithTool", { tool, repeats })
      : t("halted")
  return (
    <div className="flex items-center gap-3 py-1 text-xs select-none">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-500/30" />
      <div
        className="flex shrink-0 items-center gap-1.5 text-amber-600 dark:text-amber-500"
        title={t("hint")}
      >
        <RotateCcw className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-500/30" />
    </div>
  )
}
