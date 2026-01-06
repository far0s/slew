# Sidebar - Video + UI Appearance Options

Planning document for improving the Video tab and adding UI appearance options to the sidebar.

---

## Overview

This feature covers two main areas:

1. **Video tab cleanup**: Better organization of renderer stats, video output options, and recording placeholder
2. **Appearance settings**: Theme improvements, sidebar positioning, and user customization options

---

## Decisions

- **Renderer stats location**: Move from Settings to Video tab (A)
- **Amber theme**: Applies to both dark and light themes (4 themes total: dark, light, dark-amber, light-amber)
- **Video tab header**: Rename from "Video Output" to just "Video"
- **Output instructions**: Inline expandable instructions with app-specific examples

---

## Current State

### Video Tab (`VideoOutputPanel.tsx`)

- Shows list of video output backends (Syphon, NDI, Spout)
- Each backend shows: name, availability, active status, frames published, receivers
- Toggle buttons to enable/disable backends
- Basic "Tip" hint about Syphon usage
- **Issues**:
  - No renderer stats (moved to Settings tab recently)
  - Order not consistent (backends appear in whatever order returned)
  - Unavailable backends show same UI as available ones
  - No clear sections separating different concerns
  - "Frames" and "Receivers" stats not very useful without context
  - No instructions on how to actually use the output in other software

### Settings Tab (`DebugPanel.tsx`)

- Renderer section: DPR control, window/render size, backend type, FPS/frame time
- Appearance section: Only dark/light toggle
- Transition Times section: Mute/Solo fade sliders
- Actions section: Restart Renderer/Controls buttons
- **Issues**:
  - Theme toggle is basic (only dark/light)
  - No sidebar position option
  - No zoom controls
  - No custom CSS option
  - Action buttons reportedly not working

### Theme System (`tailwind.css`)

- CSS variables defined in `:root` (dark) and `[data-theme="light"]`
- Uses `data-theme` attribute on `<html>`
- Stored in `localStorage` as `slew-theme`
- Transition on background-color and color

---

## Proposed Changes

### 1. Video Tab Restructure

Rename tab from "Video Output" to "Video". Reorganize into clear sections:

```
┌─────────────────────────────────────┐
│ Video                               │
├─────────────────────────────────────┤
│ ▼ Renderer                          │
│   ┌───────────────────────────────┐ │
│   │ Window: 1920 × 1080           │ │
│   │ Render: 3840 × 2160 px        │ │
│   │ Backend: WebGPU ✓             │ │
│   │ FPS: 60 fps                   │ │
│   │ Frame: 16.7 ms                │ │
│   │                               │ │
│   │ Pixel Density: [0.5×][1×][2×] │ │
│   └───────────────────────────────┘ │
│                                     │
│ ▼ Output                            │
│   ┌───────────────────────────────┐ │
│   │ ● Syphon                      │ │
│   │   Server: "Slew"              │ │
│   │   Status: Active ✓            │ │
│   │   [Disable]                   │ │
│   ├───────────────────────────────┤ │
│   │ ○ NDI                         │ │
│   │   Status: Ready               │ │
│   │   [Enable]                    │ │
│   ├───────────────────────────────┤ │
│   │ ✗ Spout (Windows only)        │ │
│   │   Not available on macOS      │ │
│   └───────────────────────────────┘ │
│                                     │
│   ▼ How to use Syphon/NDI          │
│   ┌───────────────────────────────┐ │
│   │ Syphon (macOS):               │ │
│   │ Open Resolume, VDMX, or OBS.  │ │
│   │ Add a Syphon client source    │ │
│   │ and select "Slew".            │ │
│   │                               │ │
│   │ NDI (Cross-platform):         │ │
│   │ Open any NDI-compatible app.  │ │
│   │ Search for "Slew" source on   │ │
│   │ your local network.           │ │
│   └───────────────────────────────┘ │
│                                     │
│ ▼ Recording (Coming Soon)          │
│   ┌───────────────────────────────┐ │
│   │ Recording is not yet          │ │
│   │ available. Coming in a        │ │
│   │ future update.                │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### Subtasks

- [x] Rename tab from "Video Output" to "Video"
- [x] Move `RendererSettingsSection` from Settings tab to Video tab
- [x] Create "Renderer" collapsible section with stats + DPR controls
- [x] Create "Output" section for Syphon/NDI/Spout
  - [x] Show outputs in fixed order: Syphon → NDI → Spout
  - [x] Improve disabled/unavailable state (dimmed, clear reason)
  - [x] Better "Active" indicator (green dot + label)
  - [x] Remove frames/receivers stats (not useful) or make them optional/collapsed
- [x] Add expandable "How to use" instructions panel with inline content
  - [x] Syphon: "Open Resolume/VDMX/OBS, add Syphon client source, select 'Slew'"
  - [x] NDI: "Open NDI-compatible software, search for 'Slew' source on the network"
- [x] Add "Recording" placeholder section (collapsed, "Coming Soon" badge)

---

### 2. Layout Options

Add sidebar position and UI zoom controls.

#### Sidebar Position

- [x] Add sidebar position toggle (left/right)
- [x] Store in localStorage as `slew-sidebar-position`
- [x] Update `App.tsx` layout to support both positions
- [x] Ensure transitions are smooth

#### UI Zoom

- [x] Add zoom controls (-10%, reset, +10%)
- [x] Range: 80% to 150%
- [x] Store in localStorage as `slew-ui-zoom`
- [x] Apply via CSS `zoom` or `transform: scale()` on `#root`
- [x] Ensure hit targets remain accessible at all zoom levels

