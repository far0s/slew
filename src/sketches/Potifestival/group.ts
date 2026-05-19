/**
 * Potifestival Sketch Group
 */

import type { SketchGroup } from "../types";
import { descriptor as luminoSmokeDescriptor } from "./LuminoSmoke/descriptor";
import { descriptor as prismLinesDescriptor } from "./PrismLines/descriptor";
import { descriptor as starTrailsDescriptor } from "./StarTrails/descriptor";
import { descriptor as vortexBeamDescriptor } from "./VortexBeam/descriptor";

export const potifestivalGroup: SketchGroup = {
  id: "potifestival",
  label: "Potifestival",
  orderHint: 15,
  sketches: [
    luminoSmokeDescriptor,
    prismLinesDescriptor,
    starTrailsDescriptor,
    vortexBeamDescriptor,
  ],
};
