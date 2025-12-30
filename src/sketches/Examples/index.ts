import type { SketchGroup } from "../types";

import { BlueCube, descriptor as blueCubeDescriptor } from "./BlueCube";
import { OrangeCube, descriptor as orangeCubeDescriptor } from "./OrangeCube";
import { GreenPulse, descriptor as greenPulseDescriptor } from "./GreenPulse";
import { TslText3D, descriptor as tslText3DDescriptor } from "./TslText3D";
import {
  TslNoiseBlob,
  descriptor as tslNoiseBlobDescriptor,
} from "./TslNoiseBlob";

export const examplesGroup: SketchGroup = {
  id: "examples",
  label: "Examples",
  orderHint: 10,
  sketches: [
    blueCubeDescriptor,
    orangeCubeDescriptor,
    greenPulseDescriptor,
    tslText3DDescriptor,
    tslNoiseBlobDescriptor,
  ],
};

export { BlueCube, blueCubeDescriptor };
export { OrangeCube, orangeCubeDescriptor };
export { GreenPulse, greenPulseDescriptor };
export { TslText3D, tslText3DDescriptor };
export { TslNoiseBlob, tslNoiseBlobDescriptor };
