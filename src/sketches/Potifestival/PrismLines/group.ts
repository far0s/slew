/**
 * PrismLines Sketch Group
 */

import type { SketchGroup } from "@/sketches/types";
import { descriptor } from "./descriptor";

export const prismLinesGroup: SketchGroup = {
  id: "prismLines",
  label: "PrismLines",
  orderHint: 16,
  sketches: [descriptor],
};