---

### 3. Advanced & Fixes

#### Fix Action Buttons

The "Restart Renderer" and "Restart Controls" buttons in Settings are reportedly not working.

- [ ] Investigate why action buttons aren't working
  - Check if `restartControls()` and `restartRenderer()` functions are being called
  - Check if Tauri commands are being invoked correctly
  - Check console for errors
- [ ] Fix the underlying issue
- [ ] Test both buttons work correctly

#### Fullscreen Toggle

Allow fullscreen toggle for windows (native shortcut).

- [ ] Add keyboard shortcut for fullscreen toggle (Cmd+Shift+F or F11)
- [ ] Investigate Tauri's fullscreen API
- [ ] Apply to both Controls and Renderer windows
- [ ] Ensure proper restoration of window state on exit

#### Custom CSS

- [ ] Add file picker button for loading custom CSS
- [ ] Use Tauri file dialog to select `.css` file
- [ ] Store file path in localStorage
- [ ] Load and apply CSS on app start
- [ ] Show currently loaded file name
- [ ] Add "Remove" button to clear custom CSS

---

### 4. Appearance Tab (New)

Create a new dedicated Appearance tab in the sidebar:

```
┌─────────────────────────────────────┐
│ Appearance                          │
├─────────────────────────────────────┤
│ ▼ Theme                             │
│   ┌───────────────────────────────┐ │
│   │ Mode: [Dark] [Light]          │ │
│   │                               │ │
│   │ Accent: [Standard] [Amber]    │ │
│   │                               │ │
│   │ (4 combinations:              │ │
│   │  dark, light,                 │ │
│   │  dark-amber, light-amber)     │ │
│   └───────────────────────────────┘ │
│                                     │
│ ▼ Layout                            │
│   ┌───────────────────────────────┐ │
│   │ Sidebar Position              │ │
│   │ [Left] [Right]                │ │
│   │                               │ │
│   │ UI Zoom                       │ │
│   │ [-] 100% [+]                  │ │
│   └───────────────────────────────┘ │
│                                     │
│ ▼ Advanced                          │
│   ┌───────────────────────────────┐ │
│   │ Custom CSS                    │ │
│   │ Load custom stylesheet for    │ │
│   │ advanced customization.       │ │
│   │ [Load CSS File]               │ │
│   │                               │ │
│   │ Currently: None               │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### Subtasks

- [ ] Add "Appearance" tab to DebugPanel tabs
- [ ] Create `AppearancePanel` component
- [ ] Move theme toggle from Settings to Appearance

##### Theme Improvements

- [ ] Refactor theme system to support mode + accent combinations
  - Mode: dark | light
  - Accent: standard | amber
  - Result: 4 theme combinations
- [ ] Add "Amber" accent (warm orange/red accents for night use)
  - Define CSS variables for amber variants in `tailwind.css`
  - `[data-theme="dark"][data-accent="amber"]`
  - `[data-theme="light"][data-accent="amber"]`
  - Orange/red accents instead of blue
  - Warmer tones for reduced eye strain
- [ ] Store both mode and accent in localStorage
  - `slew-theme-mode`: dark | light
  - `slew-theme-accent`: standard | amber
- [ ] Improve dark/light theme contrast and polish

---

## Implementation Order

1. **Phase 1: Video Tab Cleanup** (Core)
   - Rename tab to "Video"
   - Move renderer stats to Video tab
   - Reorganize output section with fixed order
   - Add inline expandable instructions
   - Add recording placeholder

2. **Phase 2: Layout Options**
   - Sidebar position (left/right)
   - UI zoom (80%-150%)

3. **Phase 3: Advanced & Fixes**
   - Fix action buttons
   - Fullscreen toggle
   - Custom CSS loading

4. **Phase 4: Appearance Tab**
   - Create new tab
   - Move theme toggle
   - Add mode + accent theme system (4 combinations)
   - Consolidate layout options

---

## Technical Notes

### Theme Implementation

Current theme uses CSS variables with `data-theme` attribute. New system will use two attributes:

```css
/* Base dark mode */
:root {
  --bg-primary: #05060a;
  --text-primary: #f1f5f9;
  --accent-primary: #3b82f6;
  /* ... */
}

