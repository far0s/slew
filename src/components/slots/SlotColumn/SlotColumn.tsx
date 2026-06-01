import {
  Suspense,
  memo,
  useCallback,
  useRef,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { useSketchThumbnailHover } from "@/components/slots/SketchThumbnailPopover/SketchThumbnailPopover";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import * as Select from "@radix-ui/react-select";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Cross2Icon,
  EnterFullScreenIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  CopyIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import NumberFlow from "@number-flow/react";
import { motion, AnimatePresence } from "motion/react";
import type { SketchId, SketchProps, SketchGroup } from "@/sketches";
import {
  SKETCH_GROUPS,
  SKETCH_COMPONENT_REGISTRY,
  SketchLoadingFallback,
  getSketchDescriptor,
} from "@/sketches";
import type { Slot } from "@/slots/useSlots";
import {
  SlotParameterControls,
  type SlotParameterControlsHandle,
} from "@/components/slots/SlotParameterControls";
import { WebGPUCanvas } from "@/renderer/WebGPUCanvas";
import { StreamedPreview } from "@/components/preview/StreamedPreview";
import type { AudioMapping } from "@/inputs/audio";
import type { ModulationTarget, LfoSource } from "@/inputs/modulation";
import type { MidiMapping, MidiPickupState } from "@/inputs/midi";
import { PANEL_CONFIGS, type PanelId } from "@/panels/registry";
import styles from "./SlotColumn.module.css";

function DiceIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Top face */}
      <path d="M12 2L21 7L12 12L3 7Z" fill="currentColor" fillOpacity="0.95" />
      {/* Left face */}
      <path d="M3 7L12 12V22L3 17Z" fill="currentColor" fillOpacity="0.5" />
      {/* Right face */}
      <path d="M21 7L12 12V22L21 17Z" fill="currentColor" fillOpacity="0.72" />
      {/* Top face — 1 dot */}
      <circle cx="12" cy="7" r="1" fill="var(--bg-elevated, #111)" />
      {/* Left face — 2 dots */}
      <circle cx="6.5" cy="12" r="0.85" fill="var(--bg-elevated, #111)" />
      <circle cx="9" cy="18" r="0.85" fill="var(--bg-elevated, #111)" />
      {/* Right face — 3 dots */}
      <circle cx="15" cy="10.5" r="0.85" fill="var(--bg-elevated, #111)" />
      <circle cx="17.5" cy="14.5" r="0.85" fill="var(--bg-elevated, #111)" />
      <circle cx="15" cy="18.5" r="0.85" fill="var(--bg-elevated, #111)" />
    </svg>
  );
}

// Hoisted motion constants — stable references, Motion skips re-evaluation
const MOTION_INITIAL = { opacity: 0, scale: 0.95 };
const MOTION_ANIMATE_IDLE = { opacity: 1, scale: 1, x: 0 };
const MOTION_EXIT = { opacity: 0, scale: 0.95 };
const MOTION_TRANSITION_DRAG = { duration: 0 };
const MOTION_TRANSITION_NORMAL = { duration: 0.2, ease: "easeOut" };
const MOTION_STYLE_IDLE = {} as React.CSSProperties;
const MOTION_STYLE_DRAGGING = { zIndex: 10 } as React.CSSProperties;

// Session storage key for persisting search across slot browsers
const SKETCH_SEARCH_STORAGE_KEY = "slew-sketch-search";

/**
 * Hook for managing sketch search state with session persistence.
 * Search query is shared across all slot browsers via sessionStorage.
 */
