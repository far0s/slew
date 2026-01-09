import {
  Suspense,
  useCallback,
  useRef,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import * as Select from "@radix-ui/react-select";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Cross2Icon,
  MagnifyingGlassIcon,
  PlusIcon,
  CopyIcon,
  SpeakerOffIcon,
} from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "motion/react";
import type { SketchId, SketchProps, SketchGroup } from "../../sketches";
import {
  SKETCH_GROUPS,
  SKETCH_COMPONENT_REGISTRY,
  SketchLoadingFallback,
  getSketchDescriptor,
} from "../../sketches";
import type { Slot } from "../../slots/useSlots";
import { SlotParameterControls } from "../SlotParameterControls";
import { WebGPUCanvas } from "../../renderer/WebGPUCanvas";
import { StreamedPreview } from "../StreamedPreview";
import type { AudioMapping } from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import type { MidiMapping, MidiPickupState } from "../../inputs/midi";
import styles from "./SlotColumn.module.css";

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
  params?: SketchProps["params"];
  previewParams?: SketchProps["params"];
  colors?: SketchProps["colors"];
  alpha?: number;
  audioReactivity?: number;
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
}

function getSketchLabel(sketchId: SketchId): string {
  for (const group of SKETCH_GROUPS) {
    const descriptor = group.sketches.find((s) => s.id === sketchId);
    if (descriptor) return descriptor.shortLabel;
  }
  return sketchId;
}

function SketchGroupSection({
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
                aria-label={`Add ${descriptor.label} to slot ${displayNumber}`}
              >
                <PlusIcon className={styles.inlineSketchItemIcon} />
                <span className={styles.inlineSketchItemLabel}>
                  {descriptor.shortLabel}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InlineSketchBrowser({
  slotIndex,
  filledSlots,
  onSelectSketch,
  onCopySlot,
}: {
  slotIndex: number;
  filledSlots: Array<Slot & { sketchId: SketchId }>;
  onSelectSketch: (sketchId: SketchId) => void;
  onCopySlot?: (sourceSlotIndex: number) => void;
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
      className={styles.emptyColumn}
      aria-label={`Slot ${displayNumber} - choose a sketch`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      layout
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
}

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

  const containerStyle = {
    "--renderer-aspect-ratio": aspectRatio,
  } as React.CSSProperties;

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
export function SlotColumn({
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
  params,
  previewParams,
  colors,
  alpha = 1,
  audioReactivity = 1,
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
}: SlotColumnProps) {
  const [isSlotStreaming, setIsSlotStreaming] = useState(false);

  if (sketchId === null) {
    return (
      <InlineSketchBrowser
        slotIndex={slotIndex}
        filledSlots={filledSlots}
        onSelectSketch={onSketchChange}
        onCopySlot={onCopyToSlot}
      />
    );
  }

  const SketchComponent = SKETCH_COMPONENT_REGISTRY[sketchId];
  const displayLabel = getSketchLabel(sketchId);
  const displayNumber = slotIndex + 1;

  const isSelectDisabled = isActive || isCrossfading;
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

  const showRemoveButton = canRemove && !isActive;

  const columnClassNames = [
    styles.column,
    isActive && styles.activeColumn,
    isMacropadSelected && !isActive && styles.macropadSelected,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.article
      className={columnClassNames}
      aria-label={`Slot ${displayNumber}${isMacropadSelected ? " (macropad selected)" : ""}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      layout
    >
      <PreviewContainer aspectRatio={rendererAspectRatio}>
        {SketchComponent ? (
          <Suspense fallback={<div className={styles.fallback}>Loading…</div>}>
            <SlotPreview
              slotIndex={slotIndex}
              SketchComponent={SketchComponent}
              params={previewParams ?? params}
              colors={colors}
              onStreamingChange={setIsSlotStreaming}
            />
            {(alpha < 0.99 || audioReactivity < 0.5) && (
              <div className={styles.alphaOverlay}>
                {audioReactivity < 0.5 && (
                  <span className={styles.mutedIndicator} title="Audio muted">
                    <SpeakerOffIcon />
                  </span>
                )}
                {alpha < 0.99 && (
                  <span className={styles.alphaValue}>
                    {Math.round(alpha * 100)}%
                  </span>
                )}
              </div>
            )}
          </Suspense>
        ) : (
          <div className={styles.fallback}>Unknown sketch: {sketchId}</div>
        )}
        <div
          className={`${styles.slotBadge} ${isMacropadSelected ? styles.slotBadgeSelected : ""}`}
          title={isSlotStreaming ? "Streamed from Renderer" : "Local preview"}
        >
          <span
            className={
              isSlotStreaming
                ? styles.streamDotActive
                : styles.streamDotInactive
            }
          />
          {displayNumber}
          {isMacropadSelected && (
            <span className={styles.macropadIndicator}>⎈</span>
          )}
        </div>

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

            {showRemoveButton && (
              <button
                type="button"
                className={styles.removeButton}
                onClick={onRemove}
                aria-label={`Remove slot ${displayNumber}`}
              >
                <Cross2Icon />
              </button>
            )}
          </div>
        </div>
      </PreviewContainer>

      <div className={styles.controls}>
        <SlotParameterControls
          slotIndex={slotIndex}
          sketchId={sketchId}
          getValue={getValue}
          setValue={setValue}
          audioMappings={audioMappings}
          modulationTargets={modulationTargets}
          lfos={lfos}
          midiMappings={midiMappings}
          midiPickupStates={midiPickupStates}
        />
      </div>
    </motion.article>
  );
}

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
}: {
  slotIndex: number;
  SketchComponent: React.ComponentType<SketchProps>;
  params?: SketchProps["params"];
  colors?: SketchProps["colors"];
  onStreamingChange?: (isStreaming: boolean) => void;
}) {
  // Whether streaming is enabled in backend config
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  // Whether we've received at least one frame (commit to streaming)
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  // Key to force StreamedPreview remount (for manual refresh)
  const [refreshKey, setRefreshKey] = useState(0);

  const source = useMemo(() => `slot-${slotIndex}` as const, [slotIndex]);

  // Handle click to refresh - remount StreamedPreview to reconnect
  const handleRefreshClick = useCallback(() => {
    setHasReceivedFrame(false);
    onStreamingChange?.(false);
    setRefreshKey((k) => k + 1);
  }, [onStreamingChange]);

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
  }, [onStreamingChange]);

  // Use streamed preview once we've received a frame and streaming is enabled
  const useStreamedPreview = streamingEnabled && hasReceivedFrame;

  return (
    <div
      className={styles.slotPreviewWrapper}
      onClick={handleRefreshClick}
      title="Click to refresh preview"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleRefreshClick();
        }
      }}
    >
      <WebGPUCanvas
        camera={{ position: [0, 0, 4], fov: 50 }}
        frameloop="always"
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
