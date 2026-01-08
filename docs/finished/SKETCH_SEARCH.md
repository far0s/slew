# Sketch Search/Filter

Add search functionality to the inline sketch browser.

---

## Status

✅ Complete

---

## Context

From `docs/BACKLOG.md`:

> **Context**: 13 sketches now, will grow. Current grouped browser works but no search capability makes browsing unwieldy.

Current implementation:

- `InlineSketchBrowser` in `SlotColumn.tsx` displays grouped sketches
- `SketchGroupSection` handles expand/collapse of groups
- 13 sketches across 3 groups: Aura (8), Examples (5), Advanced Examples (4)
- Sketches have `label`, `shortLabel`, and optional `description` fields

---

## Requirements

From backlog subtasks:

- [x] Add search input to inline sketch browser
- [x] Filter by name/description (fuzzy match)
- [x] Show matching count per group
- [x] Persist search state during session

---

## Design Decisions

### Search Algorithm

Case-insensitive substring matching against:

1. `label` (e.g., "Plasma")
2. `shortLabel` (e.g., "Plasma")
3. `description` (e.g., "Classic demoscene plasma effect...")

Fuzzy matching (Levenshtein distance) is overkill for 13 sketches. Simple substring search is fast and intuitive.

### Session Persistence

Use `sessionStorage` for search query persistence:

- Survives navigation within session
- Clears when user closes tab
- Shared across all slot browsers via storage key `slew-sketch-search`

### UI Behavior

- Search input at top of inline browser, below header
- Groups auto-expand when search has results
- Groups with no matches are hidden
- Match count shown as "X/Y" in group header when filtering (e.g., "2/8")
- Clear button (X) appears when query is non-empty
- Empty state when no sketches match with "Clear search" link
- Total results count shown at bottom (e.g., "3 sketches found")

### Accessibility

- Search input has `aria-label="Search sketches"`
- Clear button has `aria-label="Clear search"`
- Results count uses `aria-live="polite"` for screen reader announcements
- Keyboard navigation preserved (Tab to search, type, Tab to results)

---

## Implementation

### Files Modified

1. **`src/components/SlotColumn/SlotColumn.tsx`**
   - Added `useSketchSearch` hook for search state + sessionStorage sync
   - Added `sketchMatchesQuery()` utility for matching
   - Added `filterSketchGroups()` to filter groups by query
   - Updated `SketchGroupSection` with `isSearching` and `totalCount` props
   - Updated `InlineSketchBrowser` with search input and filtering UI
   - Added no-results state with "Clear search" button
   - Added results count display

2. **`src/components/SlotColumn/SlotColumn.module.css`**
   - `.searchContainer` - wrapper for search input with icon
   - `.searchIcon` - magnifying glass icon positioning
   - `.searchInput` - styled text input with hover/focus states
   - `.searchClear` - clear button with hover states
   - `.searchResultsCount` - subtle results count text
   - `.noResults` - centered empty state container
   - `.noResultsText` - muted text for no matches message
   - `.noResultsClear` - styled "Clear search" link button

---

## Testing

Manual testing completed:

- [x] Type in search box, sketches filter immediately
- [x] Matches work for label, shortLabel, description
- [x] Case-insensitive (e.g., "PLASMA" matches "Plasma")
- [x] Group headers show match count when filtering (e.g., "1/4")
- [x] Groups with no matches are hidden
- [x] Clear button clears search and shows all
- [x] Search persists when switching between empty slots (sessionStorage)
- [x] Search clears on page reload (sessionStorage behavior)
- [x] Keyboard: Tab to search, type, Tab to results
- [x] Empty state shows when no matches with "Clear search" link
- [x] Description matching works (e.g., "demoscene" finds Plasma)

---

## Notes

- Search icon uses Radix `MagnifyingGlassIcon`
- Clear button uses Radix `Cross2Icon` (already imported)
- No debounce needed - filtering 13 items is instant
- Groups auto-expand when searching to show all matches