function useSketchSearch() {
  const [query, setQueryState] = useState(() => {
    try {
      return sessionStorage.getItem(SKETCH_SEARCH_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);
    try {
      if (newQuery) {
        sessionStorage.setItem(SKETCH_SEARCH_STORAGE_KEY, newQuery);
      } else {
        sessionStorage.removeItem(SKETCH_SEARCH_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  return { query, setQuery };
}

/**
 * Check if a sketch matches the search query.
 * Matches against label, shortLabel, and description (case-insensitive).
 */
function sketchMatchesQuery(
  sketch: { label: string; shortLabel: string; description?: string },
  query: string,
): boolean {
  if (!query.trim()) return true;
  const lowerQuery = query.toLowerCase().trim();
  return (
    sketch.label.toLowerCase().includes(lowerQuery) ||
    sketch.shortLabel.toLowerCase().includes(lowerQuery) ||
    (sketch.description?.toLowerCase().includes(lowerQuery) ?? false)
  );
}

/**
 * Filter sketch groups based on search query.
 * Returns groups with only matching sketches, excluding empty groups.
 */
function filterSketchGroups(
  groups: SketchGroup[],
  query: string,
): SketchGroup[] {
  if (!query.trim()) return groups;

  return groups
    .map((group) => ({
      ...group,
      sketches: group.sketches.filter((sketch) =>
        sketchMatchesQuery(sketch, query),
      ),
    }))
    .filter((group) => group.sketches.length > 0);
}
// ============================================================================
// PanelSlotContent
// ============================================================================

function PanelSlotContent({
  slotIndex,
  panelId,
  filledSlots,
  onClose,
  onHighlightParams,
  isDragging = false,
  dragOffsetX = 0,
  onDragStart,
  layoutDependency,
}: {
  slotIndex: number;
  panelId: PanelId;
  filledSlots: Array<Slot & { sketchId: SketchId }>;
  onClose: () => void;
  onHighlightParams?: (ids: Set<string>) => void;
  isDragging?: boolean;
  dragOffsetX?: number;
  onDragStart?: (e: React.PointerEvent) => void;
  layoutDependency?: unknown;
}) {
  const config = PANEL_CONFIGS.find((p) => p.id === panelId);
  const displayNumber = slotIndex + 1;

  return (
    <motion.article
      className={`${styles.panelColumn}${isDragging ? " " + styles.dragging : ""}`}
      aria-label={`Slot ${displayNumber} - ${config?.label ?? panelId} panel`}
      initial={MOTION_INITIAL}
      animate={
        isDragging
          ? { opacity: 1, scale: 1, x: dragOffsetX }
          : MOTION_ANIMATE_IDLE
      }
      exit={MOTION_EXIT}
      transition={
        isDragging ? MOTION_TRANSITION_DRAG : MOTION_TRANSITION_NORMAL
      }
      layout={!isDragging}
      layoutDependency={layoutDependency}
      style={isDragging ? MOTION_STYLE_DRAGGING : MOTION_STYLE_IDLE}
      onPointerDown={onDragStart}
    >
      <div className={styles.panelColumnHeader}>
        <div className={styles.inlineSlotBadge}>{displayNumber}</div>
        <span className={styles.panelColumnTitle}>
          {config?.label ?? panelId}
        </span>
        <button
          type="button"
          className={styles.panelColumnClose}
          onClick={onClose}
          aria-label={`Close ${config?.label ?? panelId} panel`}
        >
          <Cross2Icon />
        </button>
      </div>
      <div className={styles.panelColumnBody} data-nodrag>
        {config?.render({ slots: filledSlots, onHighlightParams })}
      </div>
    </motion.article>
  );
}

export interface SlotColumnProps {
  slotIndex: number;
  sketchId: SketchId | null;
  isActive: boolean;
  isCrossfadeTarget: boolean;
  crossfadeProgress: number;
  isCrossfading: boolean;
  isMacropadSelected?: boolean;
  /** Aspect ratio from the Renderer window (width/height). Defaults to 16/9. */
  rendererAspectRatio?: number;
  excludeSketchIds: SketchId[];
  canRemove: boolean;
  getSlotSketchParams?: (
    slotIndex: number,
    sketchId: SketchId,
  ) => SketchProps["params"];
  getSlotSketchParamsInterpolated?: (
    slotIndex: number,
    sketchId: SketchId,
  ) => SketchProps["params"];
  colors?: SketchProps["colors"];
  alpha?: number;

  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  audioMappings?: AudioMapping[];
  modulationTargets?: ModulationTarget[];
  lfos?: LfoSource[];
  midiMappings?: MidiMapping[];
  midiPickupStates?: Map<string, MidiPickupState>;
  filledSlots?: Array<Slot & { sketchId: SketchId }>;
  onSketchChange: (sketchId: SketchId) => void;
  onCrossfade: () => void;
  onRemove: () => void;
  onCopyToSlot?: (sourceSlotIndex: number) => void;
  onQuickBeat?: (parameterId: string, paramMax: number) => void;
  onQuickLfo?: (
    parameterId: string,
    paramMin: number,
    paramMax: number,
  ) => void;
  onUnlinkBeat?: (parameterId: string) => void;
  onUnlinkLfo?: (parameterId: string) => void;
  highlightedParamIds?: Set<string>;
  onHighlightParams?: (ids: Set<string>) => void;
  onOpenOverlay?: () => void;
  /** When true, the slot preview canvas is paused (overlay is open for another slot) */
  isPreviewPaused?: boolean;
  /** When true, the slot is suspended — no rendering, preview frozen */
  isSuspended?: boolean;
  onSuspend?: () => void;
  onResume?: () => void;
  panelId?: PanelId | null;
  onOpenPanel?: (panelId: PanelId) => void;
  onClosePanel?: () => void;
  isDragging?: boolean;
  dragOffsetX?: number;
  onDragStart?: (e: React.PointerEvent) => void;
  layoutDependency?: unknown;
}

function getSketchLabel(sketchId: SketchId): string {
  for (const group of SKETCH_GROUPS) {
    const descriptor = group.sketches.find((s) => s.id === sketchId);
    if (descriptor) return descriptor.shortLabel;
  }
  return sketchId;
}

const SketchGroupSection = memo(function SketchGroupSection({
  group,
  slotIndex,
  onSelectSketch,
  defaultExpanded = true,
  isSearching = false,
  totalCount,
}: {
  group: SketchGroup;
  slotIndex: number;
  onSelectSketch: (sketchId: SketchId) => void;
  defaultExpanded?: boolean;
  isSearching?: boolean;
  totalCount?: number;
}) {
  // Auto-expand when searching, otherwise use default
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { onMouseEnter, onMouseLeave, popover } = useSketchThumbnailHover();
  const displayNumber = slotIndex + 1;

  // Auto-expand groups when searching
  const effectiveExpanded = isSearching ? true : isExpanded;

  // Show "X of Y" when searching, otherwise just show count
  const countDisplay =
    isSearching && totalCount !== undefined
      ? `${group.sketches.length}/${totalCount}`
      : group.sketches.length;

  return (
    <div className={styles.sketchGroup}>
      <button
        type="button"
        className={styles.sketchGroupHeader}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={effectiveExpanded}
        aria-controls={`group-${group.id}-sketches`}
      >
        <span
          className={`${styles.sketchGroupChevron} ${effectiveExpanded ? styles.sketchGroupChevronExpanded : ""}`}
        >
          <ChevronRightIcon />
        </span>
        <span className={styles.sketchGroupLabel}>{group.label}</span>
        <span className={styles.sketchGroupCount}>{countDisplay}</span>
      </button>
      <AnimatePresence initial={false}>
        {effectiveExpanded && (
          <motion.div
            id={`group-${group.id}-sketches`}
            className={styles.sketchGroupItems}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {group.sketches.map((descriptor) => (
              <button
                key={descriptor.id}
                type="button"
                className={styles.inlineSketchItem}
                onClick={() => onSelectSketch(descriptor.id as SketchId)}
                onMouseEnter={(e) => onMouseEnter(e, descriptor.thumbnail)}
                onMouseLeave={onMouseLeave}
                aria-label={`Add ${descriptor.label} to slot ${displayNumber}`}
              >
                <PlusIcon className={styles.inlineSketchItemIcon} />
                <span className={styles.inlineSketchItemLabel}>
                  {descriptor.shortLabel}
                </span>
              </button>
            ))}
            {popover}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const InlineSketchBrowser = memo(function InlineSketchBrowser({
  slotIndex,
  filledSlots,
  onSelectSketch,
  onCopySlot,
  onOpenPanel,
  isDragging = false,
  dragOffsetX = 0,
  onDragStart,
  layoutDependency,
}: {
  slotIndex: number;
  filledSlots: Array<Slot & { sketchId: SketchId }>;
  onSelectSketch: (sketchId: SketchId) => void;
  onCopySlot?: (sourceSlotIndex: number) => void;
  onOpenPanel?: (panelId: PanelId) => void;
  isDragging?: boolean;
  dragOffsetX?: number;
  onDragStart?: (e: React.PointerEvent) => void;
  layoutDependency?: unknown;
}) {
  const displayNumber = slotIndex + 1;
  const { query, setQuery } = useSketchSearch();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSelectSketch = useCallback(
    (sketchId: SketchId) => {
      onSelectSketch(sketchId);
    },
    [onSelectSketch],
  );

  const handleClearSearch = useCallback(() => {
    setQuery("");
    searchInputRef.current?.focus();
  }, [setQuery]);

  // Filter groups based on search query
  const filteredGroups = useMemo(
    () => filterSketchGroups(SKETCH_GROUPS, query),
    [query],
  );

  // Create a map of original group sizes for "X of Y" display
  const originalGroupCounts = useMemo(
    () =>
      SKETCH_GROUPS.reduce(
        (acc, group) => {
          acc[group.id] = group.sketches.length;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [],
  );

  const isSearching = query.trim().length > 0;
  const totalMatches = filteredGroups.reduce(
    (sum, group) => sum + group.sketches.length,
    0,
  );

  return (
    <motion.article
      className={`${styles.emptyColumn}${isDragging ? " " + styles.dragging : ""}`}
      aria-label={`Slot ${displayNumber} - choose a sketch`}
      initial={MOTION_INITIAL}
      animate={
        isDragging
          ? { opacity: 1, scale: 1, x: dragOffsetX }
          : MOTION_ANIMATE_IDLE
      }
      exit={MOTION_EXIT}
      transition={
        isDragging ? MOTION_TRANSITION_DRAG : MOTION_TRANSITION_NORMAL
      }
      layout={!isDragging}
      layoutDependency={layoutDependency}
      style={isDragging ? MOTION_STYLE_DRAGGING : MOTION_STYLE_IDLE}
      onPointerDown={onDragStart}
    >
      <div className={styles.inlineBrowserHeader}>
        <div className={styles.inlineSlotBadge}>{displayNumber}</div>
        <span className={styles.inlineBrowserTitle}>Choose a sketch</span>
      </div>

      <div className={styles.searchContainer}>
        <MagnifyingGlassIcon className={styles.searchIcon} />
        <input
          ref={searchInputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search sketches…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sketches"
        />
        {isSearching && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={handleClearSearch}
            aria-label="Clear search"
          >
            <Cross2Icon />
          </button>
        )}
      </div>

      <div className={styles.inlineSketchList}>
        {filteredGroups.length > 0 ? (
          filteredGroups.map((group) => (
            <SketchGroupSection
              key={group.id}
              group={group}
              slotIndex={slotIndex}
              onSelectSketch={handleSelectSketch}
              defaultExpanded={true}
              isSearching={isSearching}
              totalCount={originalGroupCounts[group.id]}
            />
          ))
        ) : (
          <div className={styles.noResults}>
            <span className={styles.noResultsText}>
              No sketches match "{query}"
            </span>
            <button
              type="button"
              className={styles.noResultsClear}
              onClick={handleClearSearch}
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {isSearching && filteredGroups.length > 0 && (
        <div className={styles.searchResultsCount} aria-live="polite">
          {totalMatches} {totalMatches === 1 ? "sketch" : "sketches"} found
        </div>
      )}

      {onOpenPanel && (
        <div className={styles.inlinePanelSection}>
          <span className={styles.inlineCopySectionLabel}>Open panel</span>
          <div className={styles.inlinePanelOptions}>
            {PANEL_CONFIGS.map((panel) => (
              <button
                key={panel.id}
                type="button"
                className={styles.inlinePanelButton}
                onClick={() => onOpenPanel(panel.id)}
              >
                {panel.shortLabel}
              </button>
            ))}
          </div>
        </div>
      )}

      {filledSlots.length > 0 && onCopySlot && (
        <div className={styles.inlineCopySection}>
          <span className={styles.inlineCopySectionLabel}>Or copy from</span>
          <div className={styles.inlineCopyOptions}>
            {filledSlots.map((slot) => {
              const sketchLabel =
                getSketchDescriptor(slot.sketchId)?.shortLabel ?? slot.sketchId;
              return (
                <button
                  key={`copy-${slot.index}`}
                  type="button"
                  className={styles.inlineCopyButton}
                  onClick={() => onCopySlot(slot.index)}
                  aria-label={`Copy from slot ${slot.index + 1}`}
                >
                  <CopyIcon className={styles.inlineCopyIcon} />
                  <span className={styles.inlineCopySlotNumber}>
                    {slot.index + 1}
                  </span>
                  <span className={styles.inlineCopySketchName}>
                    {sketchLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </motion.article>
  );
});

/**
 * PreviewContainer wraps the 3D canvas preview and ensures proper sizing.
 * The r3f Canvas has issues with initial sizing when the container uses CSS
 * aspect-ratio. We trigger a resize event after mount to force recalculation.
 * CSS handles the actual sizing via absolute positioning on the canvas container.
 */
function PreviewContainer({
  children,
  aspectRatio = 16 / 9,
}: {
  children: ReactNode;
  aspectRatio?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger resize after mount to ensure Canvas recalculates its size
    // This is needed because CSS aspect-ratio may not be computed at first render
    const timeoutId = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, []);

  const containerStyle = useMemo(
    () => ({ "--renderer-aspect-ratio": aspectRatio }) as React.CSSProperties,
    [aspectRatio],
  );

  return (
    <div
      ref={containerRef}
      className={styles.previewContainer}
      style={containerStyle}
    >
      {children}
    </div>
  );
}

// A single column in the slot management UI containing preview, selector, and controls.
export const SlotColumn = memo(function SlotColumn({
  slotIndex,
  sketchId,
  isActive,
  isCrossfadeTarget,
  crossfadeProgress,
  isCrossfading,
  isMacropadSelected = false,
  rendererAspectRatio = 16 / 9,
  excludeSketchIds,
  canRemove,
  getSlotSketchParams,
  getSlotSketchParamsInterpolated,
  colors,
  alpha = 1,

  getValue,
  setValue,
  audioMappings,
  modulationTargets,
  lfos,
  midiMappings,
  midiPickupStates,
  onSketchChange,
  onCrossfade,
  onRemove,
  filledSlots = [],
  onCopyToSlot,
  onQuickBeat,
  onQuickLfo,
  onUnlinkBeat,
  onUnlinkLfo,
  highlightedParamIds,
  onHighlightParams,
  onOpenOverlay,
  isPreviewPaused = false,
  isSuspended = false,
  onSuspend,
  onResume,
  panelId,
  onOpenPanel,
  onClosePanel,
  isDragging = false,
  dragOffsetX = 0,
  onDragStart,
  layoutDependency,
}: SlotColumnProps) {
  const params = useMemo(
    () =>
      sketchId && getSlotSketchParams
        ? getSlotSketchParams(slotIndex, sketchId)
        : undefined,
    [getSlotSketchParams, slotIndex, sketchId],
  );
  const previewParams = useMemo(
    () =>
      sketchId && getSlotSketchParamsInterpolated
        ? getSlotSketchParamsInterpolated(slotIndex, sketchId)
        : undefined,
    [getSlotSketchParamsInterpolated, slotIndex, sketchId],
  );

  const paramControlsRef = useRef<SlotParameterControlsHandle>(null);

  const [isSlotStreaming, setIsSlotStreaming] = useState(false);
  const [isPreviewHidden, setIsPreviewHidden] = useState(false);
  const [slotRefreshKey, setSlotRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompletingSpin, setIsCompletingSpin] = useState(false);
  const completingSpinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSlotBadgeClick = useCallback(() => {
    setIsSlotStreaming(false);
    setIsCompletingSpin(false);
    if (completingSpinTimerRef.current)
      clearTimeout(completingSpinTimerRef.current);
    if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    setIsRefreshing(true);
    setSlotRefreshKey((k) => k + 1);
    spinTimeoutRef.current = setTimeout(() => {
      setIsRefreshing(false);
      setIsCompletingSpin(true);
      completingSpinTimerRef.current = setTimeout(
        () => setIsCompletingSpin(false),
        700,
      );
    }, 2000);
  }, []);

  const handleStreamingChange = useCallback((streaming: boolean) => {
    setIsSlotStreaming(streaming);
    if (streaming) {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
      setIsRefreshing(false);
      setIsCompletingSpin(true);
      completingSpinTimerRef.current = setTimeout(
        () => setIsCompletingSpin(false),
        700,
      );
    }
  }, []);

  useEffect(() => {
    return () => {
      if (completingSpinTimerRef.current)
        clearTimeout(completingSpinTimerRef.current);
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    emit("slot-preview-visibility-changed", {
      slotIndex,
      hidden: isPreviewHidden,
    });
  }, [slotIndex, isPreviewHidden]);

  useEffect(() => {
    emit("slot-suspended-changed", { slotIndex, suspended: isSuspended });
  }, [slotIndex, isSuspended]);

  if (sketchId === null && panelId) {
    return (
      <PanelSlotContent
        slotIndex={slotIndex}
        panelId={panelId}
        filledSlots={filledSlots ?? []}
        onClose={onClosePanel ?? (() => {})}
        onHighlightParams={onHighlightParams}
        isDragging={isDragging}
        dragOffsetX={dragOffsetX}
        onDragStart={onDragStart}
        layoutDependency={layoutDependency}
      />
    );
  }

  if (sketchId === null) {
    return (
      <InlineSketchBrowser
        slotIndex={slotIndex}
        filledSlots={filledSlots}
        onSelectSketch={onSketchChange}
        onCopySlot={onCopyToSlot}
        onOpenPanel={onOpenPanel}
        isDragging={isDragging}
        dragOffsetX={dragOffsetX}
        onDragStart={onDragStart}
        layoutDependency={layoutDependency}
      />
    );
  }

  const SketchComponent = SKETCH_COMPONENT_REGISTRY[sketchId];
  const displayLabel = getSketchLabel(sketchId);
  const displayNumber = slotIndex + 1;

  const isSelectDisabled = isCrossfading;
  const isCrossfadeDisabled = isActive || isCrossfading;

  let crossfadeButtonLabel: string;
  if (isActive && !isCrossfading) {
    crossfadeButtonLabel = "Active";
  } else if (isActive && isCrossfading) {
    crossfadeButtonLabel = `${Math.round(100 - crossfadeProgress)}%`;
  } else if (isCrossfadeTarget && isCrossfading) {
    crossfadeButtonLabel = `${Math.round(crossfadeProgress)}%`;
  } else {
    crossfadeButtonLabel = "Crossfade";
  }

  const showRemoveButton = canRemove;

  const columnClassNames = [
    styles.column,
    isActive && styles.activeColumn,
    isMacropadSelected && !isActive && styles.macropadSelected,
    isDragging && styles.dragging,
    isSuspended && styles.suspendedColumn,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.article
      className={columnClassNames}
      aria-label={`Slot ${displayNumber}${isMacropadSelected ? " (macropad selected)" : ""}`}
      initial={MOTION_INITIAL}
      animate={
        isDragging
          ? { opacity: 1, scale: 1, x: dragOffsetX }
          : MOTION_ANIMATE_IDLE
      }
      exit={MOTION_EXIT}
      transition={
        isDragging ? MOTION_TRANSITION_DRAG : MOTION_TRANSITION_NORMAL
      }
      layout={!isDragging}
      layoutDependency={layoutDependency}
      style={isDragging ? MOTION_STYLE_DRAGGING : MOTION_STYLE_IDLE}
      onPointerDown={onDragStart}
    >
      {/* Header strip */}
      <div className={styles.columnHeader}>
        <div
          className={`${styles.slotNumber} ${isMacropadSelected ? styles.slotNumberMacropad : ""}`}
        >
          {displayNumber}
          {isMacropadSelected && (
            <span className={styles.macropadIndicator}>⎈</span>
          )}
        </div>
        <span className={styles.columnSketchLabel}>{displayLabel}</span>
        <div className={styles.columnHeaderActions}>
          <button
            type="button"
            className={styles.headerIconButton}
            onClick={(e) => {
              e.stopPropagation();
              paramControlsRef.current?.randomize();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Randomize parameters"
            aria-label="Randomize parameters"
          >
            <DiceIcon />
          </button>
          <button
            type="button"
            className={`${styles.headerIconButton} ${isSuspended ? styles.headerIconButtonActive : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (isSuspended) onResume?.();
              else onSuspend?.();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={isSuspended ? "Resume slot" : "Suspend slot"}
            aria-label={isSuspended ? "Resume slot" : "Suspend slot"}
            aria-pressed={isSuspended}
          >
            {isSuspended ? <PlayIcon /> : <PauseIcon />}
          </button>
          <button
            type="button"
            className={styles.headerIconButton}
            onClick={(e) => {
              e.stopPropagation();
              setIsPreviewHidden((v) => !v);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={isPreviewHidden ? "Show preview" : "Hide preview"}
            aria-label={isPreviewHidden ? "Show preview" : "Hide preview"}
          >
            {isPreviewHidden ? <EyeOpenIcon /> : <EyeClosedIcon />}
          </button>
          {onOpenOverlay && (
            <button
              type="button"
              className={styles.headerIconButton}
              onClick={(e) => {
                e.stopPropagation();
                onOpenOverlay();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Open full editor"
              aria-label="Open full editor"
            >
              <EnterFullScreenIcon />
            </button>
          )}
          {showRemoveButton && (
            <button
              type="button"
              className={styles.headerRemoveButton}
              onClick={() => {
                onRemove();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Remove slot ${displayNumber}`}
            >
              <Cross2Icon />
            </button>
          )}
        </div>
      </div>

      <PreviewContainer aspectRatio={rendererAspectRatio}>
        {isPreviewHidden || isSuspended ? (
          <div className={styles.previewHiddenPlaceholder}>
            {isSuspended && (
              <div className={styles.suspendedBadge}>
                <PauseIcon />
                <span>Suspended</span>
              </div>
            )}
          </div>
        ) : SketchComponent ? (
          <Suspense fallback={<div className={styles.fallback}>Loading…</div>}>
            <SlotPreview
              slotIndex={slotIndex}
              SketchComponent={SketchComponent}
              params={previewParams ?? params}
              colors={colors}
              onStreamingChange={handleStreamingChange}
              externalRefreshKey={slotRefreshKey}
              paused={isPreviewPaused}
            />
          </Suspense>
        ) : (
          <div className={styles.fallback}>Unknown sketch: {sketchId}</div>
        )}

        {/* Stream indicator — top left */}
        <div
          className={`${styles.streamIndicator} ${isMacropadSelected ? styles.streamIndicatorMacropad : ""}`}
          title="Click to reconnect preview"
          onClick={handleSlotBadgeClick}
          onPointerDown={(e) => e.stopPropagation()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleSlotBadgeClick();
          }}
        >
          {isSlotStreaming ? (
            <span className={styles.streamDotActive} />
          ) : (
            <ReloadIcon
              className={`${styles.streamRefreshIcon} ${isRefreshing ? styles.streamRefreshIconSpinning : isCompletingSpin ? styles.streamRefreshIconCompleting : ""}`}
            />
          )}
        </div>

        {/* Alpha indicator — top right, only when < 1 */}
        {alpha < 0.99 && (
          <div className={styles.alphaIndicator}>
            <NumberFlow value={Math.round(alpha * 100)} />%
          </div>
        )}

        <div className={styles.bottomOverlay}>
          <div className={styles.selectorWrapper}>
            <Select.Root
              value={sketchId}
              disabled={isSelectDisabled}
              onValueChange={(v) => onSketchChange(v as SketchId)}
            >
              <Select.Trigger
                className={styles.selectTrigger}
                aria-label={`Slot ${displayNumber} sketch selection`}
              >
                <Select.Value>{displayLabel}</Select.Value>
                <Select.Icon className={styles.selectIcon}>
                  <ChevronDownIcon />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content
                  className={styles.selectContent}
                  position="popper"
                  sideOffset={4}
                >
                  <Select.Viewport className={styles.selectViewport}>
                    {SKETCH_GROUPS.map((group) => (
                      <Select.Group key={group.id}>
                        <Select.Label className={styles.selectGroupLabel}>
                          {group.label}
                        </Select.Label>
                        {group.sketches.map((descriptor) => {
                          const isExcluded =
                            descriptor.id !== sketchId &&
                            excludeSketchIds.includes(
                              descriptor.id as SketchId,
                            );
                          if (isExcluded) return null;
                          return (
                            <Select.Item
                              key={descriptor.id}
                              value={descriptor.id}
                              className={styles.selectItem}
                            >
                              <Select.ItemText>
                                {descriptor.shortLabel}
                              </Select.ItemText>
                            </Select.Item>
                          );
                        })}
                      </Select.Group>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          <div className={styles.actionsWrapper}>
            <button
              type="button"
              className={`${styles.crossfadeButton} ${isActive ? styles.crossfadeActive : ""} ${isCrossfadeTarget ? styles.crossfadeTarget : ""}`}
              onClick={onCrossfade}
              disabled={isCrossfadeDisabled}
            >
              {crossfadeButtonLabel}
            </button>
          </div>
        </div>
      </PreviewContainer>

      <div className={styles.controls} data-nodrag>
        <SlotParameterControls
          ref={paramControlsRef}
          slotIndex={slotIndex}
          sketchId={sketchId}
          getValue={getValue}
          setValue={setValue}
          audioMappings={audioMappings}
          modulationTargets={modulationTargets}
          lfos={lfos}
          midiMappings={midiMappings}
          midiPickupStates={midiPickupStates}
          highlightedParamIds={highlightedParamIds}
          onQuickBeat={onQuickBeat}
          onQuickLfo={onQuickLfo}
          onUnlinkBeat={onUnlinkBeat}
          onUnlinkLfo={onUnlinkLfo}
        />
      </div>
    </motion.article>
  );
});

/**
 * SlotPreview - Displays either streamed frames from Renderer or local rendering.
 *
 * Simplified streaming logic:
 * - Check config to see if streaming is enabled
 * - Once first frame is received, commit to streaming mode permanently
 * - No timeout-based fallback - if frames stop, show last valid frame
 * - Click to refresh: user can click to force reconnection if stuck
 */
function SlotPreview({
  slotIndex,
  SketchComponent,
  params,
  colors,
  onStreamingChange,
  externalRefreshKey = 0,
  paused = false,
}: {
  slotIndex: number;
  SketchComponent: React.ComponentType<SketchProps>;
  params?: SketchProps["params"];
  colors?: SketchProps["colors"];
  onStreamingChange?: (isStreaming: boolean) => void;
  externalRefreshKey?: number;
  paused?: boolean;
}) {
  // Whether streaming is enabled in backend config
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  // Whether we've received at least one frame (commit to streaming)
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  // Key to force StreamedPreview remount (for manual refresh)
  const [refreshKey, setRefreshKey] = useState(0);

  const source = useMemo(() => `slot-${slotIndex}` as const, [slotIndex]);

  // React to external refresh trigger (from parent badge click)
  useEffect(() => {
    if (externalRefreshKey === 0) return;
    setHasReceivedFrame(false);
    onStreamingChange?.(false);
    setRefreshKey((k) => k + 1);
  }, [externalRefreshKey, onStreamingChange]);

  // Check backend config periodically
  useEffect(() => {
    let mounted = true;
    const checkConfig = async () => {
      try {
        const config = await invoke<{
          enabled: boolean;
          stream_slots: boolean;
        }>("get_frame_distribution_config");
        const shouldEnable = config.enabled && config.stream_slots;
        if (mounted) setStreamingEnabled(shouldEnable);
      } catch {
        // Config fetch failed - streaming will remain disabled
      }
    };
    checkConfig();
    // Check less frequently - config doesn't change often
    const interval = setInterval(checkConfig, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [slotIndex]);

  // Called when StreamedPreview receives its first frame
  const handleFirstFrame = useCallback(() => {
    setHasReceivedFrame(true);
    onStreamingChange?.(true);
  }, [onStreamingChange, slotIndex]);

  // Use streamed preview once we've received a frame and streaming is enabled
  const useStreamedPreview = streamingEnabled && hasReceivedFrame;

  return (
    <div className={styles.slotPreviewWrapper}>
      <WebGPUCanvas
        key={refreshKey}
        camera={{ position: [0, 0, 4], fov: 50 }}
        frameloop={paused ? "never" : "always"}
        dpr={1}
        fallback={<div className={styles.fallback}>Initializing…</div>}
      >
        {/* Always render StreamedPreview when enabled - it will show last valid frame */}
        {streamingEnabled && (
          <StreamedPreview
            key={refreshKey}
            source={source}
            onFirstFrame={handleFirstFrame}
          />
        )}
        {/* Only render local sketch if we haven't received any streamed frames yet */}
        {!useStreamedPreview && (
          <>
            <color attach="background" args={["#020617"]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[4, 6, 3]} intensity={1.1} />
            <directionalLight position={[-4, -4, -2]} intensity={0.4} />
            <Suspense fallback={<SketchLoadingFallback />}>
              <SketchComponent opacity={1} params={params} colors={colors} />
            </Suspense>
          </>
        )}
      </WebGPUCanvas>
    </div>
  );
}

export default SlotColumn;
