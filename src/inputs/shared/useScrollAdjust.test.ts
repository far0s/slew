import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrollAdjust } from "./useScrollAdjust";

/** Build a WheelEvent with custom deltas/modifiers attached to a real Event. */
function wheelEvent(deltaY: number, deltaX = 0, opts: Partial<{
  shiftKey: boolean; ctrlKey: boolean; metaKey: boolean;
}> = {}) {
  return Object.assign(new Event("wheel", { bubbles: true, cancelable: true }), {
    deltaY, deltaX,
    shiftKey: opts.shiftKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
  });
}

/** Attach the callback ref to a div, returning the div for convenience. */
function mount(ref: (el: HTMLElement | null) => void): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  act(() => ref(div));
  return div;
}

describe("useScrollAdjust", () => {
  it("increments on horizontal swipe right (negative deltaX)", () => {
    // On macOS trackpad: two-finger swipe right → deltaX < 0
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(0, -100)); }); // swipe right → increment
    expect(onChange).toHaveBeenCalledWith(0.6);

    document.body.removeChild(div);
  });

  it("decrements on horizontal swipe left (positive deltaX)", () => {
    // On macOS trackpad: two-finger swipe left → deltaX > 0
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(0, 100)); }); // swipe left → decrement
    expect(onChange).toHaveBeenCalledWith(0.4);

    document.body.removeChild(div);
  });

  it("ignores vertical-only scroll (deltaY only, no deltaX)", () => {
    // Vertical scroll must fall through so the parent column can scroll
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(-100, 0)); }); // pure vertical → ignored
    expect(onChange).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it("ignores event when |deltaY| >= |deltaX| (diagonal / mostly vertical)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(-80, -50)); }); // vertical dominates → ignored
    expect(onChange).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it("responds when |deltaX| > |deltaY| (mostly horizontal)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(-10, -200)); }); // horizontal dominates → increment
    expect(onChange).toHaveBeenCalledWith(0.6);

    document.body.removeChild(div);
  });

  it("applies fine step with Shift key (÷10)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(0, -100, { shiftKey: true })); }); // swipe right, fine
    expect(onChange).toHaveBeenCalledWith(0.51);

    document.body.removeChild(div);
  });

  it("applies coarse step with Ctrl key (×10), clamped to max", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(0, -100, { ctrlKey: true })); }); // 0.5 + 10×0.1 = 1.5 → clamped
    expect(onChange).toHaveBeenCalledWith(1);

    document.body.removeChild(div);
  });

  it("does nothing when not hovered", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    // No mouseenter — wheel should be ignored
    act(() => { div.dispatchEvent(wheelEvent(0, -100)); });
    expect(onChange).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it("does nothing when disabled", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1, true));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(0, -100)); });
    expect(onChange).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it("tracks isHovered via mouseenter/mouseleave", () => {
    const { result } = renderHook(() => useScrollAdjust(0.5, vi.fn(), 0.1, 0, 1));
    const div = mount(result.current.ref);

    expect(result.current.isHovered).toBe(false);
    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    expect(result.current.isHovered).toBe(true);
    act(() => { div.dispatchEvent(new MouseEvent("mouseleave")); });
    expect(result.current.isHovered).toBe(false);

    document.body.removeChild(div);
  });
});
