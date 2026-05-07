import type { SketchGroup } from "../types";
import { descriptor } from "./descriptor";

export const starTrailsGroup: SketchGroup = {
  id: "starTrails",
  label: "StarTrails",
  orderHint: 17,
  sketches: [descriptor],
};
