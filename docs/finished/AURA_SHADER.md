# Aura Shader – Complete Guide

**Status**: ✅ Complete  
**Original**: https://seb.cat/sketches/aura

---

## Overview

The Aura shader is a volumetric raymarching effect that creates flowing, colorful 3D noise fields with HDR accumulation and multiple tonemapping modes. Successfully ported from seb.cat with 8 preset variations and 12 fully controllable parameters.

**Key Features**:

- Volumetric raymarching with 4-16 steps
- HDR color accumulation
- 7 tonemapping modes
- 12 parameters (bloom, complexity, speed, etc.)
- 8 distinct visual presets
- 60fps achievable on M1/M2 Macs

---

## Quick Start

### Loading Aura

1. Launch the app: `npm run tauri dev`
2. In Controls window, click an empty slot
3. Navigate to "Aura" group (below "Examples")
4. Select "Aura: Original" to start

### Expected Result

Renderer window shows purple-blue-pink volumetric effect with smooth flowing motion at 60fps.

---

## Parameters

All parameters use neutral-colored sliders for consistency.

### Top 3 (MIDI Priority)

These appear first in slot controls and are ordered for MIDI Mix:

| Parameter         | Range   | Default | Description                            |
| ----------------- | ------- | ------- | -------------------------------------- |
| **Bloom**         | 0.1–5.0 | 3.2     | Volumetric bloom/glow radius           |
| **Complexity**    | 0.5–5.0 | 3.3     | Noise frequency/detail level           |
| **Sample Offset** | 0.0–1.0 | 0.15    | Dual-sample offset for color variation |

### Additional Parameters

| Parameter       | Range    | Default | Type   | Description                           |
| --------------- | -------- | ------- | ------ | ------------------------------------- |
| Speed           | 0.0–2.0  | 0.3     | Slider | Animation speed multiplier            |
| Scale           | 0.1–2.0  | 1.0     | Slider | Overall zoom/scale                    |
| Distance        | 0.5–4.0  | 2.0     | Slider | Raymarch distance threshold           |
| Attenuation     | 0.01–0.5 | 0.15    | Slider | Volume density/opacity                |
| Ray Steps       | 4–16     | 8       | Slider | Raymarch iteration count (quality)    |
| Seed            | 0–10000  | 0       | Slider | Random seed for noise variation       |
| Color Intensity | 0.0–2.0  | 0.9     | Slider | Color gradient interpolation strength |
| Grain           | 0.0–0.2  | 0.05    | Slider | Static film grain texture intensity   |
| Tonemap         | 0–7      | 0       | Select | Tonemapping mode (see below)          |

### Tonemap Modes

**Note**: Tonemap is a **select dropdown**, not a slider, for easier mode selection.

| Value | Mode          | Effect                               |
| ----- | ------------- | ------------------------------------ |
| 0     | None          | Raw HDR (default for most presets)   |
| 1     | Reinhard      | Simple, soft compression             |
| 2     | Uncharted 2   | Filmic, cinematic                    |
| 3     | ACES          | Industry standard, natural           |
| 4     | Cross-process | Stylized, exaggerated blue           |
| 5     | Bleach Bypass | High contrast, desaturated           |
| 6     | Technicolor   | Retro split-channel, warm            |
| 7     | Cinematic     | S-curve contrast, slight color shift |

---

## Presets

### Aura: Original (OG)

**Classic purple-blue-pink gradient**

- Default balanced preset for general use
- Ray Steps: 8, Tonemap: None
- Best for: Learning the shader, general VJ work

### Aura: Solar Plume

**Intense orange-yellow-red fire tones**

- Tight form (bloom: 0.36), high complexity
- Ray Steps: 8, Tonemap: Cross-process
- Best for: High-energy moments, climax sections
- Notes: Lower bloom creates tighter, more defined form

### Aura: Ghost-Like

**Ethereal pale cyan-green-beige**

- Very translucent (attenuation: 0.08)
- Ray Steps: 6 (faster), Tonemap: Cinematic
- Best for: Ambient, mysterious, subtle backgrounds

### Aura: Forest Clearing

**Organic teal-green-purple tones**

- Calm motion (speed: 0.2)
- Ray Steps: 9, Tonemap: Cinematic
- Best for: Nature themes, organic motion

### Aura: Rose Gold

**Warm orange-violet-pink metallics**

- Balanced parameters, elegant aesthetic
- Ray Steps: 8, Tonemap: Cross-process
- Best for: Luxurious, elegant, warm moods

### Aura: Deep Blue

**Cool blue-cyan-purple ocean tones**

- Same settings as Original
- Ray Steps: 8, Tonemap: None
- Best for: Underwater themes, cool moods

### Aura: Intense

**Vivid purple-blue-pink (denser than Original)**

