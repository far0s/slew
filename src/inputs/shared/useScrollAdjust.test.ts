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
  it("increments on scroll up (negative deltaY)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(-100)); });
    expect(onChange).toHaveBeenCalledWith(0.6);

    document.body.removeChild(div);
  });

  it("decrements on scroll down (positive deltaY)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(100)); });
    expect(onChange).toHaveBeenCalledWith(0.4);

    document.body.removeChild(div);
  });

  it("uses horizontal axis when |deltaX| > |deltaY|", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    // deltaX=-200, deltaY=-10 → horizontal dominates; -deltaX → positive → increment
    act(() => { div.dispatchEvent(wheelEvent(-10, -200)); });
    expect(onChange).toHaveBeenCalledWith(0.6);

    document.body.removeChild(div);
  });

  it("applies fine step with Shift key (÷10)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(-100, 0, { shiftKey: true })); });
    expect(onChange).toHaveBeenCalledWith(0.51);

    document.body.removeChild(div);
  });

  it("applies coarse step with Ctrl key (×10), clamped to max", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(-100, 0, { ctrlKey: true })); });
    expect(onChange).toHaveBeenCalledWith(1); // 0.5 + 10×0.1 = 1.5 → clamped to 1

    document.body.removeChild(div);
  });

  it("does nothing when not hovered", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1));
    const div = mount(result.current.ref);

    // No mouseenter — wheel should be ignored
    act(() => { div.dispatchEvent(wheelEvent(-100)); });
    expect(onChange).not.toHaveBeenCalled();

    document.body.removeChild(div);
  });

  it("does nothing when disabled", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useScrollAdjust(0.5, onChange, 0.1, 0, 1, true));
    const div = mount(result.current.ref);

    act(() => { div.dispatchEvent(new MouseEvent("mouseenter")); });
    act(() => { div.dispatchEvent(wheelEvent(-100)); });
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
