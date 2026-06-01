# Post-Processing Effects Panel

**Status**: In Progress  
**Backlog item**: [Post-Processing Effects Panel](../BACKLOG.md#-post-processing-effects-panel-feature)

---

## Architecture

### Pipeline Integration

```
R3F default render (priority 0)
  → scene → screen (temporary, overwritten by effects)

EffectsLayer (useFrame priority 1)
  → RenderPipeline: pass(scene, camera) + effect chain → screen

VideoOutputCapture (useFrame, existing priority)
  → renderer.render(scene, camera) → captureRT
  → RenderPipeline: texture(captureRT.texture) + effect chain → effectsRT
  → readPixels from effectsRT → Syphon/NDI
```

### State Flow

- `EffectsContext` stores `EffectInstance[]` in React state
- Persists to `localStorage` key `slew-effects`
- On change: saves + emits Tauri `effects-changed` event (for cross-window sync)
- Both windows wrap with `EffectsProvider`

### Effect Types (Initial Set)

| ID | Node | Parameters |
|----|------|-----------|
| `grain` | FilmNode | intensity (0–1) |
| `bloom` | BloomNode | strength (0–3), radius (0–1), threshold (0–1) |
| `rgb_shift` | RGBShiftNode | amount (0–0.02), angle (0–360) |
| `chromatic_ab` | ChromaticAberrationNode | strength (0.001–0.02) |
| `blur` | GaussianBlurNode | sigma (0–8) |
| `afterimage` | AfterImageNode | damp (0.8–0.99) |

### Node Chaining

Effects chain sequentially. Each effect receives the previous output node as input.
Bloom is additive: `finalNode = prevNode.add(bloom(prevNode, ...))`.

### Rebuild vs. Update

- Effect list changes (add/remove/reorder/toggle): full pipeline rebuild
- Parameter changes only: full rebuild (simplest for MVP; uniform partial update is a future optimization)

---

## Subtasks

- [x] Design pass (this doc)
- [x] Implement effects render pass in `VideoOutputCapture.tsx`
- [x] Effects Panel UI (add, remove, reorder, per-effect parameters)
- [x] Implement initial set of effects (grain, bloom, rgb_shift, chromatic_ab, blur, afterimage)
- [x] Persist effects stack and parameters
