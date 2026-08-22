import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { LoopHaltCard } from "./loop-halt-card"
import enMessages from "@/i18n/messages/en.json"

function renderCard(meta: Record<string, unknown> | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LoopHaltCard meta={meta} />
    </NextIntlClientProvider>
  )
}

describe("LoopHaltCard", () => {
  it("names the repeated tool and the repeat count", () => {
    renderCard({ loopHalt: { version: 1, tool: "grep", repeats: 8 } })
    expect(
      screen.getByText("Loop guard halted this turn · `grep` repeated 8×")
    ).toBeInTheDocument()
  })

  it("falls back to the plain label when the template named neither", () => {
    // A reworded grok reminder still yields a notice — the detail is dropped,
    // never guessed.
    renderCard({ loopHalt: { version: 1 } })
    expect(screen.getByText("Loop guard halted this turn")).toBeInTheDocument()
  })

  it("keeps the plain label when only one half of the detail survived", () => {
    renderCard({ loopHalt: { version: 1, tool: "grep" } })
    expect(screen.getByText("Loop guard halted this turn")).toBeInTheDocument()
  })
})
