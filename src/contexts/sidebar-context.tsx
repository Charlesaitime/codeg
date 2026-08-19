"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  loadPersistedPanelState,
  savePersistedPanelState,
} from "@/lib/panel-state-storage"
import { sidebarMinWidth } from "@/lib/window-chrome"
import { isDesktop } from "@/lib/platform"
import { usePlatform } from "@/hooks/use-platform"
import { useZoomLevel } from "@/hooks/use-appearance"

const STORAGE_KEY = "workspace:left-sidebar"

const DEFAULT_WIDTH = 320
const MAX_WIDTH = 900
const DEFAULT_IS_OPEN = true

interface SidebarContextValue {
  isOpen: boolean
  restored: boolean
  width: number
  minWidth: number
  maxWidth: number
  toggle: () => void
  setWidth: (w: number) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebarContext() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    throw new Error("useSidebarContext must be used within SidebarProvider")
  }
  return ctx
}

function clampWidth(width: number, minWidth: number) {
  return Math.max(minWidth, Math.min(MAX_WIDTH, width))
}

interface SidebarProviderProps {
  children: ReactNode
}

export function SidebarProvider({ children }: SidebarProviderProps) {
  const storageKey = STORAGE_KEY
  const [isOpen, setIsOpen] = useState(DEFAULT_IS_OPEN)
  const [width, setWidthState] = useState(DEFAULT_WIDTH)
  const [restored, setRestored] = useState(false)
  const { isMac } = usePlatform()
  const { zoomLevel } = useZoomLevel()

  // The floor is DERIVED, not a constant: the header it has to clear is wider
  // on desktop macOS (traffic-light inset) and grows with the app's zoom, so a
  // fixed number either wastes room at 100% or lets the header buttons overlap
  // at 150%. `usePlatform` resolves after a frame — until then this reads as
  // non-mac, which only ever yields a SMALLER floor, so nothing is forced
  // narrower than it should be and the effect below corrects the width once the
  // real platform lands.
  const minWidth = useMemo(
    () => sidebarMinWidth(isMac && isDesktop(), zoomLevel),
    [isMac, zoomLevel]
  )

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  // Stores the user's RAW intent, clamped only at the ceiling. The floor is
  // applied when the value is READ (below), never when it is written — see
  // `effectiveWidth` for why that distinction matters.
  const setWidth = useCallback((w: number) => {
    setWidthState(Math.min(w, MAX_WIDTH))
  }, [])

  useEffect(() => {
    const stored = loadPersistedPanelState(storageKey)
    // On mobile (< 768px), always start closed regardless of persisted state.
    const isMobileViewport = window.innerWidth < 768
    const defaultOpen = isMobileViewport ? false : DEFAULT_IS_OPEN
    // Hydrate from localStorage after mount to keep SSR/CSR markup consistent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOpen(isMobileViewport ? false : (stored?.isOpen ?? defaultOpen))
    setWidthState(stored?.width ?? DEFAULT_WIDTH)
    setRestored(true)
    // Deliberately NOT clamped here, and `minWidth` is deliberately not a
    // dependency: the restore runs once, and the effect below owns keeping the
    // width inside the (moving) range from then on.
  }, [storageKey])

  /**
   * What consumers actually lay out with: the stored width pushed up to the
   * current floor when it no longer fits.
   *
   * DERIVED rather than written back into state, so raising the floor never
   * destroys the width the user chose. Zooming to 150% lifts the floor above a
   * narrow sidebar and widens it — and zooming back to 100% has to return it to
   * the width the user dragged, not strand it at the wider value. Storing the
   * clamped number would lose that original intent the moment the floor moved.
   */
  const effectiveWidth = useMemo(
    () => clampWidth(width, minWidth),
    [width, minWidth]
  )

  useEffect(() => {
    if (!restored) return
    // The RAW width, deliberately — persisting the floor-clamped one would bake
    // a temporary zoom-driven widening into the stored preference.
    savePersistedPanelState(storageKey, { isOpen, width })
  }, [isOpen, restored, storageKey, width])

  const value = useMemo(
    () => ({
      isOpen,
      restored,
      width: effectiveWidth,
      minWidth,
      maxWidth: MAX_WIDTH,
      toggle,
      setWidth,
    }),
    [isOpen, restored, effectiveWidth, minWidth, toggle, setWidth]
  )

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  )
}
