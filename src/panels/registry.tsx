import type { ReactElement } from "react";
import type { Slot } from "@/slots/useSlots";
import { InputsPanel } from "@/components/panels/InputsPanel";
import { OutputsPanel } from "@/components/panels/OutputsPanel";
import { ModulationPanel } from "@/components/panels/ModulationPanel";
import { EffectsPanel } from "@/components/panels/EffectsPanel";

// Panels that appear in both the Sidebar and the slot column picker.
// Adding a new panel here automatically exposes it in both places.
export type PanelId = "inputs" | "outputs" | "mod" | "fx";

export interface PanelRenderProps {
  slots?: Slot[];
  onHighlightParams?: (ids: Set<string>) => void;
  macropadSelectedIndex?: number | null;
}

export interface PanelConfig {
  id: PanelId;
  label: string;
  shortLabel: string;
  render: (props: PanelRenderProps) => ReactElement;
}

export const PANEL_CONFIGS: PanelConfig[] = [
  {
    id: "inputs",
    label: "Inputs",
    shortLabel: "Inputs",
    render: ({ slots, macropadSelectedIndex }) => (
      <InputsPanel slots={slots} macropadSelectedIndex={macropadSelectedIndex} />
    ),
  },
  {
    id: "outputs",
    label: "Outputs",
    shortLabel: "Outputs",
    render: () => <OutputsPanel />,
  },
  {
    id: "mod",
    label: "Modulation",
    shortLabel: "Mod",
    render: ({ slots, onHighlightParams }) => (
      <ModulationPanel slots={slots} onHighlightParams={onHighlightParams} />
    ),
  },
  {
    id: "fx",
    label: "Effects",
    shortLabel: "FX",
    render: () => <EffectsPanel />,
  },
];
