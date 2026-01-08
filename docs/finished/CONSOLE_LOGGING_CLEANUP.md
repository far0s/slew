# Console Logging Cleanup

**Status**: ✅ Complete  
**Date**: 2025-01-08

---

## Summary

Implemented a centralized logging utility and aggressively reduced console logging from 124 calls to just 65 essential logs (51 errors, 14 warnings). All debug/info logs removed. Error logs retained only for failures invisible to users. Production builds are now silent except for actual errors.

---

## Problem

The codebase had 124+ console logging calls scattered throughout:

- **Performance impact**: Console operations have overhead, especially with frequent logging
- **Debug noise**: Users would see internal debug messages in browser console
- **Inconsistent formatting**: Mixed logging styles made filtering difficult
- **No production control**: All logs visible regardless of build environment

## Final Result

| Metric              | Before | After |
| ------------------- | ------ | ----- |
| Total console calls | 124+   | 65    |
| Error logs          | ~45    | 51    |
| Warning logs        | ~15    | 14    |
| Debug/Info logs     | ~64    | 0     |

---

## Solution

### Logger Utility (`src/lib/logger.ts`)

A lightweight, environment-aware logging utility with four levels:

| Level   | Production | Development | Description                    |
| ------- | ---------- | ----------- | ------------------------------ |
| `debug` | Hidden     | Shown       | Detailed debugging information |
| `info`  | Hidden     | Shown       | General informational messages |
| `warn`  | Shown      | Shown       | Warning conditions             |
| `error` | Shown      | Shown       | Error conditions               |

### Key Features

1. **Environment Detection**: Uses Vite's `import.meta.env.DEV` to detect development mode
2. **Runtime Toggle**: `localStorage.setItem('debug', 'true')` enables debug logs in production
3. **Consistent Format**: All logs follow `[Context] Message` pattern
4. **Type-Safe**: Full TypeScript support with proper typing
5. **Zero Dependencies**: Pure TypeScript, no external packages

### API

```typescript
import { logger } from "@/lib/logger";

// Levels
logger.debug("Renderer", "Subscribed to events"); // Dev only
logger.info("VideoCapture", "Using WebGPU backend"); // Dev only
logger.warn("MIDI", "Device disconnected"); // Always shown
logger.error("Audio", "Failed to initialize", error); // Always shown

// Runtime controls
logger.isDebugEnabled(); // Check current state
logger.enableDebug(); // Enable debug logs (persisted)
logger.disableDebug(); // Disable debug logs
```

---

## Implementation Details

### Logs Removed Entirely

These categories of logs were removed as they provide no diagnostic value:

| Category                   | Examples                                 | Reason                              |
| -------------------------- | ---------------------------------------- | ----------------------------------- |
| Subscription confirmations | "Subscribed to all_slots_changed events" | If it fails, error is logged        |
| Hydration success          | "Hydrated 8 slots from backend"          | If it works, app works              |
| State changes              | "Slot pairing: slot 0 → slot 1"          | Constant noise, no diagnostic value |
| Init details               | "PBOs initialized: 1920x1080"            | Implementation details              |
| Periodic stats             | "VideoCapture: 300 frames @ 60fps"       | Development-only                    |
| WebGPU detection           | "Using WebGPU renderer"                  | Visible in dev tools                |
| UI action failures         | Panel CRUD errors                        | User sees failure in UI             |

### Files Modified

**Core (kept error logs):**

- `src/App.tsx` - 12 error logs for core failures
- `src/renderer/RendererRoot.tsx` - 7 error logs + 2 warnings for heartbeat
- `src/renderer/VideoOutputCapture.tsx` - 5 error logs for capture failures
- `src/hooks/useWindowManager.ts` - 7 errors + 4 warnings for window management
- `src/hooks/useRendererSettings.ts` - 6 warnings for settings sync
- Input hooks (`audio.ts`, `hid.ts`, `midi.ts`, `osc.ts`) - 14 errors for device issues
- Shared hooks (`useMappings.ts`, `useEventListener.ts`) - 6 errors + 1 warning

**UI Panels (removed all logs - failures self-evident):**

- `src/components/ModulationPanel/` - 12 logs removed
- `src/components/AudioPanel/` - 6 logs removed
- `src/components/MidiPanel/` - 3 logs removed
- `src/components/OscPanel/` - 4 logs removed
- `src/components/SlotParameterControls/` - 4 logs removed
- `src/components/Sidebar/` - 1 log removed
- `src/components/MidiLearnButton/` - 1 log removed

**Other removals:**

- `src/sketches/Examples/TslText3D/` - Font error removed (visual failure obvious)
- `src/slots/useSlots.ts` - Hydration logs removed
- `src/renderer/WebGPUCanvas.tsx` - Backend detection logs removed

### Log Philosophy

**Kept as `logger.error`** (51 total):

- Core app failures (crossfade, sync, parameter loading)
- Renderer failures (hydration, subscription, color parsing)
- Video capture failures (PBO, backend, send errors)
- Window management failures
- Device/input failures (audio, MIDI, HID, OSC)
- Event listener failures

**Kept as `logger.warn`** (14 total):

- Heartbeat failures (may indicate unresponsive window)
- Buffer size mismatches (indicates real bugs)
- Settings sync failures
- Unresponsive window notifications
- Missing configurations

**Removed entirely** (59 logs):

- All debug/info logs
- UI panel action errors (user sees failure)
- Subscription confirmations
- Hydration success messages
- State change notifications
- Periodic stats/timing logs
- Initialization details

---

## Testing

- All 145 existing tests pass
- TypeScript compiles with no errors
- Manual verification in dev mode (logs visible) and production build (debug logs hidden)

---

## Usage Notes

### When to Add Logs

**Add `logger.error`** when:

- An operation fails AND the user cannot see the failure
- The failure is silent but affects functionality
- Debugging would be difficult without the log

**Add `logger.warn`** when:

- Something unexpected happened but the app continues
- A condition indicates a potential bug
- The issue might need investigation

**DO NOT add logs** when:

- The UI already shows the failure (button didn't work, list didn't update)
- It's just confirmation that something worked
- It fires frequently (every frame, every event)
- It's only useful during active development

### Enabling Debug Logs in Production

The logger utility supports runtime debug enabling, but with no debug logs remaining in the codebase, this is mainly for future use:

```javascript
// In browser console
localStorage.setItem("debug", "true");
// Refresh the page
```

---

## Related

- `src/lib/logger.ts` - Logger implementation
- `docs/CHANGELOG.md` - Feature announcement

## Metrics

- **Before**: 124+ console calls
- **After**: 65 logger calls (51 error, 14 warn, 0 debug/info)
- **Reduction**: ~48% fewer logs
- **Production noise**: Zero (errors/warnings only fire on actual failures)
