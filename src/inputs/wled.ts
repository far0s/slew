import { invoke } from "@tauri-apps/api/core";

export interface WledSegmentMapping {
  segment_id: number;
  slot_index: number;
  template_id: string;
  color_index: number;
}

export interface WledConfig {
  enabled: boolean;
  ip: string;
  port: number;
  mappings: WledSegmentMapping[];
}

export async function getWledConfig(): Promise<WledConfig> {
  return invoke<WledConfig>("get_wled_config");
}

export async function setWledConfig(config: WledConfig): Promise<void> {
  return invoke<void>("set_wled_config", { config });
}

export async function testWledConnection(): Promise<string> {
  return invoke<string>("test_wled_connection");
}

export async function pushWledColor(
  slot: number,
  templateId: string,
  r: number,
  g: number,
  b: number,
): Promise<void> {
  return invoke<void>("push_wled_color", { slot, templateId, r, g, b });
}
