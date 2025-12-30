# Global UI Cleanup

Task document for improving UI consistency, readability, and behavior across the Controls window.

---

## Status

✅ **Complete**

---

## Goals

1. Fix scrolling behavior (remove springy/bouncy effect)
2. Reorganize sidebar tabs (Settings first, remove redundant titles)
3. Move footer actions to Settings tab
4. Add dark/light theme toggle with basic light theme
5. Improve panel consistency (MIDI, Video, etc.)

---

## Plan

### Phase 1: Global Scroll Behavior ✅

- [x] Add `overscroll-behavior: contain` to scrollable elements
- [x] Added custom scrollbar styles for consistency
- Target: `reset.css`

### Phase 2: Tab Structure Improvements ✅

- [x] Make tab list wrap to multiple rows on narrow viewports
- [x] Move Settings tab to first position in tab order
- [x] Change default tab from "midi" to "settings"
- [x] Remove redundant `<h3>` title headers from all panel components:
  - [x] MidiPanel
  - [x] OscPanel
  - [x] AudioPanel
  - [x] HidPanel
  - [x] ModulationPanel
  - [x] VideoOutputPanel (no title existed, but simplified structure)
  - [x] Settings (inline in DebugPanel - reorganized into sections)

### Phase 3: Settings Tab Enhancements ✅

- [x] Move footer content (restart buttons, keyboard shortcuts) into Settings tab
- [x] Remove the footer element from DebugPanel
- [x] Add dark/light theme toggle
- [x] Implement basic theme system (CSS custom properties in tailwind.css)
- [x] Create light theme color palette
- [x] Created `useTheme` hook with localStorage persistence

### Phase 4: Panel Consistency ✅

- [x] MIDI: Move "Clear All Mappings" button to Mappings section header (match Audio pattern)
- [x] Video: Remove unnecessary Collapsible wrapper, show content directly
- [x] Added badge showing mapping count to MIDI panel section header

### Phase 5: Scene Parameters Condensed Layout ✅

- [x] Reduced vertical spacing in ParameterSlider component
- [x] Replaced inline description with info popover button
- [x] Made slider track and thumb smaller
- [x] Reduced spacing in SlotParameterControls container
- [x] Made audio/modulation badges more compact

### Phase 6: Follow-up Fixes ✅

- [x] Info popover now appears on hover (not click), stays when focused or hovering popover
- [x] Fixed MIDI Learn button layout shift by making remove icon overlay instead of inline
- [x] Increased vertical spacing between parameters with subtle separators
- [x] Merged "Keyboard Shortcuts" and "Window Actions" into single "Actions" section with button rows
- [x] Fixed sidebar tabs to spread evenly using CSS grid (no lonely Video tab on second row)
- [x] Applied theme CSS variables throughout (light mode now works)
- [x] Restored panel title headers (MIDI, OSC, Audio, HID, Modulation, Video Output)

---

## Files to Modify

| File                                                                    | Changes                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `src/reset.css`                                                         | Add `overscroll-behavior: contain`             |
| `src/components/DebugPanel/DebugPanel.tsx`                              | Reorder tabs, remove footer, add theme toggle  |
| `src/components/DebugPanel/DebugPanel.module.css`                       | Tab list wrapping, remove footer styles        |
| `src/components/MidiPanel/MidiPanel.tsx`                                | Remove title, move Clear All to section header |
| `src/components/MidiPanel/MidiPanel.module.css`                         | Adjust header styles                           |
| `src/components/OscPanel/OscPanel.tsx`                                  | Remove title                                   |
| `src/components/AudioPanel/AudioPanel.tsx`                              | Remove title                                   |
| `src/components/HidPanel/HidPanel.tsx`                                  | Remove title                                   |
| `src/components/ModulationPanel/ModulationPanel.tsx`                    | Remove title                                   |
| `src/components/VideoOutputPanel/VideoOutputPanel.tsx`                  | Remove Collapsible, show content directly      |
| `src/tailwind.css`                                                      | Add theme CSS variables, light theme           |
| `src/components/ParameterSlider/ParameterSlider.tsx`                    | Add info popover for descriptions              |
| `src/components/ParameterSlider/ParameterSlider.module.css`             | Condensed styling, popover styles              |
| `src/components/SlotParameterControls/SlotParameterControls.module.css` | Reduced gaps                                   |
| `src/components/MidiLearnButton/MidiLearnButton.module.css`             | Fixed layout shift on hover                    |

