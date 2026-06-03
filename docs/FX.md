# Effects (FX)

The FX chain applies post-processing effects to the final rendered output. Effects stack in order and run on every frame before the image is sent to Syphon/NDI or displayed.

---

## Adding Effects

1. Open **FX** tab in the sidebar
2. Click **+ Add Effect** to open the effect picker
3. Select an effect — it appears at the bottom of the chain

Effects are applied top-to-bottom. Order matters: Blur before Grain looks different than Grain before Blur.

---

## Reordering Effects

Drag effects up or down in the list to change their order. The chain processes from top to bottom.

---

## Enabling / Disabling

Each effect has a toggle. Disabled effects are skipped but remain in the chain with their settings intact.

---

## Available Effects

| Effect | Description |
|--------|-------------|
| **Grain** | Film grain noise texture |
| **Bloom** | Glowing halo around bright areas |
| **RGB Shift** | Splits colour channels apart (chromatic aberration) |
| **Chromatic AB** | Lens-style colour fringing |
| **Blur** | Uniform gaussian blur |
| **Afterimage** | Motion trails / feedback decay |
| **Vignette** | Darkens edges of the frame |
| **CRT** | Scanlines + barrel distortion |
| **Dither** | Bayer 8×8 ordered dithering |
| **Halftone** | Print-style halftone dot pattern |
| **LED** | Simulates an LED display panel |
| **Pixellation** | Chunky pixel art downsampling |
| **Bulge** | Radial bulge or pinch distortion |
| **Swirl** | Rotational swirl distortion |
| **Mirror** | Fold UV space horizontally / vertically |
| **Kaleidoscope** | Radial N-segment mirror symmetry |
| **Tile** | Repeat output in a grid (optional mirrored) |
| **Domain Warp** | FBM noise displaces UV — warps visuals into themselves |

---

## Parameters

Each effect exposes its own parameters (sliders, toggles, angle dials). Parameters appear in the expanded effect row.

All effect parameters support **MIDI learn** — right-click a parameter or use the MIDI learn button to map a CC.

### Percent Units

Some parameters show **%** values (e.g. Blur Radius, Vignette Strength). These are normalised 0–100 rather than raw shader values, so mappings feel consistent regardless of output resolution.

### Angle Parameters

Rotation-type parameters show a **dial** instead of a slider. Drag to rotate or double-click to type a value. Range is 0–360°.

---

## MIDI Mapping FX Parameters

1. Enable MIDI Learn (toolbar button or `Esc` to cancel)
2. Click any FX parameter
3. Move a knob/fader on your MIDI controller
4. Mapping is saved automatically

Mapped parameters show a green indicator. Right-click a mapped parameter to remove or reassign.

---

## Persistence

The FX chain and all parameter values persist across sessions via `localStorage`. They are also saved as part of **Projects** (see Project panel).

---

## Tips

- **Afterimage** + **Bloom** = glowing trails — classic VJ look
- **Domain Warp** is computationally heavy; combine with **Pixellation** to reduce GPU load
- **Kaleidoscope** works best before colour effects like **RGB Shift**
- **Grain** should usually be last in chain to avoid it getting blurred by downstream effects
