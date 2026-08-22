import { describe, expect, it } from "vitest"

import {
  isLoopHaltMeta,
  loopHaltPayload,
  loopHaltRepeats,
  loopHaltTool,
} from "./loop-halt"

describe("loop-halt meta", () => {
  it("accepts the versioned payload the grok parser synthesizes", () => {
    const meta = { loopHalt: { version: 1, tool: "grep", repeats: 8 } }
    expect(isLoopHaltMeta(meta)).toBe(true)
    expect(loopHaltPayload(meta)).toEqual({
      version: 1,
      tool: "grep",
      repeats: 8,
    })
    expect(loopHaltTool(meta)).toBe("grep")
    expect(loopHaltRepeats(meta)).toBe(8)
  })

  it("rejects anything that isn't a versioned loopHalt payload", () => {
    // A future version bump stays accepted; a boolean/absent marker does not —
    // unlike contextCompaction, this tag has no legacy boolean shape.
    expect(isLoopHaltMeta({ loopHalt: { version: 2 } })).toBe(true)
    expect(isLoopHaltMeta({ loopHalt: true })).toBe(false)
    expect(isLoopHaltMeta({ loopHalt: { version: 0 } })).toBe(false)
    expect(isLoopHaltMeta({ contextCompaction: true })).toBe(false)
    expect(isLoopHaltMeta(null)).toBe(false)
    expect(isLoopHaltMeta(undefined)).toBe(false)
    expect(isLoopHaltMeta("loopHalt")).toBe(false)
  })

  it("drops detail fields that are missing or malformed rather than guessing", () => {
    const bare = { loopHalt: { version: 1 } }
    expect(loopHaltTool(bare)).toBeNull()
    expect(loopHaltRepeats(bare)).toBeNull()
    const junk = { loopHalt: { version: 1, tool: "  ", repeats: 0 } }
    expect(loopHaltTool(junk)).toBeNull()
    expect(loopHaltRepeats(junk)).toBeNull()
  })
})
