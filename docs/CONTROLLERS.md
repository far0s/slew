# Controller Reference

Hardware controller layouts and mappings for sebcat-vj.

---

## Akai Midimix

8-channel mixer-style controller with faders, knobs, and LED buttons.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    AKAI MIDIMIX                                         │
├─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┤
│  Col 1  │  Col 2  │  Col 3  │  Col 4  │  Col 5  │  Col 6  │  Col 7  │  Col 8  │ Master  │
│ (Slot1) │ (Slot2) │ (Slot3) │ (Slot4) │ (Slot5) │ (Slot6) │ (Slot7) │ (Slot8) │         │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│  (16)   │  (20)   │  (24)   │  (28)   │  (46)   │  (50)   │  (54)   │  (58)   │ [N25]   │
│  ◯ K1   │  ◯ K1   │  ◯ K1   │  ◯ K1   │  ◯ K1   │  ◯ K1   │  ◯ K1   │  ◯ K1   │ SEND ALL│
│  Param1 │  Param1 │  Param1 │  Param1 │  Param1 │  Param1 │  Param1 │  Param1 │  (LED)  │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│  (17)   │  (21)   │  (25)   │  (29)   │  (47)   │  (51)   │  (55)   │  (59)   │ [N26]   │
│  ◯ K2   │  ◯ K2   │  ◯ K2   │  ◯ K2   │  ◯ K2   │  ◯ K2   │  ◯ K2   │  ◯ K2   │ BANK ◀  │
│  Param2 │  Param2 │  Param2 │  Param2 │  Param2 │  Param2 │  Param2 │  Param2 │  (LED)  │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│  (18)   │  (22)   │  (26)   │  (30)   │  (48)   │  (52)   │  (56)   │  (60)   │ [N27]   │
│  ◯ K3   │  ◯ K3   │  ◯ K3   │  ◯ K3   │  ◯ K3   │  ◯ K3   │  ◯ K3   │  ◯ K3   │ BANK ▶  │
│  Param3 │  Param3 │  Param3 │  Param3 │  Param3 │  Param3 │  Param3 │  Param3 │  (LED)  │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│  [N1]   │  [N4]   │  [N7]   │ [N10]   │ [N13]   │ [N16]   │ [N19]   │ [N22]   │ [N25]   │
│  ▣ MUTE │  ▣ MUTE │  ▣ MUTE │  ▣ MUTE │  ▣ MUTE │  ▣ MUTE │  ▣ MUTE │  ▣ MUTE │ SENDALL │
│  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│  [N2]   │  [N5]   │  [N8]   │ [N11]   │ [N14]   │ [N17]   │ [N20]   │ [N23]   │ [N28]   │
│  ▣ SOLO │  ▣ SOLO │  ▣ SOLO │  ▣ SOLO │  ▣ SOLO │  ▣ SOLO │  ▣ SOLO │  ▣ SOLO │  ▣ SOLO │
│  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │ Master  │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│  [N3]   │  [N6]   │  [N9]   │ [N12]   │ [N15]   │ [N18]   │ [N21]   │ [N24]   │         │
│  ▣ REC  │  ▣ REC  │  ▣ REC  │  ▣ REC  │  ▣ REC  │  ▣ REC  │  ▣ REC  │  ▣ REC  │         │
│  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │  (LED)  │         │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │
│   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │
│  (19)   │  (23)   │  (27)   │  (31)   │  (49)   │  (53)   │  (57)   │  (61)   │  (62)   │
│  Alpha  │  Alpha  │  Alpha  │  Alpha  │  Alpha  │  Alpha  │  Alpha  │  Alpha  │ All/Mst │
│   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │   ║     │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘

Legend:
  ◯      = Rotary knob (CC)
  ▣/○    = Button with LED (Note On/Off)
  ║      = Fader (CC)
  (XX)   = CC number
  [NXX]  = Note number
  [N?]   = Note number TBD (see TODO below)
