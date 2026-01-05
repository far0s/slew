# MIDI Soft Takeover Indicator

Visual feedback for MIDI controller pickup state on parameter sliders.

**Status**: ✅ Implementation complete

---

## Overview

When a MIDI controller (fader/knob) is mapped to a parameter, the physical position may differ from the software value. Soft takeover prevents parameter jumps by requiring the controller to "cross" the current value before taking effect.

This feature adds a **ghost marker** on the slider track showing where the MIDI controller currently is, helping users understand when and where to move their controller to pick up the parameter.

---

## Current State

### Backend (Rust)

Soft takeover logic already exists in `src-tauri/src/midi/midimix.rs`:

```rust
pub(crate) struct PickupState {
    pub picked_up: bool,      // Whether control has picked up the parameter
    pub last_cc: Option<u8>,  // Last raw CC value (0-127)
    pub ignore_next: bool,    // Ignore next CC (reconnect handling)
}

// Stored in MidiEngineState
pub pickup_state: HashMap<(u8, u8), PickupState>,  // Key: (channel, cc_number)
```

The `check_and_update_pickup()` function determines if a CC value has crossed the parameter value.

**Problem**: This state is internal to Rust and not exposed to the frontend.

### Frontend (TypeScript)

- `ParameterSlider` component handles parameter display
- `useMidiMappings()` hook provides mapping data
- `isMidiControlled` prop disables direct user input when mapped
- No visibility into pickup state

---

## Design

### ASCII Mockups

#### Normal Slider (no MIDI mapping or already picked up)

```
┌────────────────────────────────────────────────────────┐
│ Brightness                                       0.65  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓●──────────────────────────── │
└────────────────────────────────────────────────────────┘
```

#### Soft Takeover Active (MIDI at 0.30, parameter at 0.65)

```
┌────────────────────────────────────────────────────────┐
│ Brightness                                ▸     0.65  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓●──────────────────────────── │
│           ◇                                            │
│           │                                            │
│     ghost marker                                       │
│  (move right to pickup)                                │
└────────────────────────────────────────────────────────┘

Legend:
  ● = Current parameter value (solid thumb)
  ◇ = MIDI controller position (ghost marker)
  ▸ = Direction indicator badge (shows which way to move)
```

#### Pickup Confirmed (brief flash animation)

```
┌────────────────────────────────────────────────────────┐
│ Brightness                            ✓ picked up 0.65│
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓●──────────────────────────── │
│                         ╰─ brief pulse, then fade out  │
└────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           RUST BACKEND                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   MIDI CC received                                                  │
│         │                                                           │
│         ▼                                                           │
│   check_and_update_pickup()                                         │
│         │                                                           │
│         ├──► Update PickupState                                     │
│         │                                                           │
│         ▼                                                           │
│   Emit "midi_pickup_state" event ◄────── NEW                        │
│   {                                                                 │
│     parameter_id: "slot_0_brightness",                              │
│     picked_up: false,                                               │
│     midi_value: 0.30,    // normalized to parameter range           │
│     direction: "right"   // "left" | "right" | null                 │
│   }                                                                 │
│                                                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼ Tauri event
┌─────────────────────────────────────────────────────────────────────┐
│                         TYPESCRIPT FRONTEND                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   useMidiPickupStates() hook  ◄────── NEW                           │
│         │                                                           │
│         ▼                                                           │
│   pickupStates: Map<parameter_id, PickupState>                      │
│         │                                                           │
│         ▼                                                           │
│   ParameterSlider receives pickupState prop                         │
│         │                                                           │
│         ▼                                                           │
│   Renders ghost marker + direction badge                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Event Throttling

CC messages can fire rapidly when moving a controller. To prevent UI thrashing:

- **Backend**: Throttle events to ~30fps (33ms) per parameter
- **Frontend**: Use CSS transitions for smooth ghost marker movement
- **Pickup events**: Always emit immediately (important feedback)

---

## Implementation Plan

### Phase 1: Backend - Expose Pickup State

#### 1.1 New Types (`src-tauri/src/midi/types.rs`)

```rust
/// Pickup state update sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiPickupStateUpdate {
    pub parameter_id: String,
    pub picked_up: bool,
    /// MIDI value normalized to parameter range (min_value to max_value)
    pub midi_value: f64,
    /// Direction to move: "left", "right", or null if picked up
    pub direction: Option<String>,
}
```

#### 1.2 Event Emission (`src-tauri/src/midi/midimix.rs`)

Modify `check_and_update_pickup()` to:

1. Calculate normalized MIDI value using mapping range
2. Determine direction (left/right based on current vs target)
3. Emit `midi_pickup_state` event when state changes or CC received

Add throttling:

```rust
// In MidiEngineState
pub last_pickup_event_time: HashMap<String, Instant>,  // Key: parameter_id

