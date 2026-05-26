/**
 * LuminoSmoke Sketch Group
 */

import type { SketchGroup } from "@/sketches/types";
import { descriptor } from "./descriptor";

export const luminoSmokeGroup: SketchGroup = {
  id: "luminoSmoke",
  label: "LuminoSmoke",
  orderHint: 15,
  sketches: [descriptor],
};