/* Light mode */
[data-theme="light"] {
  --bg-primary: #f8fafc;
  --accent-primary: #2563eb;
  /* ... */
}

/* Amber accent on dark mode */
[data-accent="amber"] {
  --accent-primary: #f59e0b;
  --accent-primary-hover: #d97706;
  --accent-success: #84cc16;
  --accent-warning: #fb923c;
  /* Warmer tones */
}

/* Amber accent on light mode */
[data-theme="light"][data-accent="amber"] {
  --accent-primary: #d97706;
  --accent-primary-hover: #b45309;
  /* ... */
}
```

### Sidebar Position

In `App.tsx`, the current layout is:

```tsx
<main className={styles.main}>
  <div className={styles.content}>
    {/* Slots area (4/5 width) */}
    <section className={styles.slotsArea}>...</section>

    {/* Sidebar (1/5 width) */}
    <aside className={styles.sidebar}>...</aside>
  </div>
</main>
```

Add CSS class modifier for position:

```css
.content[data-sidebar="left"] {
  flex-direction: row-reverse;
}
```

### UI Zoom

Options for implementation:

1. **CSS `zoom`**: Simple but not standard, may cause layout issues
2. **`transform: scale()`**: Standard but requires adjusting container size
3. **CSS custom property + `font-size` base**: Most semantic but requires rem-based design

Recommended: Use CSS `zoom` with fallback awareness. Most WebView engines support it.

```css
#root {
  zoom: var(--ui-zoom, 1);
}
```

### Custom CSS

Use Tauri's file dialog:

```typescript
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";

const selected = await open({
  filters: [{ name: "CSS", extensions: ["css"] }],
});
if (selected) {
  const css = await readTextFile(selected);
  // Inject into document
}
```

---

## Files to Modify

| File                                                          | Changes                                    |
| ------------------------------------------------------------- | ------------------------------------------ |
| `src/components/DebugPanel/DebugPanel.tsx`                    | Add Appearance tab, reorganize tabs        |
| `src/components/VideoOutputPanel/VideoOutputPanel.tsx`        | Restructure with sections, rename header   |
| `src/components/VideoOutputPanel/VideoOutputPanel.module.css` | Update styles for new layout               |
| `src/tailwind.css`                                            | Add amber accent variables                 |
| `src/App.tsx`                                                 | Add sidebar position support, zoom support |
| `src/App.module.css`                                          | Add sidebar position variants              |
| New: `src/components/AppearancePanel/`                        | New component for appearance settings      |

---

## Success Criteria

### Phase 1: Video Tab Cleanup ✅ COMPLETE

- [x] Video tab renamed to "Video"
- [x] Video tab has clear sections: Renderer, Output, Recording
- [x] Renderer stats (DPR, resolution, FPS, backend) moved from Settings to Video
- [x] Output backends appear in consistent order (Syphon → NDI → Spout)
- [x] Unavailable backends are visually distinct (dimmed, clear reason)
- [x] "How to use" instructions are inline and expandable

### Phase 2: Layout Options ✅ COMPLETE

- [x] Sidebar can be positioned left or right
- [x] UI zoom works from 80% to 150%
- [x] Settings persist across sessions

### Phase 3: Advanced & Fixes

- [ ] Action buttons work correctly
- [ ] Fullscreen toggle works with keyboard shortcut
- [ ] Custom CSS can be loaded and removed

### Phase 4: Appearance Tab

- [ ] Appearance tab exists with theme, layout, and advanced sections
- [ ] Theme mode (dark/light) toggle works
- [ ] Amber accent toggle works
- [ ] All 4 theme combinations (dark, light, dark-amber, light-amber) display correctly
