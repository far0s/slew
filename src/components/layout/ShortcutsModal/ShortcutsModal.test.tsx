import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShortcutsModal } from "./ShortcutsModal";

vi.mock("@/inputs/tapTempo", () => ({
  subscribeTapShortcut: vi.fn((cb: (s: object) => void) => {
    cb({ key: " ", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    return () => {};
  }),
  getTapShortcut: vi.fn(() => ({
    key: " ",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  })),
  formatTapShortcut: vi.fn(() => "Space"),
}));

describe("ShortcutsModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
  });

  it("returns null when isOpen is false", () => {
    const { container } = render(<ShortcutsModal isOpen={false} onClose={onClose} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog when isOpen is true", () => {
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("displays formatted tap shortcut in a kbd element", () => {
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);
    const kbdEls = document.querySelectorAll("kbd");
    const tapKbd = Array.from(kbdEls).find((el) => el.textContent === "Space");
    expect(tapKbd).toBeTruthy();
  });

  it("calls onClose when backdrop is clicked", () => {
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when inner modal content is clicked", () => {
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    // The inner modal div is the first child of the dialog
    const inner = dialog.firstElementChild as HTMLElement;
    fireEvent.click(inner);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);
    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed while open", () => {
    render(<ShortcutsModal isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when Escape is pressed while closed", () => {
    render(<ShortcutsModal isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cleans up the keyboard event listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<ShortcutsModal isOpen={true} onClose={onClose} />);

    // Confirm listener was added
    const addCalls = addSpy.mock.calls.filter((c) => c[0] === "keydown");
    expect(addCalls.length).toBeGreaterThan(0);

    unmount();

    // The same handler should have been removed
    const removeCalls = removeSpy.mock.calls.filter((c) => c[0] === "keydown");
    expect(removeCalls.length).toBeGreaterThan(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
