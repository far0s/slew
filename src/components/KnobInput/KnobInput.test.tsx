import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KnobInput } from "./KnobInput";

const defaultProps = {
  id: "knob-test",
  label: "Speed",
  value: 0.5,
  min: 0,
  max: 1,
  step: 0.01,
  onChange: vi.fn(),
};

describe("KnobInput", () => {
  describe("rendering", () => {
    it("renders a slider role element", () => {
      render(<KnobInput {...defaultProps} />);
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("renders the label", () => {
      render(<KnobInput {...defaultProps} />);
      expect(screen.getByText("Speed")).toBeInTheDocument();
    });

    it("renders formatted value", () => {
      render(<KnobInput {...defaultProps} value={0.75} />);
      expect(screen.getByText("0.75")).toBeInTheDocument();
    });

    it("uses custom formatValue", () => {
      render(
        <KnobInput
          {...defaultProps}
          value={0.5}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />,
      );
      expect(screen.getByText("50%")).toBeInTheDocument();
    });
  });

  describe("aria attributes", () => {
    it("sets aria-valuenow", () => {
      render(<KnobInput {...defaultProps} value={0.3} />);
      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("aria-valuenow", "0.3");
    });

    it("sets aria-valuemin and aria-valuemax", () => {
      render(<KnobInput {...defaultProps} min={10} max={200} />);
      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("aria-valuemin", "10");
      expect(slider).toHaveAttribute("aria-valuemax", "200");
    });
  });

  describe("keyboard interaction", () => {
    it("increments value with ArrowRight", () => {
      const onChange = vi.fn();
      render(<KnobInput {...defaultProps} value={0.5} step={0.1} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(onChange).toHaveBeenCalledWith(0.6);
    });

    it("decrements value with ArrowLeft", () => {
      const onChange = vi.fn();
      render(<KnobInput {...defaultProps} value={0.5} step={0.1} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowLeft" });
      expect(onChange).toHaveBeenCalledWith(0.4);
    });

    it("jumps to min with Home key", () => {
      const onChange = vi.fn();
      render(<KnobInput {...defaultProps} value={0.5} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "Home" });
      expect(onChange).toHaveBeenCalledWith(0);
    });

    it("jumps to max with End key", () => {
      const onChange = vi.fn();
      render(<KnobInput {...defaultProps} value={0.5} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "End" });
      expect(onChange).toHaveBeenCalledWith(1);
    });

    it("clamps at min", () => {
      const onChange = vi.fn();
      render(<KnobInput {...defaultProps} value={0} step={0.1} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowLeft" });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("clamps at max", () => {
      const onChange = vi.fn();
      render(<KnobInput {...defaultProps} value={1} step={0.1} onChange={onChange} />);
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("does not respond when isMidiControlled", () => {
      const onChange = vi.fn();
      render(
        <KnobInput {...defaultProps} onChange={onChange} isMidiControlled />,
      );
      const slider = screen.getByRole("slider");
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("click-to-edit", () => {
    it("shows an input when value button is clicked", () => {
      render(<KnobInput {...defaultProps} value={0.5} />);
      const valueBtn = screen.getByTitle("Click to enter value");
      fireEvent.click(valueBtn);
      expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    });

    it("is disabled when isMidiControlled", () => {
      render(<KnobInput {...defaultProps} isMidiControlled />);
      const valueBtn = screen.getByTitle("Click to enter value");
      expect(valueBtn).toBeDisabled();
    });
  });
});
