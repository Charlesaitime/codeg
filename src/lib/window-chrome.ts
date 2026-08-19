/**
 * Shared geometry for the desktop window-chrome corner overlays.
 *
 * The sidebar toggle / remote (top-left) and terminal / aux / settings
 * (top-right) clusters are pinned to fixed overlays at the window's corners so
 * they never move — and never re-mount — when the side panels open or close
 * (that re-parenting is what used to make them flicker). Because the overlays
 * float ABOVE whichever column owns that edge, the column must reserve exactly
 * the overlay's width so its tabs / content never render underneath. Keeping the
 * overlay width and the column reservation in one place guarantees they agree.
 */

/**
 * Clearance for the native macOS traffic lights, which float over the window's
 * top-left corner (nudged to Y=21 for the h-10 bar in the Rust window config).
 * The left cluster sits to their right.
 */
export const MAC_TRAFFIC_LIGHT_INSET = 76

/**
 * Windows/Linux caption buttons (min / max / close) occupy the window's
 * top-right corner. Mirrors `WINDOW_CONTROLS_WIDTH` in window-controls.tsx; the
 * right cluster sits to their left.
 */
export const WINDOW_CAPTION_WIDTH = 138

/** Left cluster: sidebar toggle + remote (two icon buttons + padding). */
export const LEFT_CHROME_CLUSTER = 80

/**
 * Right cluster: terminal + aux + settings (three icon buttons + padding).
 * A full-page workbench route swaps the first two for its own controls (see
 * `WorkbenchRouteChromeActions`), so the count — and this reservation — holds.
 */
export const RIGHT_CHROME_CLUSTER = 116

/**
 * The sidebar header's OWN trailing cluster: locate-active + view-options (two
 * `h-6 w-6` icon buttons, a `gap-0.5` between them) plus the header's `pr-2`.
 * rem-sized, so it scales with zoom exactly like {@link LEFT_CHROME_CLUSTER}.
 */
export const SIDEBAR_TRAILING_CLUSTER = 58

/**
 * How narrow the sidebar may get before its CONTENT stops being worth showing,
 * independent of what the header needs. A session row still has to fit an agent
 * icon, a readable stretch of title, a branch chip and a timestamp; below this
 * the title truncates to a few characters and the list answers nothing.
 *
 * Not zoom-scaled: zoom already enlarges the text inside the rows, so the
 * number of CHARACTERS visible at a given pixel width is roughly what changes,
 * and the "worth showing" threshold tracks pixels rather than rem.
 */
export const SIDEBAR_CONTENT_MIN = 200

/**
 * Scale a DOM button-cluster width by the app's rem-based zoom.
 *
 * The app "zoom" scales the root font-size (`documentElement.style.fontSize =
 * 16 * zoom/100`, see AppearanceProvider), so the rem-sized chrome buttons
 * (`h-6 w-6`, `gap-1`, `pl-3`/`pr-3`) grow with zoom. Their containers must grow
 * by the same factor or the buttons overflow and get clipped at high zoom. The
 * NATIVE insets do NOT scale this way — the macOS traffic lights keep a constant
 * horizontal inset (only their Y shifts with zoom, see `traffic_light_position_at`
 * in commands/windows.rs) and the Windows/Linux caption buttons are fixed 46px
 * each — so callers add those separately, outside this helper.
 */
function scaleCluster(px: number, zoom: number): number {
  return Math.round((px * zoom) / 100)
}

/**
 * Width the window's left-edge column reserves for the left overlay.
 * `macInset` adds the traffic-light clearance (desktop macOS only); `zoom` (a
 * percent, default 100) scales the rem-sized button cluster to match the buttons
 * inside it, while the native traffic-light inset stays fixed.
 */
export function leftChromeReserve(macInset: boolean, zoom = 100): number {
  return (
    (macInset ? MAC_TRAFFIC_LIGHT_INSET : 0) +
    scaleCluster(LEFT_CHROME_CLUSTER, zoom)
  )
}

/**
 * The narrowest the left sidebar may be dragged.
 *
 * Derived rather than a constant because both terms move: the left overlay
 * carries the macOS traffic-light inset only on desktop macOS, and both button
 * clusters grow with the app's zoom. A fixed floor that clears the header at
 * 100% zoom silently overlaps the buttons at 150% — which is exactly the bug
 * the "one place defines the reservation" rule at the top of this file exists
 * to prevent, applied to the resize limit instead of the padding.
 *
 * The header's need and the content's need are independent lower bounds, so the
 * answer is whichever binds.
 */
export function sidebarMinWidth(macInset: boolean, zoom = 100): number {
  const headerNeeds =
    leftChromeReserve(macInset, zoom) +
    scaleCluster(SIDEBAR_TRAILING_CLUSTER, zoom)
  return Math.max(headerNeeds, SIDEBAR_CONTENT_MIN)
}

/**
 * Width the window's right-edge column reserves for the right overlay.
 * `winLinuxCaption` adds the native caption-button strip (desktop Win/Linux);
 * `zoom` (a percent, default 100) scales the rem-sized button cluster, while the
 * fixed native caption strip stays constant.
 */
export function rightChromeReserve(
  winLinuxCaption: boolean,
  zoom = 100
): number {
  return (
    scaleCluster(RIGHT_CHROME_CLUSTER, zoom) +
    (winLinuxCaption ? WINDOW_CAPTION_WIDTH : 0)
  )
}

/**
 * The right-edge overlay's OWN width — just the (zoom-scaled) button cluster.
 * The native caption strip isn't part of this box; it's cleared by the overlay's
 * `right` offset (see `FolderLayoutShell`), so only the cluster is measured here.
 */
export function rightChromeClusterWidth(zoom = 100): number {
  return scaleCluster(RIGHT_CHROME_CLUSTER, zoom)
}