---

## Theme System Design

### Approach

Use CSS custom properties (variables) at `:root` level with a `[data-theme="light"]` selector for light mode.

### Key Variables

```css
:root {
  --bg-primary: #05060a;
  --bg-elevated: #0b0c12;
  --bg-panel: #020617;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --border-subtle: rgba(255, 255, 255, 0.06);
  --accent: #3b82f6;
}

[data-theme="light"] {
  --bg-primary: #f8fafc;
  --bg-elevated: #ffffff;
  --bg-panel: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #64748b;
  --border-subtle: rgba(0, 0, 0, 0.08);
  --accent: #2563eb;
}
```

### Theme Toggle Implementation

- Store preference in localStorage
- Apply `data-theme` attribute to `<html>` element
- Create `useTheme` hook for React components

---

## Progress Log

### Session 1

- Analyzed current UI structure
- Identified inconsistencies across panels
- Created this working document

### Session 1 (continued) - Implementation Complete

- **Phase 1**: Added `overscroll-behavior: contain` to `reset.css`, plus custom scrollbar styles
- **Phase 2**:
  - Reordered tabs with Settings first, changed default to "settings"
  - Added `flex-wrap: wrap` to tab list for narrow viewports
  - Removed redundant title headers from all 6 panel components
- **Phase 3**:
  - Reorganized Settings tab with sections (Appearance, Transition Times, Keyboard Shortcuts, Window Actions)
  - Added theme toggle with `useTheme` hook
  - Created CSS custom properties for dark/light themes in `tailwind.css`
  - Moved restart buttons and shortcuts from footer to Settings
  - Removed footer from DebugPanel
- **Phase 4**:
  - MIDI: Added `sectionHeaderWithAction` pattern with Clear All button in header
  - Video: Removed Collapsible, simplified to direct content display
  - Added mappings badge to MIDI section header

**Files Modified:**

- `src/reset.css` - scroll behavior, custom scrollbars
- `src/tailwind.css` - theme CSS variables
- `src/components/DebugPanel/DebugPanel.tsx` - complete restructure
- `src/components/DebugPanel/DebugPanel.module.css` - new styles
- `src/components/MidiPanel/MidiPanel.tsx` - section header pattern
- `src/components/MidiPanel/MidiPanel.module.css` - new styles
- `src/components/OscPanel/OscPanel.tsx` - removed title
- `src/components/AudioPanel/AudioPanel.tsx` - removed title
- `src/components/HidPanel/HidPanel.tsx` - removed title
- `src/components/ModulationPanel/ModulationPanel.tsx` - removed title
- `src/components/VideoOutputPanel/VideoOutputPanel.tsx` - simplified structure
- `src/components/VideoOutputPanel/VideoOutputPanel.module.css` - updated styles
- `src/components/ParameterSlider/ParameterSlider.tsx` - info popover for descriptions
- `src/components/ParameterSlider/ParameterSlider.module.css` - condensed layout, popover styles
- `src/components/SlotParameterControls/SlotParameterControls.module.css` - reduced gaps

### Session 2 - Follow-up Fixes

Based on user feedback:

- Info popover changed from click to hover behavior with proper focus/hover retention
- MIDI Learn button layout shift fixed (remove icon now overlays instead of pushing)
- Increased vertical spacing between parameters with subtle border separators
- Merged Keyboard Shortcuts + Window Actions into unified Actions section
- Sidebar tabs now use CSS grid for even distribution
- Applied theme CSS variables to App, DebugPanel, and other components
- Restored panel title headers that were previously removed

**Files Modified:**

