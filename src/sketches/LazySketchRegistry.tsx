/**
 * LazySketchRegistry - Lazy-loaded sketch components for code splitting
 *
 * This module provides React.lazy() wrapped versions of all sketch components,
 * enabling on-demand loading when a sketch is first used. This reduces the
 * initial bundle size by deferring sketch code until needed.
 *
 * Key design decisions:
 * - All Aura presets share a single lazy import (they use the same component)
 * - Components are cached after first load (React.lazy default behavior)
 * - Fallback loading state handled by consumers via Suspense
 */

import { lazy, Suspense, type ComponentType } from "react";
import type { SketchProps } from "./types";

/**
 * Lazy-loaded sketch component type
 */
export type LazySketchComponent = React.LazyExoticComponent<
  ComponentType<SketchProps>
>;

// =============================================================================
// Lazy Imports
// =============================================================================

// Examples
const LazyBlueCube = lazy(() =>
  import("./Examples/BlueCube").then((m) => ({ default: m.BlueCube })),
);

const LazyOrangeCube = lazy(() =>
  import("./Examples/OrangeCube").then((m) => ({ default: m.OrangeCube })),
);

const LazyGreenPulse = lazy(() =>
  import("./Examples/GreenPulse").then((m) => ({ default: m.GreenPulse })),
);

const LazyTslText3D = lazy(() =>
  import("./Examples/TslText3D").then((m) => ({ default: m.TslText3D })),
);

const LazyTslNoiseBlob = lazy(() =>
  import("./Examples/TslNoiseBlob").then((m) => ({ default: m.TslNoiseBlob })),
);

// Advanced Examples
const LazyPlasma = lazy(() =>
  import("./AdvancedExamples/Plasma").then((m) => ({ default: m.Plasma })),
);

const LazyKaleidoscope = lazy(() =>
  import("./AdvancedExamples/Kaleidoscope").then((m) => ({
    default: m.Kaleidoscope,
  })),
);

const LazyFeedbackTunnel = lazy(() =>
  import("./AdvancedExamples/FeedbackTunnel").then((m) => ({
    default: m.FeedbackTunnel,
  })),
);

const LazyWaveform = lazy(() =>
  import("./AdvancedExamples/Waveform").then((m) => ({ default: m.Waveform })),
);

// Aura (shared by all presets)
const LazyAura = lazy(() =>
  import("./Aura").then((m) => ({ default: m.Aura })),
);

// =============================================================================
// Registry
// =============================================================================

/**
 * Registry mapping sketch IDs to lazy-loaded components.
 *
 * Note: All Aura presets point to the same LazyAura component since
 * they share the same rendering code with different default parameters.
 */
export const LAZY_SKETCH_REGISTRY: Record<string, LazySketchComponent> = {
  // Examples
  blueCube: LazyBlueCube,
  orangeCube: LazyOrangeCube,
  greenPulse: LazyGreenPulse,
  tslText3D: LazyTslText3D,
  tslNoiseBlob: LazyTslNoiseBlob,
  // Advanced Examples
  plasma: LazyPlasma,
  kaleidoscope: LazyKaleidoscope,
  feedbackTunnel: LazyFeedbackTunnel,
  waveform: LazyWaveform,
  // Aura presets (all use same component)
  auraOg: LazyAura,
  auraRoseGold: LazyAura,
  auraDeepBlue: LazyAura,
  auraSolarPlume: LazyAura,
  auraGhostLike: LazyAura,
  auraForestClearing: LazyAura,
  auraDefaultIntense: LazyAura,
  auraBlushNebula: LazyAura,
};

/**
 * Get a lazy-loaded sketch component by ID.
 *
 * @param sketchId - The sketch ID to look up
 * @returns The lazy component, or undefined if not found
 */
export function getLazySketchComponent(
  sketchId: string,
): LazySketchComponent | undefined {
  return LAZY_SKETCH_REGISTRY[sketchId];
}

// =============================================================================
// Loading Fallback
// =============================================================================

/**
 * R3F-compatible loading fallback for use inside Three.js scenes.
 *
 * Renders a subtle pulsing sphere to indicate loading state.
 * This is compatible with react-three-fiber's scene graph.
 */
export function SketchLoadingFallback() {
  // Return an empty group - minimal visual disruption during lazy load
  // The load time is typically <100ms, so a visible indicator isn't needed
  return <group />;
}

// =============================================================================
// Loader Wrapper
// =============================================================================

export interface SketchLoaderProps extends SketchProps {
  /** The sketch ID to render */
  sketchId: string;
}

/**
 * SketchLoader - Wrapper component that handles lazy loading with Suspense.
 *
 * Use this component when you need to render a sketch by ID with automatic
 * lazy loading and fallback handling. Includes its own Suspense boundary.
 *
 * @example
 * ```tsx
 * <SketchLoader sketchId="blueCube" opacity={1} params={params} />
 * ```
 */
export function SketchLoader({ sketchId, ...props }: SketchLoaderProps) {
  const SketchComponent = LAZY_SKETCH_REGISTRY[sketchId];

  if (!SketchComponent) {
    // Unknown sketch ID - render nothing rather than crash
    return null;
  }

  return (
    <Suspense fallback={<SketchLoadingFallback />}>
      <SketchComponent {...props} />
    </Suspense>
  );
}
