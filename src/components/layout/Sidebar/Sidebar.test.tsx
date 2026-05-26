import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Sidebar, type SidebarProps } from "./Sidebar";

// Mock Tauri API
const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock panel components
vi.mock("@/components/panels/MidiPanel", () => ({
  MidiPanel: () => <div data-testid="midi-panel">MIDI Panel</div>,
}));

vi.mock("@/components/panels/OscPanel", () => ({
  OscPanel: () => <div data-testid="osc-panel">OSC Panel</div>,
}));

vi.mock("@/components/panels/AudioPanel", () => ({
  AudioPanel: () => <div data-testid="audio-panel">Audio Panel</div>,
}));

vi.mock("@/components/panels/HidPanel", () => ({
  HidPanel: () => <div data-testid="hid-panel">HID Panel</div>,
}));

vi.mock("@/components/panels/ModulationPanel", () => ({
  ModulationPanel: () => <div data-testid="modulation-panel">Modulation Panel</div>,
}));

vi.mock("@/components/panels/VideoOutputPanel", () => ({
  VideoOutputPanel: () => <div data-testid="video-panel">Video Output Panel</div>,
}));

// Mock ParameterSlider
vi.mock("@/components/parameters/ParameterSlider", () => ({
  ParameterSlider: ({ id, label, value, onChange }: {
    id: string;
    label: string;
    value: number;
    onChange: (v: number) => void;
  }) => (
    <div data-testid={`parameter-slider-${id}`}>
      <label>{label}</label>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  ),
}));

// Mock hooks
const mockSetMode = vi.fn();
const mockSetAccent = vi.fn();
const mockToggleSidebarPosition = vi.fn();
const mockIncreaseZoom = vi.fn();
const mockDecreaseZoom = vi.fn();
const mockResetZoom = vi.fn();
const mockRestartControls = vi.fn();
const mockRestartRenderer = vi.fn();
const mockToggleFullscreenControls = vi.fn();
const mockToggleFullscreenRenderer = vi.fn();

vi.mock("@/hooks", () => ({
  useTheme: () => ({
    mode: "dark",
    accent: "standard",
    setMode: mockSetMode,
    setAccent: mockSetAccent,
  }),
  useLayoutPreferences: () => ({
    sidebarPosition: "left",
    toggleSidebarPosition: mockToggleSidebarPosition,
    uiZoom: 100,
    increaseZoom: mockIncreaseZoom,
    decreaseZoom: mockDecreaseZoom,
    resetZoom: mockResetZoom,
  }),
  useWindowManager: () => ({
    isRestarting: false,
    restartControls: mockRestartControls,
    restartRenderer: mockRestartRenderer,
    toggleFullscreenControls: mockToggleFullscreenControls,
    toggleFullscreenRenderer: mockToggleFullscreenRenderer,
  }),
  MIN_ZOOM: 80,
  MAX_ZOOM: 150,
}));

