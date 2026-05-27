/**
 * Device Layout Definitions
 *
 * Physical layout data for supported MIDI controllers. Used by DeviceSchematic
 * to render a top-down visual of each controller with control positions.
 */

// ============================================================================
// Types
// ============================================================================

export type ControlKind = "knob" | "fader" | "button" | "pad";

export interface ControlDef {
  /** Control type */
  kind: ControlKind;
  /** Column position (0-based grid units) */
  col: number;
  /** Row position (0-based grid units) */
  row: number;
  /** Width in grid units (default 1) */
  colSpan?: number;
  /** Height in grid units (default 1) */
  rowSpan?: number;
  /** MIDI CC number (if CC-based) */
  cc?: number;
  /** MIDI note number (if note-based) */
  note?: number;
  /** MIDI channel (0-based, null = any) */
  channel?: number | null;
  /** Human label shown on hover */
  label: string;
}

export interface DeviceLayout {
  /** Canonical device name for matching */
  name: string;
  /** Pattern to match against MIDI port names */
  matchPattern: RegExp;
  /** Grid columns in the layout */
  gridCols: number;
  /** Grid rows in the layout */
  gridRows: number;
  /** All controls */
  controls: ControlDef[];
}

// ============================================================================
// Akai Midimix
// 8 columns: each has 3 knobs (top/mid/bot) + 3 buttons (mute/solo/rec arm)
// + 1 fader per column. Right edge: master fader + bank L/R buttons + master solo.
// ============================================================================

function buildMidimixControls(): ControlDef[] {
  const controls: ControlDef[] = [];

  // Knobs & faders per column (8 columns)
  const faderCCs = [19, 23, 27, 31, 49, 53, 57, 61];
  const knobCCs: [number, number, number][] = [
    [16, 17, 18],
    [20, 21, 22],
    [24, 25, 26],
    [28, 29, 30],
    [46, 47, 48],
    [50, 51, 52],
    [54, 55, 56],
    [58, 59, 60],
  ];
  const muteNotes = [1, 4, 7, 10, 13, 16, 19, 22];
  const soloNotes = [2, 5, 8, 11, 14, 17, 20, 23];
  const recNotes = [3, 6, 9, 12, 15, 18, 21, 24];

  for (let c = 0; c < 8; c++) {
    const col = c;
    // Knobs at rows 0-2
    controls.push({
      kind: "knob",
      col,
      row: 0,
      cc: knobCCs[c][0],
      channel: 0,
      label: `Knob ${c + 1} Top (CC ${knobCCs[c][0]})`,
    });
    controls.push({
      kind: "knob",
      col,
      row: 1,
      cc: knobCCs[c][1],
      channel: 0,
      label: `Knob ${c + 1} Mid (CC ${knobCCs[c][1]})`,
    });
    controls.push({
      kind: "knob",
      col,
      row: 2,
      cc: knobCCs[c][2],
      channel: 0,
      label: `Knob ${c + 1} Bot (CC ${knobCCs[c][2]})`,
    });
    // Buttons at rows 3-5
    controls.push({
      kind: "button",
      col,
      row: 3,
      note: muteNotes[c],
      channel: 0,
      label: `Mute ${c + 1} (Note ${muteNotes[c]})`,
    });
    controls.push({
      kind: "button",
      col,
      row: 4,
      note: soloNotes[c],
      channel: 0,
      label: `Solo ${c + 1} (Note ${soloNotes[c]})`,
    });
    controls.push({
      kind: "button",
      col,
      row: 5,
      note: recNotes[c],
      channel: 0,
      label: `Rec Arm ${c + 1} (Note ${recNotes[c]})`,
    });
    // Fader at row 6
    controls.push({
      kind: "fader",
      col,
      row: 6,
      cc: faderCCs[c],
      channel: 0,
      label: `Fader ${c + 1} (CC ${faderCCs[c]})`,
    });
  }

  // Right column (col 8): master elements
  controls.push({
    kind: "button",
    col: 8,
    row: 3,
    note: 25,
    channel: 0,
    label: "Bank Left (Note 25)",
  });
  controls.push({
    kind: "button",
    col: 8,
    row: 4,
    note: 26,
    channel: 0,
    label: "Bank Right (Note 26)",
  });
  controls.push({
    kind: "button",
    col: 8,
    row: 5,
    note: 28,
    channel: 0,
    label: "Master Solo (Note 28)",
  });
  controls.push({
    kind: "fader",
    col: 8,
    row: 6,
    cc: 62,
    channel: 0,
    label: "Master Fader (CC 62)",
  });

  return controls;
}

