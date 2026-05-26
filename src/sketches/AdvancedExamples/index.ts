/**
 * AdvancedExamples Sketch Group
 *
 * Imports only descriptors (metadata) to enable lazy loading of components.
 * Components are lazy-loaded via LazySketchRegistry when actually used.
 */

import type { SketchGroup } from "@/sketches/types";

// Import descriptors from separate files (no component code included)
import { descriptor as plasmaDescriptor } from "./Plasma/descriptor";
import { descriptor as kaleidoscopeDescriptor } from "./Kaleidoscope/descriptor";
import { descriptor as feedbackTunnelDescriptor } from "./FeedbackTunnel/descriptor";
import { descriptor as waveformDescriptor } from "./Waveform/descriptor";

export const advancedExamplesGroup: SketchGroup = {
  id: "advancedExamples",
  label: "Advanced Examples",
  orderHint: 25,
  sketches: [
    plasmaDescriptor,
    kaleidoscopeDescriptor,
    feedbackTunnelDescriptor,
    waveformDescriptor,
  ],
};

// Re-export descriptors for backward compatibility
export { plasmaDescriptor };
export { kaleidoscopeDescriptor };
export { feedbackTunnelDescriptor };
export { waveformDescriptor };
