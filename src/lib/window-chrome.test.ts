import { describe, expect, it } from "vitest"

import {
  LEFT_CHROME_CLUSTER,
  MAC_TRAFFIC_LIGHT_INSET,
  RIGHT_CHROME_CLUSTER,
  WINDOW_CAPTION_WIDTH,
  SIDEBAR_CONTENT_MIN,
  SIDEBAR_TRAILING_CLUSTER,
  leftChromeReserve,
  rightChromeClusterWidth,
  sidebarMinWidth,
  rightChromeReserve,
} from "./window-chrome"

// The app "zoom" scales the root font-size (rem), so the rem-sized chrome buttons
// grow with zoom. Their fixed-px containers must grow by the same factor or the
// buttons overflow/clip at high zoom (the 150% bug). These guard that only the
// DOM button CLUSTER scales, while the native insets (macOS traffic-light
// clearance, Windows/Linux caption strip) stay fixed.
describe("window-chrome zoom scaling", () => {
  it("defaults to 100% (no scaling) and matches the pre-zoom baseline", () => {
    // Baseline the aux-panel collapse test also hard-codes: 116 (mac/web) and
    // 116 + 138 = 254 (win/linux caption reserved).
    expect(rightChromeReserve(false)).toBe(RIGHT_CHROME_CLUSTER)
    expect(rightChromeReserve(true)).toBe(
      RIGHT_CHROME_CLUSTER + WINDOW_CAPTION_WIDTH
    )
    expect(rightChromeClusterWidth()).toBe(RIGHT_CHROME_CLUSTER)
    expect(leftChromeReserve(false)).toBe(LEFT_CHROME_CLUSTER)
    expect(leftChromeReserve(true)).toBe(
      MAC_TRAFFIC_LIGHT_INSET + LEFT_CHROME_CLUSTER
    )
  })

  it("scales only the button cluster at 150%, leaving native insets fixed", () => {
    // 116 → 174, 80 → 120.
    expect(rightChromeClusterWidth(150)).toBe(174)
    expect(rightChromeReserve(false, 150)).toBe(174)
    // Native caption strip stays 138.
    expect(rightChromeReserve(true, 150)).toBe(174 + WINDOW_CAPTION_WIDTH)
    // Native traffic-light inset stays 76; only the 80 cluster scales to 120.
    expect(leftChromeReserve(false, 150)).toBe(120)
    expect(leftChromeReserve(true, 150)).toBe(MAC_TRAFFIC_LIGHT_INSET + 120)
  })

  it("scales the cluster down below 100% too and rounds to whole pixels", () => {
    // 116 * 0.9 = 104.4 → 104 (rounded).
    expect(rightChromeClusterWidth(90)).toBe(104)
    // 80 * 0.5 = 40, plus the fixed 76 inset.
    expect(leftChromeReserve(true, 50)).toBe(MAC_TRAFFIC_LIGHT_INSET + 40)
  })
})

/**
 * The sidebar's drag floor. It exists so the divider can be dragged narrower
 * than the old hard-coded 300 WITHOUT the header's two button clusters ever
 * overlapping — which is the failure a fixed number cannot avoid, because both
 * clusters grow with zoom while the traffic-light inset only applies on macOS.
 */
describe("sidebarMinWidth", () => {
  it("clears the header's two clusters on desktop macOS at 100%", () => {
    // Traffic lights + left cluster + the sidebar's own trailing cluster. Above
    // the content floor, so the header is what binds here.
    const expected =
      MAC_TRAFFIC_LIGHT_INSET + LEFT_CHROME_CLUSTER + SIDEBAR_TRAILING_CLUSTER
    expect(sidebarMinWidth(true)).toBe(expected)
    expect(expected).toBeGreaterThan(SIDEBAR_CONTENT_MIN)
  })

  it("lets the sidebar go narrower than the old fixed 300 floor", () => {
    // The whole point of the change: every platform gains room back.
    expect(sidebarMinWidth(true)).toBeLessThan(300)
    expect(sidebarMinWidth(false)).toBeLessThan(300)
  })

  it("falls back to the content floor when the header needs less", () => {
    // Without the traffic-light inset the header fits in far less than a
    // usable session row does, so the content floor takes over.
    expect(LEFT_CHROME_CLUSTER + SIDEBAR_TRAILING_CLUSTER).toBeLessThan(
      SIDEBAR_CONTENT_MIN
    )
    expect(sidebarMinWidth(false)).toBe(SIDEBAR_CONTENT_MIN)
  })

  it("grows with zoom so the buttons never overlap at 150%", () => {
    // The regression a fixed floor causes: at 150% the clusters are half again
    // as wide, and a floor frozen at the 100% value would crop them.
    const at100 = sidebarMinWidth(true, 100)
    const at150 = sidebarMinWidth(true, 150)
    expect(at150).toBeGreaterThan(at100)
    // Only the rem-sized clusters scale; the native inset is constant.
    expect(at150).toBe(
      MAC_TRAFFIC_LIGHT_INSET +
        Math.round((LEFT_CHROME_CLUSTER * 150) / 100) +
        Math.round((SIDEBAR_TRAILING_CLUSTER * 150) / 100)
    )
  })

  it("never drops below the content floor at any zoom", () => {
    // An invariant over the whole supported range rather than one anchor: a
    // sidebar narrower than this shows a few characters of title and nothing
    // else, whatever the header happens to need.
    for (let zoom = 50; zoom <= 200; zoom += 5) {
      expect(sidebarMinWidth(true, zoom)).toBeGreaterThanOrEqual(
        SIDEBAR_CONTENT_MIN
      )
      expect(sidebarMinWidth(false, zoom)).toBeGreaterThanOrEqual(
        SIDEBAR_CONTENT_MIN
      )
    }
  })
})
