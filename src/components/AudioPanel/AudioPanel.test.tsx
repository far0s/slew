import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AudioPanel, type AudioPanelProps } from "./AudioPanel";
import type { AudioMapping, AudioDeviceInfo } from "../../inputs/audio";
import type { Slot } from "../../slots/useSlots";

// Mock motion/react
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Mock Radix Collapsible
vi.mock("@radix-ui/react-collapsible", () => ({
  Root: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-state={open ? "open" : "closed"}>{children}</div>
  ),
  Trigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    if (
      asChild &&
      typeof children === "object" &&
      children !== null &&
      "props" in children
    ) {
      return children;
    }
    return <div>{children}</div>;
  },
  Content: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Mock icons
vi.mock("@radix-ui/react-icons", () => ({
  ChevronDownIcon: () => <span data-testid="chevron-down">▼</span>,
  ChevronRightIcon: () => <span data-testid="chevron-right">▶</span>,
}));

// Mock hooks
const mockUseAudioCapture = vi.fn();
const mockUseAudioLevels = vi.fn();
const mockUseAudioMappings = vi.fn();

// Mock bpmSource hooks
vi.mock("../../inputs/bpmSource", () => ({
  useActiveBpmSource: () => ({ source: "microphone", bpm: null }),
  useMidiClock: () => ({
    status: { device_id: null, is_connected: false, bpm: null },
    ports: [],
    isLoading: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    refreshPorts: vi.fn(),
  }),
  BPM_SOURCE_LABELS: {
    manual: "Tap / Manual",
    osc: "OSC",
    midi_clock: "MIDI Clock",
    microphone: "Microphone",
  },
}));

vi.mock("../../inputs/audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../inputs/audio")>();
  return {
    ...actual,
    useAudioCapture: () => mockUseAudioCapture(),
    useAudioLevels: () => mockUseAudioLevels(),
    useAudioMappings: () => mockUseAudioMappings(),
  };
});

// Mock window.confirm
const mockConfirm = vi.fn();
(window as any).confirm = mockConfirm;