```

### Mappings

| Control      | Type | CC/Note                 | Function                        |
| ------------ | ---- | ----------------------- | ------------------------------- |
| Fader 1-8    | CC   | 19,23,27,31,49,53,57,61 | Slot 1-8 Alpha                  |
| Master Fader | CC   | 62                      | Fade all slots                  |
| Knob Row 1   | CC   | 16,20,24,28,46,50,54,58 | Slot Param 1                    |
| Knob Row 2   | CC   | 17,21,25,29,47,51,55,59 | Slot Param 2                    |
| Knob Row 3   | CC   | 18,22,26,30,48,52,56,60 | Slot Param 3                    |
| Mute 1-8     | Note | 1,4,7,10,13,16,19,22    | Toggle audio reactivity (mute)  |
| Solo 1-8     | Note | 2,5,8,11,14,17,20,23    | Isolate slot (solo)             |
| Rec Arm 1-8  | Note | 3,6,9,12,15,18,21,24    | Slot exists indicator           |
| SEND ALL     | Note | 25                      | (No LED)                        |
| BANK LEFT    | Note | 26 (LED: 25)            | Beat indicator (pulses on beat) |
| BANK RIGHT   | Note | 27 (LED: 26)            | Beat indicator (pulses on beat) |
| Master SOLO  | Note | 28                      | (No LED)                        |

### LED Control

- LEDs respond to Note On (velocity > 0 = on, velocity 0 = off)
- **Mute LED**: ON = audio reactive, OFF = audio muted (or no sketch)
- **Solo LED**: OFF normally (could flash on press in future)
- **Rec Arm LED**: ON = slot has sketch loaded, OFF = empty slot
- **Bank Left/Right LEDs**: Pulse together on detected audio beats (BPM indicator)

**Note**: Master column LED note numbers are offset by 1 from button input notes:

- SEND ALL and Master SOLO buttons have no physical LEDs
- Bank Left button sends note 26, but LED responds to note 25
- Bank Right button sends note 27, but LED responds to note 26

### Button Functions

- **Mute buttons** (top row): Toggle audio reactivity for the slot
  - When muted, audio mappings targeting that slot are ignored
  - LED indicates current state (ON = audio active, OFF = muted)
- **Solo buttons** (middle row): Isolate the slot
  - Sets target slot alpha to 1.0, all other slots to 0.0
  - Transition uses smooth parameter animation
- **Rec Arm buttons** (bottom row): Currently indicator only

### Auto-Setup

On connect:

1. Input + Output paired automatically
2. Faders auto-mapped to slot alphas
3. Knobs auto-mapped to first 3 sketch parameters per slot
4. LED startup animation plays (cascade wave)

---

## DOIO Megalodon Macropad

16-key macropad with 3 rotary encoders. Connected via HID (not MIDI).

```
┌───────────────────────────────────────────────┐
│              DOIO MEGALODON                   │
│                                               │
│    ◎ Enc0      ◎ Enc1      ◎ Enc2            │
│    Param       Param       Param              │
│    (push)      (push)      (push)             │
│                                               │
├───────────┬───────────┬───────────┬───────────┤
│           │           │           │           │
│   [K01]   │   [K02]   │   [K03]   │   [K04]   │
│  Slot 1   │  Slot 2   │  Slot 3   │  Slot 4   │
│           │           │           │           │
├───────────┼───────────┼───────────┼───────────┤
│           │           │           │           │
│   [K05]   │   [K06]   │   [K07]   │   [K08]   │
│  Slot 5   │  Slot 6   │  Slot 7   │  Slot 8   │
│           │           │           │           │
├───────────┼───────────┼───────────┼───────────┤
│           │           │           │           │
│   [K09]   │   [K10]   │   [K11]   │   [K12]   │
│           │           │           │ Crossfade │
│           │           │           │  (Action) │
├───────────┼───────────┼───────────┼───────────┤
│           │           │           │           │
│   [K13]   │   [K14]   │   [K15]   │   [K16]   │
│           │           │           │           │
│           │           │           │           │
└───────────┴───────────┴───────────┴───────────┘

Legend:
  ◎      = Rotary encoder with push button
  [KXX]  = Key (mechanical switch)
```

### Mappings

| Control   | Function                           |
| --------- | ---------------------------------- |
| Keys 1-8  | Select slot for parameter control  |
| Key 12    | Trigger crossfade to selected slot |
| Encoder 0 | Control parameter on selected slot |
| Encoder 1 | Control parameter on selected slot |
| Encoder 2 | Control parameter on selected slot |

### HID Protocol

- Vendor ID: `0xD010` (53264)
- Product ID: `0x1601` (5633)
- Reports encoder deltas and key press/release events
- Auto-connects when plugged in

---

## Adding New Controllers

To add support for a new controller:

1. **MIDI Controllers**: Add profile in `src-tauri/src/midi.rs`
   - Define CC/Note constants
   - Add detection pattern (device name matching)
   - Implement auto-mapping in `setup_*_default_mappings()`

2. **HID Controllers**: Add profile in `src-tauri/src/hid.rs`
   - Define Vendor/Product IDs
   - Implement report parsing for the device's HID protocol
   - Add to device detection in `is_supported_device()`

3. **Document**: Add ASCII diagram and mapping table to this file