// Throttle to ~30fps (33ms)
const PICKUP_EVENT_THROTTLE_MS: u64 = 33;
```

#### 1.3 Tauri Command (`src-tauri/src/midi/commands.rs`)

```rust
#[tauri::command]
pub fn get_midi_pickup_states() -> Result<Vec<MidiPickupStateUpdate>, String>
```

Returns current pickup states for all active mappings.

### Phase 2: Frontend - New Hook

#### 2.1 Types (`src/inputs/midi.ts`)

```typescript
export interface MidiPickupState {
  parameter_id: string;
  picked_up: boolean;
  midi_value: number; // Normalized to parameter range
  direction: "left" | "right" | null;
}
```

#### 2.2 Hook (`src/inputs/midi.ts`)

```typescript
export function useMidiPickupStates(): {
  pickupStates: Map<string, MidiPickupState>;
  getPickupState: (parameterId: string) => MidiPickupState | undefined;
};
```

- Subscribes to `midi_pickup_state` event
- Maintains Map of parameter_id → PickupState
- Fetches initial state on mount via `get_midi_pickup_states` command
- Clears pickup state when mapping is removed

### Phase 3: UI Components

#### 3.1 ParameterSlider Updates

**New Props:**

```typescript
interface ParameterSliderProps {
  // ... existing props
  pickupState?: MidiPickupState | null;
}
```

**New CSS Elements:**

- `.ghostMarker` - Semi-transparent marker showing MIDI position
- `.directionBadge` - Small arrow badge next to label
- `.pickupFlash` - Brief pulse animation on successful pickup

#### 3.2 CSS Styling (`ParameterSlider.module.css`)

```css
/* Ghost marker showing MIDI controller position */
.ghostMarker {
  position: absolute;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
  background: var(--text-primary);
  opacity: 0.3;
  border: 2px dashed var(--text-secondary);
  pointer-events: none;
  transition: left 0.05s ease-out;
}

/* Direction indicator badge */
.directionBadge {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.05rem 0.25rem;
  border-radius: 0.2rem;
  background: color-mix(in srgb, var(--accent-warning) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-warning) 40%, transparent);
  color: var(--accent-warning);
  font-size: 0.55rem;
  font-weight: 600;
}

/* Pickup confirmation flash */
.pickupFlash {
  animation: pickupPulse 0.4s ease-out;
}