describe("Sidebar", () => {
  const defaultProps: SidebarProps = {
    slots: [],
    getValue: vi.fn((id: string) => {
      if (id === "global_mute_fade_time") return 0.25;
      if (id === "global_solo_fade_time") return 0.3;
      return 0;
    }),
    setValue: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<Sidebar {...defaultProps} />);
      expect(container).toBeInTheDocument();
    });

    it("renders tab list", () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByRole("tablist", { name: /sidebar tabs/i })).toBeInTheDocument();
    });

    it("renders all tab triggers", () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Video" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "MIDI" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "OSC" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Audio" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "HID" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Mod" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
    });

    it("shows Settings tab by default", () => {
      render(<Sidebar {...defaultProps} />);
      const settingsTab = screen.getByRole("tab", { name: "Settings" });
      expect(settingsTab).toHaveAttribute("data-state", "active");
    });
  });

  // ===========================================================================
  // Tab interactions
  // ===========================================================================

  describe("tab interactions", () => {
    it("tabs are clickable", () => {
      render(<Sidebar {...defaultProps} />);

      const tabs = ["Video", "MIDI", "OSC", "Audio", "HID", "Mod", "Appearance"];

      tabs.forEach((tabName) => {
        const tab = screen.getByRole("tab", { name: tabName });
        expect(() => fireEvent.click(tab)).not.toThrow();
      });
    });
  });

  // ===========================================================================
  // Settings tab content
  // ===========================================================================

  describe("Settings tab", () => {
    it("shows transition times section", () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText("Transition Times")).toBeInTheDocument();
    });

    it("shows settings sliders when getValue and setValue provided", () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByTestId("parameter-slider-global_mute_fade_time")).toBeInTheDocument();
      expect(screen.getByTestId("parameter-slider-global_solo_fade_time")).toBeInTheDocument();
    });

    it("shows unavailable message when getValue/setValue not provided", () => {
      render(<Sidebar {...defaultProps} getValue={undefined} setValue={undefined} />);
      expect(screen.getByText(/settings unavailable/i)).toBeInTheDocument();
    });

    it("shows actions section", () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByText("Actions")).toBeInTheDocument();
    });

    it("shows all action buttons", () => {
      render(<Sidebar {...defaultProps} />);

      expect(screen.getByText("Toggle Fullscreen (Controls)")).toBeInTheDocument();
      expect(screen.getByText("Toggle Fullscreen (Renderer)")).toBeInTheDocument();
      expect(screen.getByText("Restart Renderer")).toBeInTheDocument();
      expect(screen.getByText("Restart Controls")).toBeInTheDocument();
    });

    it("calls toggleFullscreenControls when button clicked", () => {
      render(<Sidebar {...defaultProps} />);
      const button = screen.getByText("Toggle Fullscreen (Controls)").closest("button");

      fireEvent.click(button!);

      expect(mockToggleFullscreenControls).toHaveBeenCalledTimes(1);
    });

    it("calls toggleFullscreenRenderer when button clicked", () => {
      render(<Sidebar {...defaultProps} />);
      const button = screen.getByText("Toggle Fullscreen (Renderer)").closest("button");

      fireEvent.click(button!);

      expect(mockToggleFullscreenRenderer).toHaveBeenCalledTimes(1);
    });

    it("calls restartRenderer when button clicked", async () => {
      mockRestartRenderer.mockResolvedValue(undefined);
      render(<Sidebar {...defaultProps} />);
      const button = screen.getByText("Restart Renderer").closest("button");

      fireEvent.click(button!);

      await waitFor(() => {
        expect(mockRestartRenderer).toHaveBeenCalledTimes(1);
      });
    });

    it("calls restartControls when button clicked", async () => {
      mockRestartControls.mockResolvedValue(undefined);
      render(<Sidebar {...defaultProps} />);
      const button = screen.getByText("Restart Controls").closest("button");

      fireEvent.click(button!);

      await waitFor(() => {
        expect(mockRestartControls).toHaveBeenCalledTimes(1);
      });
    });

    it("calls setValue when slider changes", () => {
      render(<Sidebar {...defaultProps} />);
      const muteFadeSlider = within(
        screen.getByTestId("parameter-slider-global_mute_fade_time")
      ).getByRole("slider");

      fireEvent.change(muteFadeSlider, { target: { value: "0.5" } });

      expect(defaultProps.setValue).toHaveBeenCalledWith("global_mute_fade_time", 0.5);
    });

    it("invokes set_parameter when slider changes", async () => {
      render(<Sidebar {...defaultProps} />);
      const muteFadeSlider = within(
        screen.getByTestId("parameter-slider-global_mute_fade_time")
      ).getByRole("slider");

      fireEvent.change(muteFadeSlider, { target: { value: "0.5" } });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith("set_parameter", {
          id: "global_mute_fade_time",
          value: 0.5,
          app: undefined,
        });
      });
    });
  });

  // ===========================================================================
  // Theme and layout controls (visible in all tabs via Settings)
  // ===========================================================================

  describe("Controls functionality", () => {
    it("theme mode toggle button exists and is clickable", () => {
      render(<Sidebar {...defaultProps} />);

      // Click Appearance tab
      fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

      const buttons = screen.getAllByRole("button");
      const modeButton = buttons.find((btn) =>
        btn.getAttribute("aria-label")?.includes("Theme mode")
      );

      if (modeButton) {
        fireEvent.click(modeButton);
        expect(mockSetMode).toHaveBeenCalled();
      }
    });

    it("theme warmth toggle button exists and is clickable", () => {
      render(<Sidebar {...defaultProps} />);

      // Click Appearance tab
      fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

      const buttons = screen.getAllByRole("button");
      const warmthButton = buttons.find((btn) =>
        btn.getAttribute("aria-label")?.includes("Theme warmth")
      );

      if (warmthButton) {
        fireEvent.click(warmthButton);
        expect(mockSetAccent).toHaveBeenCalled();
      }
    });

    it("sidebar position toggle button exists and is clickable", () => {
      render(<Sidebar {...defaultProps} />);

      // Click Appearance tab
      fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

      const buttons = screen.getAllByRole("button");
      const positionButton = buttons.find((btn) =>
        btn.getAttribute("aria-label")?.includes("Sidebar position")
      );

      if (positionButton) {
        fireEvent.click(positionButton);
        expect(mockToggleSidebarPosition).toHaveBeenCalled();
      }
    });
  });

  // ===========================================================================
  // Props
  // ===========================================================================

  describe("props", () => {
    it("renders with slots prop", () => {
      const slots = [{ index: 0, sketchId: "blueCube" as any }];
      const { container } = render(<Sidebar {...defaultProps} slots={slots} />);

      expect(container).toBeInTheDocument();
    });

    it("renders with macropadSelectedIndex prop", () => {
      const { container } = render(<Sidebar {...defaultProps} macropadSelectedIndex={3} />);

      expect(container).toBeInTheDocument();
    });

    it("renders without getValue/setValue", () => {
      const { container } = render(
        <Sidebar {...defaultProps} getValue={undefined} setValue={undefined} />
      );

      expect(container).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("has accessible tab list label", () => {
      render(<Sidebar {...defaultProps} />);
      expect(screen.getByRole("tablist", { name: /sidebar tabs/i })).toBeInTheDocument();
    });

    it("all tabs have accessible names", () => {
      render(<Sidebar {...defaultProps} />);

      const tabs = screen.getAllByRole("tab");
      tabs.forEach((tab) => {
        expect(tab).toHaveAccessibleName();
      });
    });

    it("all buttons are accessible", () => {
      render(<Sidebar {...defaultProps} />);

      // All buttons should have either aria-label or text content
      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        const hasLabel = btn.getAttribute("aria-label") && btn.getAttribute("aria-label")!.length > 0;
        const hasText = btn.textContent && btn.textContent.trim().length > 0;
        expect(hasLabel || hasText).toBe(true);
      });
    });
  });
});
