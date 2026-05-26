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

  describe("pickupState ghost marker", () => {
    const basePickup = { parameter_id: "p1", midi_value: 0.8, direction: "left" as const };

    // The ghost dot is rendered as an extra SVG <circle> alongside the regular indicator dot.
    // CSS modules hash class names in tests, so we count circles instead of selecting by class.
    it("renders an extra SVG circle (ghost dot) when pickupState.picked_up is false", () => {
      const { container } = render(
        <KnobInput {...defaultProps} pickupState={{ ...basePickup, picked_up: false }} />,
      );
      // Regular render has 1 indicator dot circle; ghost adds a second one
      expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(2);
    });

    it("renders exactly 1 SVG circle (no ghost) when pickupState.picked_up is true", () => {
      const { container } = render(
        <KnobInput {...defaultProps} pickupState={{ ...basePickup, picked_up: true }} />,
      );
      expect(container.querySelectorAll("circle").length).toBe(1);
    });

    it("renders exactly 1 SVG circle (no ghost) when pickupState is null", () => {
      const { container } = render(<KnobInput {...defaultProps} pickupState={null} />);
      expect(container.querySelectorAll("circle").length).toBe(1);
    });
  });

  describe("modulationIndicator", () => {
    it("shows the LFO button with active title when modulationIndicator is provided", () => {
      render(
        <KnobInput
          {...defaultProps}
          onUnlinkLfo={vi.fn()}
          modulationIndicator={{ lfoName: "LFO-1" }}
        />,
      );
      const btn = screen.getByTitle(/Modulated by LFO-1/i);
      expect(btn).toBeInTheDocument();
    });

    it("shows LFO button with 'Link to LFO' title when modulationIndicator is absent", () => {
      render(<KnobInput {...defaultProps} onQuickLfo={vi.fn()} />);
      expect(screen.getByTitle("Link to LFO — continuous oscillation")).toBeInTheDocument();
    });

    it("does not render LFO button when neither onQuickLfo nor onUnlinkLfo is provided", () => {
      render(<KnobInput {...defaultProps} />);
      expect(screen.queryByTitle("Link to LFO — continuous oscillation")).not.toBeInTheDocument();
    });
  });

  describe("audioMapping", () => {
    it("shows beat button with active title when audioMapping is provided", () => {
      render(
        <KnobInput
          {...defaultProps}
          onUnlinkBeat={vi.fn()}
          audioMapping={{ sourceLabel: "Bass", color: "#f00" }}
        />,
      );
      const btn = screen.getByTitle(/Beat-mapped: Bass/i);
      expect(btn).toBeInTheDocument();
    });

    it("shows beat button with 'Link to beat' title when audioMapping is absent", () => {
      render(<KnobInput {...defaultProps} onQuickBeat={vi.fn()} />);
      expect(screen.getByTitle("Link to beat — pulses on detected beat")).toBeInTheDocument();
    });

    it("does not render beat button when neither onQuickBeat nor onUnlinkBeat is provided", () => {
      render(<KnobInput {...defaultProps} />);
      expect(screen.queryByTitle("Link to beat — pulses on detected beat")).not.toBeInTheDocument();
    });
  });

  describe("quick-action callbacks", () => {
    it("calls onQuickBeat when beat button is clicked (no audioMapping)", () => {
      const onQuickBeat = vi.fn();
      render(<KnobInput {...defaultProps} onQuickBeat={onQuickBeat} />);
      fireEvent.click(screen.getByTitle("Link to beat — pulses on detected beat"));
      expect(onQuickBeat).toHaveBeenCalledOnce();
    });

    it("calls onUnlinkBeat when beat button is clicked with audioMapping active", () => {
      const onUnlinkBeat = vi.fn();
      render(
        <KnobInput
          {...defaultProps}
          onUnlinkBeat={onUnlinkBeat}
          audioMapping={{ sourceLabel: "RMS", color: "#0f0" }}
        />,
      );
      fireEvent.click(screen.getByTitle(/Beat-mapped/i));
      expect(onUnlinkBeat).toHaveBeenCalledOnce();
    });

    it("calls onQuickLfo when LFO button is clicked (no modulationIndicator)", () => {
      const onQuickLfo = vi.fn();
      render(<KnobInput {...defaultProps} onQuickLfo={onQuickLfo} />);
      fireEvent.click(screen.getByTitle("Link to LFO — continuous oscillation"));
      expect(onQuickLfo).toHaveBeenCalledOnce();
    });

    it("calls onUnlinkLfo when LFO button is clicked with modulationIndicator active", () => {
      const onUnlinkLfo = vi.fn();
      render(
        <KnobInput
          {...defaultProps}
          onUnlinkLfo={onUnlinkLfo}
          modulationIndicator={{ lfoName: "LFO-2" }}
        />,
      );
      fireEvent.click(screen.getByTitle(/Modulated by LFO-2/i));
      expect(onUnlinkLfo).toHaveBeenCalledOnce();
    });

    it("does not render beat or LFO buttons when no callbacks are provided", () => {
      render(<KnobInput {...defaultProps} />);
      expect(screen.queryByTitle("Link to beat")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Link to LFO")).not.toBeInTheDocument();
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