- `src/components/ParameterSlider/ParameterSlider.tsx` - hover-based popover
- `src/components/ParameterSlider/ParameterSlider.module.css` - spacing, separators
- `src/components/SlotParameterControls/SlotParameterControls.module.css` - increased gaps
- `src/components/MidiLearnButton/MidiLearnButton.module.css` - overlay remove icon
- `src/components/DebugPanel/DebugPanel.tsx` - merged Actions section
- `src/components/DebugPanel/DebugPanel.module.css` - grid tabs, theme vars, actions
- `src/App.module.css` - theme CSS variables
- `src/tailwind.css` - body theme styles
- All panel components - restored title headers

**Status:** All 6 phases complete. TypeScript compiles without errors.

### Session 3 - Light Mode Contrast & Layout Fixes

Based on user feedback about light mode readability:

- **Panel theme variables**: Converted all sidebar panels from hardcoded white rgba colors to theme-aware CSS variables:
  - OscPanel, AudioPanel, HidPanel, ModulationPanel, VideoOutputPanel
  - Replaced `rgb(255 255 255 / x%)` with `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`, `var(--bg-hover)`, `var(--border-default)`, etc.
  - Used `color-mix()` for subtle backgrounds and glows
- **MIDI Learn button contrast**: Added light-mode-specific CSS variables for mapped/learning states with stronger borders and darker text
- **Border contrast**: Increased light-mode border opacity (`--border-subtle`, `--border-default`) for better visibility
- **Slot column borders**: Increased thickness to 1.5px and used `var(--border-default)`
- **Preview overlay**: Added padding/inset for overlay buttons, made them more compact
- **Tab layout**: Changed from flex stretch to natural-width centered tabs with CSS grid; active tab uses filled background instead of bottom border

**Files Modified:**

- `src/tailwind.css` - added light-mode MIDI variables, increased border contrast
- `src/components/MidiLearnButton/MidiLearnButton.module.css` - theme-aware styles, light-mode overrides
- `src/components/SlotColumn/SlotColumn.module.css` - border thickness, preview button layout
- `src/components/RendererPreview/RendererPreview.module.css` - border consistency
- `src/components/DebugPanel/DebugPanel.module.css` - tab layout, theme variables
- `src/components/OscPanel/OscPanel.module.css` - theme variables
- `src/components/AudioPanel/AudioPanel.module.css` - theme variables
- `src/components/ModulationPanel/ModulationPanel.module.css` - theme variables
- `src/components/HidPanel/HidPanel.module.css` - theme variables
- `src/components/VideoOutputPanel/VideoOutputPanel.module.css` - theme variables

**Status:** Light mode now fully readable across all panels. TypeScript compiles without errors.

### Session 4 - Window Sizing Fixes

Fixed two lingering issues before wrapping up the UI cleanup:

1. **Renderer window size in dev mode**: Window was opening very small on secondary monitors
   - Root cause: In dev mode, the renderer window position was set but size was not explicitly set
   - Fix: Added explicit `set_size()` call to ensure 1920×1080 (scaled for monitor DPI) before positioning
   - File: `src-tauri/src/lib.rs`

2. **Preview canvas not filling container width**: Canvas in slot previews didn't take full width until a resize event
   - Root cause: r3f Canvas has issues with initial sizing when container uses CSS `aspect-ratio`
   - Fix: Two-part solution:
     - CSS rule forces r3f Canvas container to use absolute positioning (`.previewContainer > div:has(canvas)`)
     - `PreviewContainer` component triggers `window.dispatchEvent(new Event("resize"))` after 1 second delay
   - Files: `src/components/SlotColumn/SlotColumn.tsx`, `src/components/SlotColumn/SlotColumn.module.css`

**Files Modified:**

- `src-tauri/src/lib.rs` - explicit window sizing in dev mode
- `src/components/SlotColumn/SlotColumn.tsx` - PreviewContainer with resize trigger
- `src/components/SlotColumn/SlotColumn.module.css` - absolute positioning for canvas container

**Status:** Both issues resolved. All compilation checks pass.

---

## Notes

- Search bar feature removed from scope per user feedback
- Light theme is now production-ready with proper contrast across all panels
- Tab wrapping preferred over horizontal scroll for narrow viewports
- Canvas overlay elements (slot badges, preview buttons) intentionally use white-on-dark since they sit on the always-dark 3D canvas
