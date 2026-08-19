import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SidebarProvider, useSidebarContext } from "./sidebar-context"
import { sidebarMinWidth } from "@/lib/window-chrome"

// The floor depends on platform + zoom, so both are driven from here.
const mockPlatform = { isMac: true }
const mockZoom = { zoomLevel: 100 }

vi.mock("@/hooks/use-platform", () => ({
  usePlatform: () => ({
    platform: mockPlatform.isMac ? "macos" : "windows",
    isMac: mockPlatform.isMac,
    isWindows: !mockPlatform.isMac,
    isLinux: false,
  }),
}))
vi.mock("@/hooks/use-appearance", () => ({
  useZoomLevel: () => ({
    zoomLevel: mockZoom.zoomLevel,
    setZoomLevel: vi.fn(),
  }),
}))
// `isDesktop()` gates the macOS traffic-light inset; pin it on so the mac
// branch is the one under test.
vi.mock("@/lib/platform", () => ({ isDesktop: () => true }))

// The width a `drag()` will request. Set from the test body (never during a
// render), and only READ inside the component.
const pending = { width: 0 }

/** Surfaces the context through the DOM so nothing is written during render. */
function Probe() {
  const { width, minWidth, setWidth } = useSidebarContext()
  return (
    <button
      data-testid="probe"
      data-width={width}
      data-min={minWidth}
      onClick={() => setWidth(pending.width)}
    />
  )
}

// A FRESH element each call: `rerender` with an identical element reference
// lets React bail out of the re-render entirely, so a changed zoom mock would
// never reach the provider.
const tree = () => (
  <SidebarProvider>
    <Probe />
  </SidebarProvider>
)

const probe = () => screen.getByTestId("probe")
const width = () => Number(probe().dataset.width)
const minWidth = () => Number(probe().dataset.min)

/** Drag the divider to `next`, the way the panel group reports a resize. */
function drag(next: number) {
  pending.width = next
  act(() => probe().click())
}

describe("SidebarProvider width range", () => {
  beforeEach(() => {
    localStorage.clear()
    mockPlatform.isMac = true
    mockZoom.zoomLevel = 100
    pending.width = 0
  })

  it("exposes the derived floor, not the old hard-coded 300", () => {
    render(tree())
    expect(minWidth()).toBe(sidebarMinWidth(true, 100))
    expect(minWidth()).toBeLessThan(300)
  })

  it("lets the sidebar be dragged below the old floor", () => {
    render(tree())
    const target = minWidth() + 5
    drag(target)
    expect(width()).toBe(target)
    expect(width()).toBeLessThan(300)
  })

  it("pushes the width up to the floor instead of rendering underneath it", () => {
    render(tree())
    drag(50)
    expect(width()).toBe(minWidth())
  })

  it("never exceeds the ceiling", () => {
    render(tree())
    drag(5000)
    expect(width()).toBe(900)
  })

  /**
   * The reason the clamp is derived rather than written back into state: a
   * zoom-driven widening is TEMPORARY, and zooming back out has to return the
   * sidebar to the width the user actually dragged. Writing the clamped value
   * into state would overwrite that intent the first time the floor moved.
   */
  it("restores the user's narrow width after a zoom round-trip", () => {
    const { rerender } = render(tree())
    const narrow = sidebarMinWidth(true, 100)
    drag(narrow)
    expect(width()).toBe(narrow)

    // Zoom in: the floor rises past the chosen width, so the sidebar widens.
    mockZoom.zoomLevel = 200
    rerender(tree())
    const wideFloor = sidebarMinWidth(true, 200)
    expect(wideFloor).toBeGreaterThan(narrow)
    expect(width()).toBe(wideFloor)

    // Zoom back out: the original choice comes back, not the widened value.
    mockZoom.zoomLevel = 100
    rerender(tree())
    expect(width()).toBe(narrow)
  })

  it("persists the raw width, so the round-trip survives a remount", () => {
    const narrow = sidebarMinWidth(true, 100)
    const first = render(tree())
    drag(narrow)
    first.unmount()

    render(tree())
    expect(width()).toBe(narrow)
  })
})