@keyframes pickupPulse {
  0% {
    box-shadow: 0 0 0 0 var(--accent-success);
  }
  50% {
    box-shadow: 0 0 8px 4px var(--accent-success);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .ghostMarker {
    transition: none;
  }
  .pickupFlash {
    animation: none;
  }
}
```

#### 3.3 SlotParameterControls Integration

Pass pickup state to ParameterSlider:

```typescript
const pickupState = midiPickupStates?.get(paramId);

<ParameterSlider
  // ... existing props
  pickupState={pickupState}
/>
```

### Phase 4: App Integration

#### 4.1 App.tsx Changes

```typescript
import { useMidiPickupStates } from "./inputs/midi";

// In App component
const { pickupStates: midiPickupStates } = useMidiPickupStates();

// Pass to SlotColumn
<SlotColumn
  // ... existing props
  midiPickupStates={midiPickupStates}
/>
```

#### 4.2 Prop Threading

- `App.tsx` → `SlotColumn` → `SlotParameterControls` → `ParameterSlider`

---

## Tasks Checklist

### Backend (Rust)

- [x] Add `MidiPickupStateUpdate` struct to `types.rs`
- [x] Add `PickupEventThrottle` and `pickup_event_throttle` HashMap to `MidiEngineState`
- [x] Modify `check_and_update_pickup()` to calculate and emit pickup state
- [x] Add throttling for pickup events (33ms)
- [x] Ensure pickup events always emit on state change (picked_up true/false)
- [x] Add `get_midi_pickup_states` Tauri command
- [x] Register command in `lib.rs`
- [ ] Add tests for pickup state emission

### Frontend (TypeScript)

- [x] Add `MidiPickupState` interface to `midi.ts`
- [x] Implement `useMidiPickupStates()` hook
- [x] Add `getPickupState` helper function
- [x] Handle event subscription and cleanup
- [x] Fetch initial state on mount
- [x] Add `getMidiPickupStates` API function

### UI Components

- [x] Add `pickupState` prop to `ParameterSlider`
- [x] Render ghost marker on slider track
- [x] Position ghost marker based on `midi_value`
- [x] Add direction badge ("▸" or "◂") next to value
- [x] Implement pickup flash animation
- [x] Add CSS for ghost marker, badge, and animation
- [x] Respect `prefers-reduced-motion`

### Integration

- [x] Add `useMidiPickupStates()` to `App.tsx`
- [x] Pass `midiPickupStates` through component tree
- [x] Update `SlotsArea` props
- [x] Update `SlotColumn` props
- [x] Update `SlotParameterControls` props
- [ ] Test with Midimix controller
- [ ] Test with other MIDI controllers

### Testing

- [ ] Unit tests for pickup state emission
- [ ] Unit tests for throttling logic
- [ ] Component tests for ParameterSlider with pickup state
- [ ] Manual testing with physical hardware

---

## Edge Cases

### Multiple Mappings to Same Parameter

Rare but possible. Behavior:

- Use first mapping's pickup state
- When any mapped controller picks up, show as picked up

### Mapping Removed While Not Picked Up

- Clear pickup state from frontend Map
- Ghost marker disappears immediately

### Device Disconnect

- `reset_all_pickup()` already handles this
- Emit pickup state updates for all mappings (picked_up: false, ignore_next: true)
- Ghost markers reappear when device reconnects

### Parameter Value Changed Externally

When parameter changes from non-MIDI source (UI drag, audio mapping, LFO):

- Pickup state resets (need to re-pick up)
- Current implementation already handles this via crossing detection

---

## Performance Considerations

1. **Event Throttling**: 30fps limit prevents flooding
2. **CSS Transitions**: Offload animation to compositor
3. **Map Lookup**: O(1) per parameter
4. **Minimal Re-renders**: Only affected sliders re-render

---

## Future Enhancements

- **Haptic Feedback**: (If controllers support it) vibrate on pickup
- **Configurable Threshold**: Adjust crossing tolerance in settings
- **Visual Customization**: User-selectable ghost marker style/color
- **Keyboard Nudge**: Arrow keys to fine-tune ghost position

---

## References

- `src-tauri/src/midi/midimix.rs` - Existing soft takeover logic
- `src-tauri/src/midi/types.rs` - MIDI type definitions
- `src/components/ParameterSlider/` - Slider component
- `src/inputs/midi.ts` - MIDI hooks
- `docs/finished/MIDIMIX_AND_ALPHA_REWORK.md` - Phase 9: Soft Takeover design