export const MIDIMIX_LAYOUT: DeviceLayout = {
  name: "Akai Midimix",
  matchPattern: /midi\s*mix/i,
  gridCols: 9,
  gridRows: 7,
  controls: buildMidimixControls(),
};

// ============================================================================
// APC Mini mk2
// 8x8 pad grid + 8 scene buttons (right col) + 8 faders (bottom row)
// ============================================================================

function buildApcMiniMk2Controls(): ControlDef[] {
  const controls: ControlDef[] = [];

  // 8x8 pad grid: notes 0..63 (row 0 = notes 56-63, row 7 = notes 0-7)
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const note = (7 - r) * 8 + c;
      controls.push({
        kind: "pad",
        col: c,
        row: r,
        note,
        channel: 0,
        label: `Pad ${note} (Note ${note})`,
      });
    }
  }

  // Scene launch buttons (col 8, rows 0-7)
  const sceneNotes = [112, 113, 114, 115, 116, 117, 118, 119];
  for (let r = 0; r < 8; r++) {
    controls.push({
      kind: "button",
      col: 8,
      row: r,
      note: sceneNotes[r],
      channel: 0,
      label: `Scene ${r + 1} (Note ${sceneNotes[r]})`,
    });
  }

  // 8 channel faders (row 8, cols 0-7)
  const faderCCs = [48, 49, 50, 51, 52, 53, 54, 55];
  for (let c = 0; c < 8; c++) {
    controls.push({
      kind: "fader",
      col: c,
      row: 8,
      cc: faderCCs[c],
      channel: 0,
      label: `Fader ${c + 1} (CC ${faderCCs[c]})`,
    });
  }
  // Master fader (row 8, col 8)
  controls.push({
    kind: "fader",
    col: 8,
    row: 8,
    cc: 56,
    channel: 0,
    label: "Master Fader (CC 56)",
  });

  return controls;
}

export const APC_MINI_MK2_LAYOUT: DeviceLayout = {
  name: "APC Mini mk2",
  matchPattern: /apc\s*mini\s*mk2/i,
  gridCols: 9,
  gridRows: 9,
  controls: buildApcMiniMk2Controls(),
};

// ============================================================================
// APC Mini mk1
// Same physical layout as mk2 but different note numbers
// ============================================================================

function buildApcMiniMk1Controls(): ControlDef[] {
  const controls: ControlDef[] = [];

  // 8x8 pad grid: notes 0..63
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const note = (7 - r) * 8 + c;
      controls.push({
        kind: "pad",
        col: c,
        row: r,
        note,
        channel: 0,
        label: `Pad ${note} (Note ${note})`,
      });
    }
  }

  // Scene launch buttons (col 8, rows 0-7)
  const sceneNotes = [82, 83, 84, 85, 86, 87, 88, 89];
  for (let r = 0; r < 8; r++) {
    controls.push({
      kind: "button",
      col: 8,
      row: r,
      note: sceneNotes[r],
      channel: 0,
      label: `Scene ${r + 1} (Note ${sceneNotes[r]})`,
    });
  }

  // 8 channel faders (row 8, cols 0-7)
  const faderCCs = [48, 49, 50, 51, 52, 53, 54, 55];
  for (let c = 0; c < 8; c++) {
    controls.push({
      kind: "fader",
      col: c,
      row: 8,
      cc: faderCCs[c],
      channel: 0,
      label: `Fader ${c + 1} (CC ${faderCCs[c]})`,
    });
  }
  controls.push({
    kind: "fader",
    col: 8,
    row: 8,
    cc: 56,
    channel: 0,
    label: "Master Fader (CC 56)",
  });

  return controls;
}

export const APC_MINI_MK1_LAYOUT: DeviceLayout = {
  name: "APC Mini mk1",
  matchPattern: /apc\s*mini(?!\s*mk2)/i,
  gridCols: 9,
  gridRows: 9,
  controls: buildApcMiniMk1Controls(),
};

// ============================================================================
// Akai MPD218
// 4x4 pad grid + 6 knobs (two rows of 3)
// ============================================================================

