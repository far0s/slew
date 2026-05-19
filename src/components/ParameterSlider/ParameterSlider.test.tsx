import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParameterSlider } from "./ParameterSlider";

// Mock the MidiLearnButton component
vi.mock("../MidiLearnButton", () => ({
  MidiLearnButton: ({ parameterId }: { parameterId: string }) => (
    <button data-testid={`midi-learn-${parameterId}`}>MIDI Learn</button>
  ),
}));

describe("ParameterSlider", () => {
  const defaultProps = {
    id: "test-slider",
    label: "Brightness",
    value: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  describe("rendering", () => {
    it("renders with label", () => {
      render(<ParameterSlider {...defaultProps} />);
      expect(screen.getByText("Brightness")).toBeInTheDocument();
    });

    it("displays formatted value", () => {
      render(<ParameterSlider {...defaultProps} value={0.75} />);
      expect(screen.getByText("0.75")).toBeInTheDocument();
    });

    it("uses custom formatValue function", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          value={50}
          min={0}
          max={100}
          formatValue={(v) => `${v}%`}
        />,
      );
      expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("renders slider element", () => {
      render(<ParameterSlider {...defaultProps} />);
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("has accessible name from label", () => {
      render(<ParameterSlider {...defaultProps} />);
      // Radix UI Slider uses aria-labelledby or the label element
      expect(screen.getByRole("slider")).toBeInTheDocument();
      expect(screen.getByText("Brightness")).toBeInTheDocument();
    });

    it("slider is accessible with custom aria-label", () => {
      render(
        <ParameterSlider {...defaultProps} aria-label="Adjust brightness" />,
      );
      // The slider should be rendered and accessible
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Slider attributes
  // ===========================================================================

  describe("slider attributes", () => {
    it("sets min attribute", () => {
      render(<ParameterSlider {...defaultProps} min={0} />);
      expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemin", "0");
    });

    it("sets max attribute", () => {
      render(<ParameterSlider {...defaultProps} max={100} />);
      expect(screen.getByRole("slider")).toHaveAttribute(
        "aria-valuemax",
        "100",
      );
    });

    it("sets current value", () => {
      render(<ParameterSlider {...defaultProps} value={0.5} />);
      expect(screen.getByRole("slider")).toHaveAttribute(
        "aria-valuenow",
        "0.5",
      );
    });
  });

  // ===========================================================================
  // Value changes
  // ===========================================================================

  describe("value changes", () => {
    it("calls onChange when value changes", () => {
      const handleChange = vi.fn();
      render(<ParameterSlider {...defaultProps} onChange={handleChange} />);

      const slider = screen.getByRole("slider");

      // Simulate keyboard interaction (arrow key)
      fireEvent.keyDown(slider, { key: "ArrowRight" });

      expect(handleChange).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Description / Info
  // ===========================================================================

  describe("description", () => {
    it("shows info button when description provided", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          description="Adjusts the overall brightness"
        />,
      );
      expect(screen.getByRole("button", { name: /info/i })).toBeInTheDocument();
    });

    it("does not show info button when no description", () => {
      render(<ParameterSlider {...defaultProps} />);
      expect(
        screen.queryByRole("button", { name: /info/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // MIDI Learn
  // ===========================================================================

  describe("MIDI Learn", () => {
    it("shows MIDI Learn button when midiParameterId provided", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          midiParameterId="slot_0_brightness"
        />,
      );
      expect(
        screen.getByTestId("midi-learn-slot_0_brightness"),
      ).toBeInTheDocument();
    });

    it("does not show MIDI Learn button when no midiParameterId", () => {
      render(<ParameterSlider {...defaultProps} />);
      expect(screen.queryByTestId(/midi-learn/)).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Audio mapping indicator
  // ===========================================================================

  describe("audio mapping indicator", () => {
    it("shows audio mapping badge when audioMapping provided", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          audioMapping={{ sourceLabel: "Bass", color: "#ff0000" }}
        />,
      );
      expect(screen.getByText("Bass")).toBeInTheDocument();
    });

    it("does not show audio mapping badge when audioMapping is null", () => {
      render(<ParameterSlider {...defaultProps} audioMapping={null} />);
      expect(screen.queryByText("Bass")).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Modulation indicator
  // ===========================================================================

  describe("modulation indicator", () => {
    it("shows modulation badge when modulationIndicator provided", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          modulationIndicator={{ lfoName: "LFO 1", lfoShape: "sine" }}
        />,
      );
      // Badge renders as an SVG icon (aria-hidden) — check the button/span is present via title
      expect(document.querySelector('[title*="LFO 1"]')).toBeInTheDocument();
    });

    it("does not show modulation badge when modulationIndicator is null", () => {
      render(<ParameterSlider {...defaultProps} modulationIndicator={null} />);
      expect(document.querySelector('[title*="Modulated by"]')).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // MIDI controlled state
  // ===========================================================================

  describe("MIDI controlled state", () => {
    it("disables slider when isMidiControlled is true", () => {
      render(<ParameterSlider {...defaultProps} isMidiControlled />);
      // Radix UI uses data-disabled attribute
      expect(screen.getByRole("slider")).toHaveAttribute("data-disabled");
    });

    it("slider is enabled by default", () => {
      render(<ParameterSlider {...defaultProps} />);
      expect(screen.getByRole("slider")).not.toHaveAttribute("data-disabled");
    });
  });

  // ===========================================================================
  // Pickup state (soft takeover)
  // ===========================================================================

  describe("pickup state", () => {
    it("shows pickup badge when not picked up", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          pickupState={{
            parameter_id: "test-param",
            picked_up: false,
            midi_value: 0.3,
            direction: "right",
          }}
        />,
      );
      expect(screen.getByText("pickup")).toBeInTheDocument();
    });

    it("shows direction arrow in pickup badge", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          pickupState={{
            parameter_id: "test-param",
            picked_up: false,
            midi_value: 0.3,
            direction: "right",
          }}
        />,
      );
      expect(screen.getByText("▸")).toBeInTheDocument();
    });

    it("shows left arrow when direction is left", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          pickupState={{
            parameter_id: "test-param",
            picked_up: false,
            midi_value: 0.7,
            direction: "left",
          }}
        />,
      );
      expect(screen.getByText("◂")).toBeInTheDocument();
    });

    it("does not show pickup badge when picked up", () => {
      render(
        <ParameterSlider
          {...defaultProps}
          pickupState={{
            parameter_id: "test-param",
            picked_up: true,
            midi_value: 0.5,
            direction: null,
          }}
        />,
      );
      expect(screen.queryByText("pickup")).not.toBeInTheDocument();
    });

    it("does not show pickup badge when no pickupState", () => {
      render(<ParameterSlider {...defaultProps} />);
      expect(screen.queryByText("pickup")).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Color variants
  // ===========================================================================

  describe("color variants", () => {
    it("renders with default emerald color", () => {
      render(<ParameterSlider {...defaultProps} />);
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("renders with indigo color", () => {
      render(<ParameterSlider {...defaultProps} color="indigo" />);
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("renders with cyan color", () => {
      render(<ParameterSlider {...defaultProps} color="cyan" />);
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });

    it("renders with rose color", () => {
      render(<ParameterSlider {...defaultProps} color="rose" />);
      expect(screen.getByRole("slider")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Spacing
  // ===========================================================================

  describe("spacing", () => {
    it("does not add spacing by default", () => {
      const { container } = render(<ParameterSlider {...defaultProps} />);
      expect(container.firstChild).not.toHaveClass("containerSpaced");
    });

    it("adds spacing when showSpacing is true", () => {
      const { container } = render(
        <ParameterSlider {...defaultProps} showSpacing />,
      );
      // The container should have the spaced class
      expect(
        container.querySelector("[class*='containerSpaced']"),
      ).toBeTruthy();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("has accessible label", () => {
      render(<ParameterSlider {...defaultProps} />);
      expect(screen.getByLabelText("Brightness")).toBeInTheDocument();
    });

    it("slider is keyboard accessible", () => {
      render(<ParameterSlider {...defaultProps} />);
      const slider = screen.getByRole("slider");

      slider.focus();
      expect(slider).toHaveFocus();
    });
  });
});