- Highest ray steps (11), highest quality
- Higher attenuation (0.25) for denser look
- Ray Steps: 11, Tonemap: Cinematic
- Best for: High-detail, intricate visuals

### Aura: Blush Nebula

**Pink-yellow-red-blue cosmic vibes**

- Max sample offset (0.5), higher grain (0.1)
- Ray Steps: 10, Tonemap: Bleach bypass
- Best for: Space themes, cosmic aesthetics

---

## Live Performance Tips

### MIDI Mapping

Top 3 parameters are ordered for MIDI Mix:

1. **Bloom** (Bank 1, Knob 1) - Most immediate visual impact
2. **Complexity** (Bank 1, Knob 2) - Controls detail/frequency
3. **Sample Offset** (Bank 1, Knob 3) - Adds color variation

### Performance Techniques

- **Start simple**: Use lower `raySteps` (4-6) for multi-slot setups
- **Build complexity**: Gradually increase `complexity` for dramatic reveals
- **Pulse with bloom**: Automate `bloom` with audio or LFO for breathing effect
- **Seed hopping**: Jump `seed` values for instant variation without structural change
- **Tonemap transitions**: Switch `tonemapMode` for instant mood shifts

### Multi-Slot Usage

- Single Aura instance: 60fps @ raySteps=8
- 2 Aura instances: 50-60fps @ raySteps=8
- 3+ Aura instances: Reduce to raySteps=6 for stable 60fps

---

## Technical Details

### Implementation

**Files Created**:

- `src/lib/tsl/utils.ts` (188 lines) - Reusable TSL utilities
- `src/sketches/Aura/index.tsx` (583 lines) - Main shader component
- `src/sketches/Aura/presets.ts` (241 lines) - 8 preset definitions

**Files Modified**:

- `src/sketches/types.ts` - Added 12 Aura parameter IDs
- `src/sketches/index.ts` - Registered Aura group
- `src/controls/useParameterStore.ts` - Parameter mappings
- `src/renderer/RendererRoot.tsx` - Renderer parameter mappings

### Shader Architecture

1. **Ray Setup**: Generate ray direction from aspect-corrected UVs
2. **Raymarch Loop**: Step through 3D space (4-16 iterations)
   - Evaluate distance field at each point using `mapSdf`
   - Sample offset position for color variation
   - Accumulate HDR color based on proximity to surface
3. **Tonemapping**: Apply selected operator
4. **Grain**: Add film grain texture

### Key Functions

**`mapSdf(p, t, speed, complexity, distance, seed)`**

- Combines 2D rotation, warp transform, and compact noise
- Returns pseudo-distance for volumetric raymarch
- Time-driven rotations in XZ and XY planes
- Frequency and rotation offsets based on seed

**`estimateNormal(...)`**

- Finite-difference normal calculation (currently unused)
- Reserved for future debug modes

### Performance

- **GPU-intensive**: Raymarching with 8-16 steps per pixel
- **60fps target**: Achievable on M1/M2 Macs at 1080p
- **Multi-slot**: Reduce raySteps when running 3+ instances
- **Material recreation**: Only on `raySteps` or `tonemapMode` changes
- **Uniform updates**: All other parameters update without shader recompilation

### Design Decisions

1. **Preset Strategy**: Each preset is a separate sketch (not runtime selector)
   - Simpler implementation, maintains parameter consistency
2. **Parameter Naming**: camelCase in JS, snake_case in template IDs
3. **Color System**: Each preset defines its own color palette (startColor, midColor, endColor, background)
   - Colors are passed to the component via `colors` prop from parent state
   - Parent components (App.tsx, RendererRoot.tsx) detect sketch changes and update colors from preset descriptors
   - Race condition fix: Color change detection happens before state updates, with ref tracking updated after
   - Material initialized with colors via ref; runtime color changes update uniforms via useEffect with JSON key comparison
4. **Optimization**: Material rebuilds only when necessary (raySteps or tonemapMode changes)

---

## Testing Checklist

### Basic Functionality

- [ ] All 8 presets appear in sketch browser
- [ ] Each preset loads without errors
- [ ] Each preset displays its own distinct color palette (not OG colors)
- [ ] Visual output matches expected characteristics
- [ ] No console errors or warnings
- [ ] Smooth 60fps with single slot

### Parameter Control

- [ ] Bloom changes glow radius visibly
- [ ] Complexity increases/decreases detail
- [ ] Sample Offset adds color variation
- [ ] Speed accelerates/slows animation
- [ ] Scale zooms in/out
- [ ] Distance changes volume threshold
- [ ] Attenuation controls opacity/density
- [ ] Ray Steps affects quality (and FPS)
- [ ] Seed creates variation
- [ ] Color Intensity affects gradient strength
- [ ] Grain adds texture
- [ ] Tonemap modes work (0-7)

### MIDI Integration