function buildMpd218Controls(): ControlDef[] {
  const controls: ControlDef[] = [];

  // 4x4 pads (rows 0-3, cols 0-3): Bank A notes 36-51
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const note = (3 - r) * 4 + c + 36;
      controls.push({
        kind: "pad",
        col: c,
        row: r,
        note,
        channel: 0,
        label: `Pad ${note - 35} (Note ${note})`,
      });
    }
  }

  // 6 knobs: 2 rows of 3, right side (cols 4-6, rows 0-1)
  const knobCCs = [3, 9, 12, 13, 14, 15];
  for (let i = 0; i < 6; i++) {
    const col = 4 + (i % 3);
    const row = Math.floor(i / 3);
    controls.push({
      kind: "knob",
      col,
      row,
      cc: knobCCs[i],
      channel: 0,
      label: `Knob ${i + 1} (CC ${knobCCs[i]})`,
    });
  }

  return controls;
}

export const MPD218_LAYOUT: DeviceLayout = {
  name: "Akai MPD218",
  matchPattern: /mpd218/i,
  gridCols: 7,
  gridRows: 4,
  controls: buildMpd218Controls(),
};

// ============================================================================
// Novation Launchpad (mk2 / X / Mini mk3 / Pro mk3)
// 8x8 pad grid + 8 scene buttons (right col) + 8 top buttons (top row)
// Pad notes: row 1 (bottom) = 11-18, row 2 = 21-28, ..., row 8 (top) = 81-88
// Scene notes (right col): 19, 29, 39, 49, 59, 69, 79, 89
// Top row (mk2 = CC 104-111, mk3/X = notes 91-98) — modelled as buttons
// ============================================================================

function buildLaunchpadControls(): ControlDef[] {
  const controls: ControlDef[] = [];

  // 8x8 pad grid: row 0 (top of grid) = notes 81-88, row 7 (bottom) = 11-18
  for (let r = 0; r < 8; r++) {
    const noteRow = 8 - r; // row 8=top(81-88), row 1=bottom(11-18)
    for (let c = 0; c < 8; c++) {
      const note = noteRow * 10 + (c + 1);
      controls.push({
        kind: "pad",
        col: c,
        row: r,
        note,
        channel: 0,
        label: `Pad (Note ${note})`,
      });
    }
  }

  // Scene launch buttons (col 8, rows 0-7): notes 89 (top) down to 19 (bottom)
  const sceneNotes = [89, 79, 69, 59, 49, 39, 29, 19];
  for (let r = 0; r < 8; r++) {
    controls.push({
      kind: "button",
      col: 8,
      row: r,
      note: sceneNotes[r],
      channel: 0,
      label: `Scene ${r + 1} (Note ${sceneNotes[r]})`,
    });
  }

  // Top row buttons (row 8): CC 104-111 on mk2, notes 91-98 on mk3/X
  // Model as CC 104-111 (mk2 baseline; mk3/X users will see generic fallback for top row)
  for (let c = 0; c < 8; c++) {
    controls.push({
      kind: "button",
      col: c,
      row: 8,
      cc: 104 + c,
      channel: 0,
      label: `Top ${c + 1} (CC ${104 + c})`,
    });
  }

  return controls;
}

const LAUNCHPAD_LAYOUT_BASE = buildLaunchpadControls();

export const LAUNCHPAD_MK2_LAYOUT: DeviceLayout = {
  name: "Novation Launchpad mk2",
  matchPattern: /launchpad\s*mk2/i,
  gridCols: 9,
  gridRows: 9,
  controls: LAUNCHPAD_LAYOUT_BASE,
};

export const LAUNCHPAD_X_LAYOUT: DeviceLayout = {
  name: "Novation Launchpad X",
  matchPattern: /launchpad\s*x(?!\s*l)/i,
  gridCols: 9,
  gridRows: 9,
  controls: LAUNCHPAD_LAYOUT_BASE,
};

export const LAUNCHPAD_MINI_MK3_LAYOUT: DeviceLayout = {
  name: "Novation Launchpad Mini mk3",
  matchPattern: /launchpad\s*mini\s*mk3/i,
  gridCols: 9,
  gridRows: 9,
  controls: LAUNCHPAD_LAYOUT_BASE,
};

export const LAUNCHPAD_PRO_MK3_LAYOUT: DeviceLayout = {
  name: "Novation Launchpad Pro mk3",
  matchPattern: /launchpad\s*pro\s*mk3/i,
  gridCols: 9,
  gridRows: 9,
  controls: LAUNCHPAD_LAYOUT_BASE,
};

// ============================================================================
// DJ TechTools Midi Fighter Twister
// 4x4 grid of endless rotary encoders with RGB LED rings
// Encoders: CC 0-15, channel 0. Push buttons: Note 0-15, channel 1.
// ============================================================================