describe("AudioPanel", () => {
  const mockRefresh = vi.fn().mockResolvedValue(undefined);
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockStop = vi.fn().mockResolvedValue(undefined);
  const mockSetAutoReconnect = vi.fn();
  const mockAddMapping = vi.fn().mockResolvedValue(undefined);
  const mockRemoveMapping = vi.fn().mockResolvedValue(undefined);
  const mockSetEnabled = vi.fn().mockResolvedValue(undefined);
  const mockClearMappings = vi.fn().mockResolvedValue(undefined);

  const defaultCaptureState = {
    devices: [] as AudioDeviceInfo[],
    isRunning: false,
    deviceName: null,
    sampleRate: null,
    error: null,
    isLoading: false,
    autoReconnect: true,
    refresh: mockRefresh,
    start: mockStart,
    stop: mockStop,
    setAutoReconnect: mockSetAutoReconnect,
  };

  const defaultLevelsState = {
    rms: 0,
    peak: 0,
    bands: {
      bass: 0,
      low_mid: 0,
      high_mid: 0,
      treble: 0,
    },
    beat: false,
    bpm: null,
  };

  const defaultMappingsState = {
    mappings: [] as AudioMapping[],
    add: mockAddMapping,
    remove: mockRemoveMapping,
    setEnabled: mockSetEnabled,
    clear: mockClearMappings,
  };

  const testSlot: Slot = {
    index: 0,
    sketchId: "blueCube",
  };

  const defaultProps: AudioPanelProps = {
    slots: [testSlot],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAudioCapture.mockReturnValue(defaultCaptureState);
    mockUseAudioLevels.mockReturnValue(defaultLevelsState);
    mockUseAudioMappings.mockReturnValue(defaultMappingsState);
    mockConfirm.mockReturnValue(true);
  });

  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<AudioPanel {...defaultProps} />);
      expect(container).toBeInTheDocument();
    });

    it("renders title", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(
        screen.getByRole("heading", { name: /Audio/i }),
      ).toBeInTheDocument();
    });

    it("renders Device section", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Device")).toBeInTheDocument();
    });

    it("renders Levels section", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Levels")).toBeInTheDocument();
    });

    it("renders Mappings section", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Mappings")).toBeInTheDocument();
    });

    it("accepts className prop", () => {
      const { container } = render(
        <AudioPanel className="custom-class" slots={[]} />,
      );
      const panel = container.firstChild as HTMLElement;
      expect(panel.className).toContain("custom-class");
    });

    it("shows Stopped status when not running", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Stopped")).toBeInTheDocument();
    });

    it("shows Capturing status when running", () => {
      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        isRunning: true,
        deviceName: "Test Device",
        sampleRate: 44100,
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Capturing")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Collapsible sections
  // ===========================================================================

  describe("collapsible sections", () => {
    it("sections are open by default", () => {
      render(<AudioPanel {...defaultProps} />);
      const deviceSection = screen.getByText("Device").closest("button");
      const levelsSection = screen.getByText("Levels").closest("button");
      const mappingsSection = screen.getByText("Mappings").closest("button");

      expect(deviceSection).toBeInTheDocument();
      expect(levelsSection).toBeInTheDocument();
      expect(mappingsSection).toBeInTheDocument();
    });

    it("sections are clickable", () => {
      render(<AudioPanel {...defaultProps} />);
      const deviceSection = screen.getByText("Device").closest("button");
      const levelsSection = screen.getByText("Levels").closest("button");
      const mappingsSection = screen.getByText("Mappings").closest("button");

      expect(() => fireEvent.click(deviceSection!)).not.toThrow();
      expect(() => fireEvent.click(levelsSection!)).not.toThrow();
      expect(() => fireEvent.click(mappingsSection!)).not.toThrow();
    });
  });

  // ===========================================================================
  // Device controls - basic rendering
  // ===========================================================================

  describe("device controls rendering", () => {
    it("shows device selector", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText(/Audio input device/i)).toBeInTheDocument();
    });

    it("shows refresh button", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText(/Refresh device list/i)).toBeInTheDocument();
    });

    it("shows Start button when stopped", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /Start/i }),
      ).toBeInTheDocument();
    });

    it("shows Stop button when running", () => {
      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        isRunning: true,
        deviceName: "Test Device",
        sampleRate: 44100,
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByRole("button", { name: /Stop/i })).toBeInTheDocument();
    });

    it("shows auto-reconnect toggle", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(
        screen.getByText("Auto-reconnect on disconnect"),
      ).toBeInTheDocument();
    });

    it("shows status when stopped", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Capture stopped")).toBeInTheDocument();
    });

    it("shows status when running", () => {
      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        isRunning: true,
        deviceName: "Test Device",
        sampleRate: 44100,
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Test Device @ 44100Hz")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Device controls - interactions
  // ===========================================================================

  describe("device controls interactions", () => {
    it("calls refresh when refresh button clicked", async () => {
      render(<AudioPanel {...defaultProps} />);
      const refreshButton = screen.getByLabelText(/Refresh device list/i);

      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it("calls start when Start button clicked", async () => {
      render(<AudioPanel {...defaultProps} />);
      const startButton = screen.getByRole("button", { name: /Start/i });

      fireEvent.click(startButton);

      await waitFor(() => {
        expect(mockStart).toHaveBeenCalledWith(undefined);
      });
    });

    it("calls stop when Stop button clicked", async () => {
      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        isRunning: true,
        deviceName: "Test Device",
        sampleRate: 44100,
      });

      render(<AudioPanel {...defaultProps} />);
      const stopButton = screen.getByRole("button", { name: /Stop/i });

      fireEvent.click(stopButton);

      await waitFor(() => {
        expect(mockStop).toHaveBeenCalled();
      });
    });

    it("calls setAutoReconnect when toggle clicked", () => {
      render(<AudioPanel {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox", {
        name: /Auto-reconnect on disconnect/i,
      });

      fireEvent.click(checkbox);

      expect(mockSetAutoReconnect).toHaveBeenCalledWith(false);
    });

    it("disables controls when loading", () => {
      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        isLoading: true,
      });

      render(<AudioPanel {...defaultProps} />);
      const deviceSelect = screen.getByLabelText(/Audio input device/i);
      const refreshButton = screen.getByLabelText(/Refresh device list/i);
      const startButton = screen.getByRole("button", { name: /…/i });

      expect(deviceSelect).toBeDisabled();
      expect(refreshButton).toBeDisabled();
      expect(startButton).toBeDisabled();
    });
  });

  // ===========================================================================
  // Device controls - error state
  // ===========================================================================

  describe("device controls error", () => {
    it("shows error message when error occurs", () => {
      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        error: "Failed to access audio device",
      });

      render(<AudioPanel {...defaultProps} />);
      expect(
        screen.getByText("Failed to access audio device"),
      ).toBeInTheDocument();
    });

    it("shows auto-reconnect hint when auto-reconnect enabled and error", () => {
      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        error: "Device disconnected",
        autoReconnect: true,
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Auto-reconnect is enabled")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Device controls - device selection
  // ===========================================================================

  describe("device selection", () => {
    it("shows default device option", () => {
      const device: AudioDeviceInfo = {
        name: "Built-in Microphone",
        is_default: true,
        is_active: false,
      };

      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        devices: [device],
      });

      render(<AudioPanel {...defaultProps} />);
      const select = screen.getByLabelText(
        /Audio input device/i,
      ) as HTMLSelectElement;

      expect(select.options[0].text).toContain("Default (Built-in Microphone)");
    });

    it("shows device list", () => {
      const devices: AudioDeviceInfo[] = [
        { name: "Built-in Microphone", is_default: true, is_active: false },
        { name: "USB Microphone", is_default: false, is_active: false },
      ];

      mockUseAudioCapture.mockReturnValue({
        ...defaultCaptureState,
        devices,
      });

      render(<AudioPanel {...defaultProps} />);
      const select = screen.getByLabelText(
        /Audio input device/i,
      ) as HTMLSelectElement;

      expect(select.options.length).toBeGreaterThan(1);
    });
  });

  // ===========================================================================
  // Levels display
  // ===========================================================================

  describe("levels display", () => {
    it("shows RMS meter", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("RMS")).toBeInTheDocument();
    });

    it("shows Peak meter", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Peak")).toBeInTheDocument();
    });

    it("shows frequency band meters", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Bass")).toBeInTheDocument();
      expect(screen.getByText("Low-Mid")).toBeInTheDocument();
      expect(screen.getByText("High-Mid")).toBeInTheDocument();
      expect(screen.getByText("Treble")).toBeInTheDocument();
    });

    it("shows beat indicator", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText("No beat")).toBeInTheDocument();
    });

    it("shows BPM when detected", () => {
      mockUseAudioLevels.mockReturnValue({
        ...defaultLevelsState,
        beat: true,
        bpm: 120,
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("120")).toBeInTheDocument();
      expect(screen.getByText("BPM")).toBeInTheDocument();
    });

    it("shows Detecting when BPM not available", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("Detecting…")).toBeInTheDocument();
    });

    it("shows beat active state", () => {
      mockUseAudioLevels.mockReturnValue({
        ...defaultLevelsState,
        beat: true,
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText("Beat detected")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Mappings - empty state
  // ===========================================================================

  describe("mappings empty state", () => {
    it("shows empty message when no mappings", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText(/No mappings/i)).toBeInTheDocument();
    });

    it("shows Add button", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /Add mapping/i }),
      ).toBeInTheDocument();
    });

    it("does not show Clear All button when no mappings", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(
        screen.queryByRole("button", { name: /Clear all mappings/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Mappings - with mappings
  // ===========================================================================

  describe("mappings with mappings", () => {
    const testMapping: AudioMapping = {
      id: "test-mapping",
      source: "bass",
      parameter_id: "slot_0_brightness",
      min_input: 0,
      max_input: 1,
      min_output: 0,
      max_output: 1,
      mode: "continuous",
      smoothing: 0.3,
      enabled: true,
    };

    it("shows mapping", () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText(/brightness/i)).toBeInTheDocument();
    });

    it("shows mappings count badge", () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("shows Clear All button when mappings exist", () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /Clear all mappings/i }),
      ).toBeInTheDocument();
    });

    it("shows enabled mapping with filled toggle", () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText(/Disable mapping/i)).toBeInTheDocument();
    });

    it("shows disabled mapping with empty toggle", () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [{ ...testMapping, enabled: false }],
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText(/Enable mapping/i)).toBeInTheDocument();
    });

    it("shows output range", () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [{ ...testMapping, min_output: 0.5, max_output: 1.0 }],
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByText("0.50 – 1.00")).toBeInTheDocument();
    });

    it("shows delete button", () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText(/Delete mapping/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Mapping interactions
  // ===========================================================================

  describe("mapping interactions", () => {
    const testMapping: AudioMapping = {
      id: "test-mapping",
      source: "bass",
      parameter_id: "slot_0_brightness",
      min_input: 0,
      max_input: 1,
      min_output: 0,
      max_output: 1,
      mode: "continuous",
      smoothing: 0.3,
      enabled: true,
    };

    it("calls setEnabled when toggle clicked", async () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      const toggleButton = screen.getByLabelText(/Disable mapping/i);

      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(mockSetEnabled).toHaveBeenCalledWith("test-mapping", false);
      });
    });

    it("calls remove when delete button clicked", async () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      const deleteButton = screen.getByLabelText(/Delete mapping/i);

      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(mockRemoveMapping).toHaveBeenCalledWith("test-mapping");
      });
    });

    it("shows edit form when mapping clicked", () => {
      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      const editButton = screen.getByLabelText(/Edit mapping/i);

      fireEvent.click(editButton);

      expect(screen.getByText("Edit Mapping")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Add mapping form
  // ===========================================================================

  describe("add mapping form", () => {
    it("shows form when Add button clicked", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });

      fireEvent.click(addButton);

      expect(screen.getByText("New Mapping")).toBeInTheDocument();
    });

    it("shows source selector", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });
      fireEvent.click(addButton);

      expect(screen.getByText("Source:")).toBeInTheDocument();
    });

    it("shows parameter selector", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });
      fireEvent.click(addButton);

      expect(screen.getByText("Parameter:")).toBeInTheDocument();
    });

    it("shows mode selector", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });
      fireEvent.click(addButton);

      expect(screen.getByText("Mode:")).toBeInTheDocument();
    });

    it("shows output range inputs", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });
      fireEvent.click(addButton);

      expect(screen.getByLabelText(/Minimum output/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Maximum output/i)).toBeInTheDocument();
    });

    it("shows smoothing slider", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });
      fireEvent.click(addButton);

      expect(screen.getByText(/Smoothing:/i)).toBeInTheDocument();
    });

    it("shows Cancel and Add buttons", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });
      fireEvent.click(addButton);

      const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
      const cancelButton = buttons.find((btn) => btn.textContent === "Cancel");
      const submitButton = buttons.find(
        (btn) => btn.textContent === "Add" && btn.type === "submit",
      );

      expect(cancelButton).toBeInTheDocument();
      expect(submitButton).toBeInTheDocument();
    });

    it("hides form when Cancel clicked", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });
      fireEvent.click(addButton);

      const buttons = screen.getAllByRole("button");
      const cancelButton = buttons.find((btn) => btn.textContent === "Cancel");
      fireEvent.click(cancelButton!);

      expect(screen.queryByText("New Mapping")).not.toBeInTheDocument();
    });

    it("Add button is disabled when no parameter selected", () => {
      render(<AudioPanel {...defaultProps} />);
      const addButton = screen.getByRole("button", { name: /Add mapping/i });
      fireEvent.click(addButton);

      const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
      const submitButton = buttons.find(
        (btn) => btn.textContent === "Add" && btn.type === "submit",
      );
      expect(submitButton).toBeDisabled();
    });
  });

  // ===========================================================================
  // Clear all mappings
  // ===========================================================================

  describe("clear all mappings", () => {
    it("shows confirmation dialog when Clear All clicked", async () => {
      const testMapping: AudioMapping = {
        id: "test-mapping",
        source: "bass",
        parameter_id: "slot_0_brightness",
        min_input: 0,
        max_input: 1,
        min_output: 0,
        max_output: 1,
        mode: "continuous",
        smoothing: 0.3,
        enabled: true,
      };

      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      const clearButton = screen.getByRole("button", {
        name: /Clear all mappings/i,
      });

      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalledWith("Clear all audio mappings?");
      });
    });

    it("calls clear when confirmed", async () => {
      mockConfirm.mockReturnValue(true);

      const testMapping: AudioMapping = {
        id: "test-mapping",
        source: "bass",
        parameter_id: "slot_0_brightness",
        min_input: 0,
        max_input: 1,
        min_output: 0,
        max_output: 1,
        mode: "continuous",
        smoothing: 0.3,
        enabled: true,
      };

      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      const clearButton = screen.getByRole("button", {
        name: /Clear all mappings/i,
      });

      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(mockClearMappings).toHaveBeenCalled();
      });
    });

    it("does not call clear when cancelled", async () => {
      mockConfirm.mockReturnValue(false);

      const testMapping: AudioMapping = {
        id: "test-mapping",
        source: "bass",
        parameter_id: "slot_0_brightness",
        min_input: 0,
        max_input: 1,
        min_output: 0,
        max_output: 1,
        mode: "continuous",
        smoothing: 0.3,
        enabled: true,
      };

      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);
      const clearButton = screen.getByRole("button", {
        name: /Clear all mappings/i,
      });

      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalled();
      });

      expect(mockClearMappings).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("has accessible heading", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(
        screen.getByRole("heading", { name: /Audio/i }),
      ).toBeInTheDocument();
    });

    it("device select has aria-label", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText(/Audio input device/i)).toBeInTheDocument();
    });

    it("all buttons have accessible names", () => {
      const testMapping: AudioMapping = {
        id: "test-mapping",
        source: "bass",
        parameter_id: "slot_0_brightness",
        min_input: 0,
        max_input: 1,
        min_output: 0,
        max_output: 1,
        mode: "continuous",
        smoothing: 0.3,
        enabled: true,
      };

      mockUseAudioMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [testMapping],
      });

      render(<AudioPanel {...defaultProps} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        const hasLabel =
          btn.getAttribute("aria-label") &&
          btn.getAttribute("aria-label")!.length > 0;
        const hasText = btn.textContent && btn.textContent.trim().length > 0;
        expect(hasLabel || hasText).toBe(true);
      });
    });

    it("status indicators have aria-labels", () => {
      render(<AudioPanel {...defaultProps} />);
      expect(screen.getByLabelText(/Capture stopped/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/No beat/i)).toBeInTheDocument();
    });
  });
});
