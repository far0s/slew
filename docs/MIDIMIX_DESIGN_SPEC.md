# ⚠️ AGENT CONTEXT ONLY — MIDI / UI DESIGN SPEC (AKAI MIDIMIX)

This document defines **hard constraints** for implementing MIDI, UI state, and rendering logic for an **Akai MidiMix** in a **Tauri (Rust) + Vite + React + three.js / r3f / WebGPU** stack.

Agents MUST follow these rules. Violations are bugs.

---

## 1. Hardware Facts (Non‑Negotiable)

- Knobs & faders: absolute CC (0–127), **no feedback**
- Buttons: note on/off **with LED feedback**

**Invariant:** physical control position is NEVER authoritative.

---

## 2. Mandatory Architecture

### 2.1 Three Layers (Strict)

1. **MIDI Input Layer**
   - Raw CC / note messages only
   - No business logic

2. **Intent Layer (Canonical State)**
   - Abstract, scene‑safe values (e.g. `energy`, `presence`)
   - Normalized ranges (e.g. `0.0–1.0`)
   - Owns truth

3. **Render / Engine Layer**
   - three.js / r3f / WebGPU uniforms
   - Reads intent only

**Rule:** MIDI NEVER touches render state directly.

---

## 3. Absolute Controls → Relative Meaning

Agents SHOULD interpret CCs as deltas:

- Store last CC value per control
- Compute signed delta
- Apply scaled delta to intent value

This enables scene safety, mode switching, and gesture continuity.

---

## 4. Soft Takeover (Required)

For every absolute CC:

- Ignore input until it crosses the current intent value
- Reset pickup state on:
  - Scene change
  - MIDI reconnect
  - Mode change

On reconnect, discard the first CC per control.

---

## 5. Modes Are Explicit State

- Modes are first‑class state machines
- All CC handlers MUST read current mode
- Mode switches invalidate pickup state

If a control changes meaning, a button LED MUST reflect it.

---

## 6. Button LEDs = Output Channel

Buttons are the ONLY hardware feedback.

Agents MUST:
- Drive LEDs from canonical state
- Never mirror raw MIDI input

LEDs indicate:
- Active mode
- Armed / safe state
- Active targets

---

## 7. Scene Switching Contract

On scene change:
- Intent layer persists
- Render targets remap
- Pickup state resets

**Never:** implicitly reset intent values.

---

## 8. Value Shaping (Always)

Intent → render mapping MUST include:
- Clamping
- Non‑linear curves
- Dead zones

Precision is a liability in live contexts.

---

## 9. Forbidden Patterns

Agents MUST NOT:
- Bind CCs directly to uniforms
- Trust absolute CC values
- Use physical position as UI truth
- Map faders to master opacity or safety‑critical params

---

## 10. Failure Handling (Required)

Agents MUST handle:
- Scene switch mid‑gesture
- MIDI disconnect / reconnect
- App suspend / resume

Recovery:
- Re‑arm pickup
- Re‑sync LEDs
- Ignore stale CCs

---

## 11. Naming Rules

- MIDI naming allowed ONLY in input layer
- Intent names describe perceptual effect, not parameters
  - ✅ `energy`
  - ❌ `noiseAmplitude`

---

## 12. Core Philosophy

- Gesture > value
- Software owns reality
- Hardware is lossy input

Design for chaos, not studio conditions.