function buildMfTwisterControls(): ControlDef[] {
  const controls: ControlDef[] = [];

  for (let i = 0; i < 16; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    // Encoder (CC ch0) — shown as knob
    controls.push({
      kind: "knob",
      col,
      row,
      cc: i,
      channel: 0,
      label: `Encoder ${i + 1} (CC ${i})`,
    });
  }

  return controls;
}

export const MF_TWISTER_LAYOUT: DeviceLayout = {
  name: "Midi Fighter Twister",
  matchPattern: /midi\s*fighter\s*twister/i,
  gridCols: 4,
  gridRows: 4,
  controls: buildMfTwisterControls(),
};

// ============================================================================
// DJ TechTools Midi Fighter Spectra
// 4x4 RGB button grid, 16 pads
// Notes: row 0 (bottom) = 36-39, row 3 (top) = 48-51, channel 0
// ============================================================================

function buildMfSpectraControls(): ControlDef[] {
  const controls: ControlDef[] = [];

  // 4x4 pad grid: display row 0 (top) = hardware row 3 (notes 48-51)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const note = (3 - r) * 4 + c + 36;
      controls.push({
        kind: "pad",
        col: c,
        row: r,
        note,
        channel: 0,
        label: `Pad ${note} (Note ${note})`,
      });
    }
  }

  return controls;
}

export const MF_SPECTRA_LAYOUT: DeviceLayout = {
  name: "Midi Fighter Spectra",
  matchPattern: /midi\s*fighter\s*spectra/i,
  gridCols: 4,
  gridRows: 4,
  controls: buildMfSpectraControls(),
};

// ============================================================================
// DJ TechTools Midi Fighter 64
// 8x8 RGB button grid, 64 pads
// Notes: row 0 (bottom) = 36-43, row 7 (top) = 92-99, channel 0
// ============================================================================

function buildMf64Controls(): ControlDef[] {
  const controls: ControlDef[] = [];

  // 8x8 pad grid: display row 0 (top) = hardware row 7 (notes 92-99)
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const note = (7 - r) * 8 + c + 36;
      controls.push({
        kind: "pad",
        col: c,
        row: r,
        note,
        channel: 0,
        label: `Pad ${note} (Note ${note})`,
      });
    }
  }

  return controls;
}

export const MF_64_LAYOUT: DeviceLayout = {
  name: "Midi Fighter 64",
  matchPattern: /midi\s*fighter\s*64/i,
  gridCols: 8,
  gridRows: 8,
  controls: buildMf64Controls(),
};

// ============================================================================
// Registry & lookup
// ============================================================================

export const KNOWN_LAYOUTS: DeviceLayout[] = [
  MIDIMIX_LAYOUT,
  APC_MINI_MK2_LAYOUT, // mk2 must come before mk1 (name is superset)
  APC_MINI_MK1_LAYOUT,
  MPD218_LAYOUT,
  MF_TWISTER_LAYOUT,
  MF_SPECTRA_LAYOUT,
  MF_64_LAYOUT,
  LAUNCHPAD_PRO_MK3_LAYOUT, // more specific patterns first
  LAUNCHPAD_MINI_MK3_LAYOUT,
  LAUNCHPAD_X_LAYOUT,
  LAUNCHPAD_MK2_LAYOUT,
];

/**
 * Find a layout for the given MIDI port name.
 * Returns null if no known layout matches — caller should use generic grid.
 */
export function findLayout(portName: string): DeviceLayout | null {
  return KNOWN_LAYOUTS.find((l) => l.matchPattern.test(portName)) ?? null;
}

/**
 * Build a generic fallback layout from a set of CC numbers.
 * Arranges controls in a horizontal strip of knobs.
 */
export function buildGenericLayout(
  deviceName: string,
  ccNumbers: number[],
): DeviceLayout {
  const cols = Math.min(ccNumbers.length, 8);
  const rows = Math.ceil(ccNumbers.length / 8);

  const controls: ControlDef[] = ccNumbers.map((cc, i) => ({
    kind: "knob" as ControlKind,
    col: i % 8,
    row: Math.floor(i / 8),
    cc,
    channel: null,
    label: `CC ${cc}`,
  }));

  return {
    name: deviceName,
    matchPattern: new RegExp("^$"), // never match — used directly
    gridCols: cols,
    gridRows: rows,
    controls,
  };
}
