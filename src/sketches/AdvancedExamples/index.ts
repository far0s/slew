import type { SketchGroup } from "../types";

import { Plasma, descriptor as plasmaDescriptor } from "./Plasma";
import {
  Kaleidoscope,
  descriptor as kaleidoscopeDescriptor,
} from "./Kaleidoscope";
import {
  FeedbackTunnel,
  descriptor as feedbackTunnelDescriptor,
} from "./FeedbackTunnel";
import { Waveform, descriptor as waveformDescriptor } from "./Waveform";

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

export { Plasma, plasmaDescriptor };
export { Kaleidoscope, kaleidoscopeDescriptor };
export { FeedbackTunnel, feedbackTunnelDescriptor };
export { Waveform, waveformDescriptor };
