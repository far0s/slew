# Modulation (LFOs)

The Modulation system drives sketch parameters and FX parameters automatically over time using **LFOs** (Low Frequency Oscillators) and **audio reactivity**.

---

## What Is an LFO?

An LFO generates a repeating signal at a set rate and depth. Patched to a parameter, it makes that parameter oscillate automatically — a brightness that pulses, a rotation that sweeps, a blur that breathes.

---

## Adding an LFO

1. Open **Mod** tab in the sidebar
2. Click **+ LFO**
3. Set shape, rate, and depth
4. Click **Map** → select a target parameter

---

## LFO Shapes

| Shape | Description |
|-------|-------------|
| **Sine** | Smooth in-out wave. Good for organic motion |
| **Triangle** | Linear ramp up/down. Sharper than sine |
| **Saw** | Ramps up then snaps back. Good for rhythmic hits |
| **Square** | Binary on/off. Good for flashing or hard cuts |
| **Random** | New random value each cycle. Jitter/chaos |
| **Smooth Random** | Random values interpolated smoothly. Organic wander |

---

## LFO Controls

| Control | Description |
|---------|-------------|
| **Rate** | Cycles per second (Hz). 0.1 = slow drift, 4 = fast pulse |
| **Depth** | How much the parameter moves. 0 = no modulation, 1 = full range |
| **Phase** | Shift the waveform start point. Useful to offset multiple LFOs |

### BPM Sync

Enable **Sync to BPM** to lock the LFO rate to the global tempo. Rate becomes a note division (1/4, 1/8, etc.) instead of Hz. The LFO resets on each beat.

---

## Modulation-lfos Targets

Any **sketch parameter** or **FX parameter** can be a modulation target.

To patch an LFO:

1. Click **Map** in the Modulation panel header
2. The modulation map opens showing all LFOs and available targets
3. Drag from an LFO output to a parameter, or click to add a connection
4. Set **depth** and **offset** per connection

Multiple LFOs can target the same parameter — their outputs are summed.

---

## Audio Modulation

LFO depth can itself be driven by audio input. This makes the LFO's movement react to the loudness of a frequency band.

1. Add an audio mapping in the **Audio** panel first (maps a frequency band to a parameter)
2. In the Modulation panel, enable **Audio** on an LFO
3. Select the audio source band (bass, mid, high, or a specific Hz range)
4. The LFO depth scales with that band's energy in real time

---

## Removing Modulation

- Click the **×** on a connection in the modulation map to disconnect it
- Delete an LFO entirely from the LFO list — all its connections are removed

---

## Tips

- Use **Saw** shape synced to BPM for strobe-like parameter sweeps on the beat
- Stack two Sine LFOs at different rates on the same parameter for more complex motion
- **Smooth Random** on colour parameters creates organic colour drift without hard transitions
- Keep **Depth** low (0.1–0.3) for subtle motion that doesn't overpower the sketch