- [ ] Connect MIDI controller
- [ ] Map to bloom parameter
- [ ] Smooth parameter changes
- [ ] No stuttering or frame drops

### Multi-Slot Performance

- [ ] Load Aura in slot 0
- [ ] Load different preset in slot 1
- [ ] Crossfade blends smoothly
- [ ] 3+ instances at reduced raySteps = 60fps

### Slot Transitions

- [ ] Crossfade to other sketch types
- [ ] Blends smoothly without artifacts
- [ ] Alpha parameter controls visibility

### Preset Color Switching

- [ ] Load Aura OG in slot → shows purple-blue-pink
- [ ] Change to Solar Plume → shows orange-yellow-red (not OG colors)
- [ ] Change to Ghost Like → shows pale cyan-green-beige
- [ ] Change to Deep Blue → shows blue-cyan-purple
- [ ] Switching between any presets applies correct colors immediately

---

## Performance Benchmarks

Expected on M1 Mac at 1920×1080:

| Scenario             | Ray Steps | Expected FPS | Notes                    |
| -------------------- | --------- | ------------ | ------------------------ |
| Single Aura instance | 8         | 60fps        | Butter smooth            |
| Single Aura instance | 16        | 40-50fps     | Highest quality          |
| 2 Aura instances     | 8         | 50-60fps     | Depends on crossfade     |
| 3+ Aura instances    | 8         | 30-50fps     | May need to reduce steps |
| 3+ Aura instances    | 6         | 50-60fps     | Performance mode         |

---

## Troubleshooting

### Black Screen

**Symptom**: Slot shows black or doesn't render

**Solutions**:

- Check browser console for shader compilation errors
- Verify WebGPU support (Chrome/Edge 113+, Safari 18+)
- Try a different preset
- Reset parameters to defaults
- Restart app

### Low FPS / Stuttering

**Symptom**: Frame drops, stuttering, low FPS

**Solutions**:

- Reduce Ray Steps to 4-6
- Lower Complexity below 3.0
- Disable multiple Aura instances in other slots
- Close other GPU-intensive apps
- Check GPU usage in Activity Monitor

### Visual Artifacts

**Symptom**: Banding, noise, flickering

**Solutions**:

- Increase Ray Steps for smoother gradients
- Adjust Grain intensity
- Try different Tonemap modes
- Verify WebGPU is active (not WebGL2 fallback)

### Parameter Not Responding

**Symptom**: Changing parameter has no effect

**Solutions**:

- Verify parameter is in valid range (min-max)
- Check slot is active (alpha > 0)
- Try small adjustments first
- Check for MIDI mapping conflicts

### Preset Looks Different

**Symptom**: Preset doesn't match expected appearance

**Solutions**:

- Verify all parameters loaded correctly
- Check Tonemap mode matches preset default
- Reset slot to reload preset defaults
- Compare with seb.cat reference

### Material Rebuild Hitch

**Symptom**: Momentary pause when changing Ray Steps or Tonemap

**Expected**: These parameters require shader recompilation. All other parameters update smoothly.

---

## Known Limitations

### Color Customization

- Color palette (startColor, midColor, endColor, background) is hardcoded per preset
- Palette colors are displayed in the UI for each preset
- Not currently exposed as editable parameters (could be added in future if needed)

### Grain Rendering

- Grain texture is **static** (position-based, not time-based)
- Should not appear animated - any perceived motion is from the underlying shader animation

### Debug Modes

- `estimateNormal` and `normalEps` defined but unused
- Reserved for future visualization modes (distance field, step count, normals)

### Audio Reactivity

- No built-in audio reactivity yet
- Can be achieved through parameter automation/modulation
- Could be integrated directly in future

---

## Future Enhancements

Potential additions (not currently implemented):

1. **Color Parameters**: Expose palette colors as controllable parameters
2. **Debug Modes**: Visualize distance field, step count, normals
3. **Audio Reactivity**: Direct FFT integration for automatic modulation
4. **Preset Morphing**: Smooth interpolation between presets
5. **Quality Presets**: Quick switches for performance tiers

---

## Success Criteria

Integration is successful if:

✅ All 8 presets load and render correctly  
✅ All 12 parameters respond as expected  
✅ 60fps maintained with single instance (raySteps=8)  
✅ No console errors or shader compilation failures  
✅ Smooth crossfade between presets  
✅ MIDI mapping works for top 3 parameters  
✅ Visual quality matches seb.cat original

---

## Credits

- **Original Shader**: seb.cat/sketches/aura
- **Integration**: Slew (2025-01-24)
- **Technology**: Three.js TSL (Shading Language), WebGPU

---

## Related Documentation

- **Architecture**: `docs/ARCHITECTURE.md` (Slot System, Parameter Server)
- **Changelog**: `docs/CHANGELOG.md` (Feature status)
- **Backlog**: `docs/BACKLOG.md` (Completed items)
