import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StepInput } from "./StepInput";

// number-flow renders an animated number — mock it for simple tests
vi.mock("@number-flow/react", () => ({
  default: ({ value }: { value: number }) => <span data-testid="number-flow">{value}</span>,
}));

const defaultProps = {
  id: "step-test",
  label: "Ray Steps",
  value: 8,
  min: 4,
  max: 16,
  step: 1,
  onChange: vi.fn(),
};

describe("StepInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders the current value", () => {
      render(<StepInput {...defaultProps} />);
      expect(screen.getByTestId("number-flow")).toHaveTextContent("8");
    });

    it("renders the label", () => {
      render(<StepInput {...defaultProps} />);
      expect(screen.getByText("Ray Steps")).toBeInTheDocument();
    });

    it("renders increment and decrement buttons", () => {
      render(<StepInput {...defaultProps} />);
      expect(screen.getByLabelText("Increase Ray Steps")).toBeInTheDocument();
      expect(screen.getByLabelText("Decrease Ray Steps")).toBeInTheDocument();
    });

    it("has spinbutton role with aria attributes", () => {
      render(<StepInput {...defaultProps} />);
      const spinner = screen.getByRole("spinbutton");
      expect(spinner).toHaveAttribute("aria-valuenow", "8");
      expect(spinner).toHaveAttribute("aria-valuemin", "4");
      expect(spinner).toHaveAttribute("aria-valuemax", "16");
    });
  });

  // ── Button clicks ─────────────────────────────────────────────────────

  describe("button clicks", () => {
    it("calls onChange with incremented value on + click", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByLabelText("Increase Ray Steps"));
      expect(onChange).toHaveBeenCalledWith(9);
    });

    it("calls onChange with decremented value on − click", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByLabelText("Decrease Ray Steps"));
      expect(onChange).toHaveBeenCalledWith(7);
    });

    it("clamps at max on + click", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} value={16} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByLabelText("Increase Ray Steps"));
      expect(onChange).toHaveBeenCalledWith(16);
    });

    it("clamps at min on − click", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} value={4} onChange={onChange} />);
      fireEvent.mouseDown(screen.getByLabelText("Decrease Ray Steps"));
      expect(onChange).toHaveBeenCalledWith(4);
    });
  });

  // ── Keyboard ──────────────────────────────────────────────────────────

  describe("keyboard", () => {
    it("increments with ArrowUp", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} onChange={onChange} />);
      const spinner = screen.getByRole("spinbutton");
      fireEvent.keyDown(spinner, { key: "ArrowUp" });
      expect(onChange).toHaveBeenCalledWith(9);
    });

    it("decrements with ArrowDown", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} onChange={onChange} />);
      const spinner = screen.getByRole("spinbutton");
      fireEvent.keyDown(spinner, { key: "ArrowDown" });
      expect(onChange).toHaveBeenCalledWith(7);
    });

    it("increments by ×10 with Shift+ArrowUp", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} value={4} onChange={onChange} />);
      const spinner = screen.getByRole("spinbutton");
      fireEvent.keyDown(spinner, { key: "ArrowUp", shiftKey: true });
      expect(onChange).toHaveBeenCalledWith(14);
    });

    it("clamps at max with ArrowUp", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} value={16} onChange={onChange} />);
      const spinner = screen.getByRole("spinbutton");
      fireEvent.keyDown(spinner, { key: "ArrowUp" });
      expect(onChange).toHaveBeenCalledWith(16);
    });

    it("calls onCommit on ArrowUp keyup", () => {
      const onCommit = vi.fn();
      render(<StepInput {...defaultProps} onCommit={onCommit} />);
      const spinner = screen.getByRole("spinbutton");
      fireEvent.keyDown(spinner, { key: "ArrowUp" });
      fireEvent.keyUp(spinner, { key: "ArrowUp" });
      expect(onCommit).toHaveBeenCalledOnce();
    });
  });

  // ── Click-to-edit ─────────────────────────────────────────────────────

  describe("click-to-edit", () => {
    it("shows input on value area click", () => {
      render(<StepInput {...defaultProps} />);
      fireEvent.click(screen.getByTestId("number-flow").parentElement!);
      expect(screen.getByDisplayValue("8")).toBeInTheDocument();
    });

    it("commits value on Enter", () => {
      const onChange = vi.fn();
      const onCommit = vi.fn();
      render(<StepInput {...defaultProps} onChange={onChange} onCommit={onCommit} />);
      fireEvent.click(screen.getByTestId("number-flow").parentElement!);
      const input = screen.getByDisplayValue("8") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "12" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith(12);
      expect(onCommit).toHaveBeenCalledWith(12, 8);
    });

    it("cancels on Escape without calling onChange", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} onChange={onChange} />);
      fireEvent.click(screen.getByTestId("number-flow").parentElement!);
      const input = screen.getByDisplayValue("8") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "12" } });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("clamps entered value to max", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} onChange={onChange} />);
      fireEvent.click(screen.getByTestId("number-flow").parentElement!);
      const input = screen.getByDisplayValue("8") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "99" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith(16);
    });

    it("clamps entered value to min", () => {
      const onChange = vi.fn();
      render(<StepInput {...defaultProps} onChange={onChange} />);
      fireEvent.click(screen.getByTestId("number-flow").parentElement!);
      const input = screen.getByDisplayValue("8") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "1" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onChange).toHaveBeenCalledWith(4);
    });
  });
});
