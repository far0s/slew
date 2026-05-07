import type { SketchGroup } from "../types";
import { descriptor } from "./descriptor";

export const vortexBeamGroup: SketchGroup = {
  id: "vortexBeam",
  label: "VortexBeam",
  orderHint: 20,
  sketches: [descriptor],
};
