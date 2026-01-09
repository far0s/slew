/**
 * Examples Sketch Group
 *
 * Imports only descriptors (metadata) to enable lazy loading of components.
 * Components are lazy-loaded via LazySketchRegistry when actually used.
 */

import type { SketchGroup } from "../types";

// Import descriptors from separate files (no component code included)
import { descriptor as blueCubeDescriptor } from "./BlueCube/descriptor";
import { descriptor as orangeCubeDescriptor } from "./OrangeCube/descriptor";
import { descriptor as greenPulseDescriptor } from "./GreenPulse/descriptor";
import { descriptor as tslText3DDescriptor } from "./TslText3D/descriptor";
import { descriptor as tslNoiseBlobDescriptor } from "./TslNoiseBlob/descriptor";

export const examplesGroup: SketchGroup = {
  id: "examples",
  label: "Examples",
  orderHint: 20,
  sketches: [
    blueCubeDescriptor,
    orangeCubeDescriptor,
    greenPulseDescriptor,
    tslText3DDescriptor,
    tslNoiseBlobDescriptor,
  ],
};

// Re-export descriptors for backward compatibility
export { blueCubeDescriptor };
export { orangeCubeDescriptor };
export { greenPulseDescriptor };
export { tslText3DDescriptor };
export { tslNoiseBlobDescriptor };
