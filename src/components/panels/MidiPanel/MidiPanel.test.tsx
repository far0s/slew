import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MidiPanel, type MidiPanelProps } from "./MidiPanel";
import type { MidiCombinedDeviceInfo, MidiMapping } from "@/inputs/midi";

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
const mockUseMidiCombinedDevices = vi.fn();
const mockUseMidiMappings = vi.fn();

vi.mock("../../../inputs/midi", () => ({
  useMidiCombinedDevices: () => mockUseMidiCombinedDevices(),
  useMidiMappings: () => mockUseMidiMappings(),
}));

// Mock window.confirm
const mockConfirm = vi.fn();
(window as any).confirm = mockConfirm;

describe("MidiPanel", () => {
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockSetDeviceFeedbackEnabled = vi.fn();
  const mockSetAutoReconnect = vi.fn();
  const mockRetryWithDelay = vi.fn().mockResolvedValue(undefined);
  const mockRemoveMapping = vi.fn().mockResolvedValue(undefined);
  const mockClearAll = vi.fn().mockResolvedValue(undefined);

  const defaultDevicesState = {
    devices: [] as MidiCombinedDeviceInfo[],
    isLoading: false,
    error: null,
    autoReconnect: true,
    connect: mockConnect,
    disconnect: mockDisconnect,
    setDeviceFeedbackEnabled: mockSetDeviceFeedbackEnabled,
    setAutoReconnect: mockSetAutoReconnect,
    retryWithDelay: mockRetryWithDelay,
  };

  const defaultMappingsState = {
    mappings: [] as MidiMapping[],
    isLoading: false,
    removeMapping: mockRemoveMapping,
    clearAll: mockClearAll,
  };

  const defaultProps: MidiPanelProps = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMidiCombinedDevices.mockReturnValue(defaultDevicesState);
    mockUseMidiMappings.mockReturnValue(defaultMappingsState);
    mockConfirm.mockReturnValue(true);
  });

  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<MidiPanel {...defaultProps} />);
      expect(container).toBeInTheDocument();
    });

    it("renders title", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByRole("heading", { name: /MIDI/i }),
      ).toBeInTheDocument();
    });

    it("renders Devices section", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("Devices")).toBeInTheDocument();
    });

    it("renders Mappings section", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("Mappings")).toBeInTheDocument();
    });

    it("accepts className prop", () => {
      const { container } = render(<MidiPanel className="custom-class" />);
      const panel = container.firstChild as HTMLElement;
      expect(panel.className).toContain("custom-class");
    });
  });

  // ===========================================================================
  // Collapsible sections
  // ===========================================================================

  describe("collapsible sections", () => {
    it("sections are open by default", () => {
      render(<MidiPanel {...defaultProps} />);
      const devicesSection = screen.getByText("Devices").closest("button");
      const mappingsSection = screen.getByText("Mappings").closest("button");

      expect(devicesSection).toBeInTheDocument();
      expect(mappingsSection).toBeInTheDocument();
    });

    it("sections are clickable", () => {
      render(<MidiPanel {...defaultProps} />);
      const devicesSection = screen.getByText("Devices").closest("button");
      const mappingsSection = screen.getByText("Mappings").closest("button");

      expect(() => fireEvent.click(devicesSection!)).not.toThrow();
      expect(() => fireEvent.click(mappingsSection!)).not.toThrow();
    });
  });

  // ===========================================================================
  // Device list - loading state
  // ===========================================================================

  describe("device list loading", () => {
    it("shows loading message when loading with no devices", () => {
      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        isLoading: true,
        devices: [],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByText(/Scanning for MIDI devices/i),
      ).toBeInTheDocument();
    });

    it("does not show loading when loading with existing devices", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        isLoading: true,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.queryByText(/Scanning for MIDI devices/i),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Test Device")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Device list - error state
  // ===========================================================================

  describe("device list error", () => {
    it("shows error message when error occurs", () => {
      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        error: "Failed to initialize MIDI system",
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByText("Failed to initialize MIDI system"),
      ).toBeInTheDocument();
    });

    it("shows retry button on error", () => {
      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        error: "MIDI support could not be initialized",
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /Retry/i }),
      ).toBeInTheDocument();
    });

    it("shows hint for MIDI init errors", () => {
      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        error: "MIDI support could not be initialized",
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByText(
          /This can happen if the MIDI system hasn't fully initialized/i,
        ),
      ).toBeInTheDocument();
    });

    it("retry button calls retryWithDelay", async () => {
      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        error: "Failed to create MIDI",
      });

      render(<MidiPanel {...defaultProps} />);
      const retryButton = screen.getByRole("button", { name: /Retry/i });

      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(mockRetryWithDelay).toHaveBeenCalledWith(1500);
      });
    });

    it("shows retrying state", async () => {
      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        error: "Test error",
      });

      render(<MidiPanel {...defaultProps} />);
      const retryButton = screen.getByRole("button", { name: /Retry/i });

      fireEvent.click(retryButton);

      expect(screen.getByText(/Retrying/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Device list - empty state
  // ===========================================================================

  describe("device list empty", () => {
    it("shows empty state when no devices", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("No MIDI devices detected")).toBeInTheDocument();
    });

    it("shows hint about automatic detection", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByText("Devices will appear automatically when connected"),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Device list - with devices
  // ===========================================================================

  describe("device list with devices", () => {
    it("shows connected device", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Controller",
        input: { id: "1", name: "Test Controller", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("Test Controller")).toBeInTheDocument();
    });

    it("shows multiple devices", () => {
      const devices: MidiCombinedDeviceInfo[] = [
        {
          name: "Device 1",
          input: { id: "1", name: "Device 1", is_connected: true },
          output: null,
          inputConnected: true,
          outputConnected: false,
          isBidirectional: false,
          feedbackEnabled: false,
        },
        {
          name: "Device 2",
          input: { id: "2", name: "Device 2", is_connected: false },
          output: null,
          inputConnected: false,
          outputConnected: false,
          isBidirectional: false,
          feedbackEnabled: false,
        },
      ];

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices,
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("Device 1")).toBeInTheDocument();
      expect(screen.getByText("Device 2")).toBeInTheDocument();
    });

    it("shows auto-reconnect toggle", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("Auto-reconnect devices")).toBeInTheDocument();
    });

    it("auto-reconnect toggle is checked when enabled", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
        autoReconnect: true,
      });

      render(<MidiPanel {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox", {
        name: /Auto-reconnect devices/i,
      });
      expect(checkbox).toBeChecked();
    });

    it("auto-reconnect toggle is unchecked when disabled", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
        autoReconnect: false,
      });

      render(<MidiPanel {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox", {
        name: /Auto-reconnect devices/i,
      });
      expect(checkbox).not.toBeChecked();
    });

    it("calls setAutoReconnect when toggle clicked", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox", {
        name: /Auto-reconnect devices/i,
      });

      fireEvent.click(checkbox);

      expect(mockSetAutoReconnect).toHaveBeenCalledWith(false);
    });
  });

  // ===========================================================================
  // Device row - connection states
  // ===========================================================================

  describe("device row connection states", () => {
    it("shows disconnected status", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Disconnected Device",
        input: { id: "1", name: "Disconnected Device", is_connected: false },
        output: null,
        inputConnected: false,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      const status = screen.getByLabelText("Disconnected");
      expect(status).toBeInTheDocument();
    });

    it("shows input only status", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Input Device",
        input: { id: "1", name: "Input Device", is_connected: true },
        output: { id: "2", name: "Input Device", is_connected: false },
        inputConnected: true,
        outputConnected: false,
        isBidirectional: true,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("Input only")).toBeInTheDocument();
    });

    it("shows output only status", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Output Device",
        input: { id: "1", name: "Output Device", is_connected: false },
        output: { id: "2", name: "Output Device", is_connected: true },
        inputConnected: false,
        outputConnected: true,
        isBidirectional: true,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("Output only")).toBeInTheDocument();
    });

    it("shows bidirectional status", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Bidirectional Device",
        input: { id: "1", name: "Bidirectional Device", is_connected: true },
        output: { id: "2", name: "Bidirectional Device", is_connected: true },
        inputConnected: true,
        outputConnected: true,
        isBidirectional: true,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("In/Out")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Device row - connect/disconnect
  // ===========================================================================

  describe("device row connect/disconnect", () => {
    it("shows Connect button for disconnected device", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Disconnected Device",
        input: { id: "1", name: "Disconnected Device", is_connected: false },
        output: null,
        inputConnected: false,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /Connect/i }),
      ).toBeInTheDocument();
    });

    it("shows Disconnect button for connected device", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Connected Device",
        input: { id: "1", name: "Connected Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /Disconnect/i }),
      ).toBeInTheDocument();
    });

    it("calls connect when Connect button clicked", async () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: false },
        output: null,
        inputConnected: false,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      const connectButton = screen.getByRole("button", { name: /Connect/i });

      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(mockConnect).toHaveBeenCalledWith("Test Device");
      });
    });

    it("calls disconnect when Disconnect button clicked", async () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      const disconnectButton = screen.getByRole("button", {
        name: /Disconnect/i,
      });

      fireEvent.click(disconnectButton);

      await waitFor(() => {
        expect(mockDisconnect).toHaveBeenCalledWith("Test Device");
      });
    });
  });

  // ===========================================================================
  // Device row - feedback toggle
  // ===========================================================================

  describe("device row feedback toggle", () => {
    it("shows feedback toggle when device connected with output", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Output Device",
        input: { id: "1", name: "Output Device", is_connected: true },
        output: { id: "2", name: "Output Device", is_connected: true },
        inputConnected: true,
        outputConnected: true,
        isBidirectional: true,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("Feedback")).toBeInTheDocument();
    });

    it("does not show feedback toggle when disconnected", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Disconnected Device",
        input: { id: "1", name: "Disconnected Device", is_connected: false },
        output: { id: "2", name: "Disconnected Device", is_connected: false },
        inputConnected: false,
        outputConnected: false,
        isBidirectional: true,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.queryByText("Feedback")).not.toBeInTheDocument();
    });

    it("does not show feedback toggle when no output", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Input Only Device",
        input: { id: "1", name: "Input Only Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.queryByText("Feedback")).not.toBeInTheDocument();
    });

    it("feedback toggle is checked when enabled", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Output Device",
        input: { id: "1", name: "Output Device", is_connected: true },
        output: { id: "2", name: "Output Device", is_connected: true },
        inputConnected: true,
        outputConnected: true,
        isBidirectional: true,
        feedbackEnabled: true,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox", { name: /Feedback/i });
      expect(checkbox).toBeChecked();
    });

    it("calls setDeviceFeedbackEnabled when feedback toggle clicked", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Output Device",
        input: { id: "1", name: "Output Device", is_connected: true },
        output: { id: "2", name: "Output Device", is_connected: true },
        inputConnected: true,
        outputConnected: true,
        isBidirectional: true,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      const checkbox = screen.getByRole("checkbox", { name: /Feedback/i });

      fireEvent.click(checkbox);

      expect(mockSetDeviceFeedbackEnabled).toHaveBeenCalledWith(
        "Output Device",
        true,
      );
    });
  });

  // ===========================================================================
  // Mappings list - loading state
  // ===========================================================================

  describe("mappings list loading", () => {
    it("shows loading message when loading", () => {
      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        isLoading: true,
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText(/Loading mappings/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Mappings list - empty state
  // ===========================================================================

  describe("mappings list empty", () => {
    it("shows empty message when no mappings", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText(/No MIDI mappings/i)).toBeInTheDocument();
    });

    it("shows hint about Learn button", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByText(/Use the Learn button on a parameter to create one/i),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Mappings list - with mappings
  // ===========================================================================

  describe("mappings list with mappings", () => {
    it("shows mapping", () => {
      const mapping: MidiMapping = {
        parameter_id: "slot_0_brightness",
        channel: 0,
        cc_number: 1,
        min_value: 0,
        max_value: 1,
        device_id: null,
      };

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [mapping],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("slot_0_brightness")).toBeInTheDocument();
      expect(screen.getByText("CC 1 @ Ch 1")).toBeInTheDocument();
    });

    it("shows multiple mappings", () => {
      const mappings: MidiMapping[] = [
        {
          parameter_id: "slot_0_brightness",
          channel: 0,
          cc_number: 1,
          min_value: 0,
          max_value: 1,
          device_id: null,
        },
        {
          parameter_id: "slot_1_hue",
          channel: null,
          cc_number: 2,
          min_value: 0,
          max_value: 360,
          device_id: null,
        },
      ];

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings,
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("slot_0_brightness")).toBeInTheDocument();
      expect(screen.getByText("slot_1_hue")).toBeInTheDocument();
      expect(screen.getByText("CC 1 @ Ch 1")).toBeInTheDocument();
      expect(screen.getByText("CC 2 @ Any Ch")).toBeInTheDocument();
    });

    it("shows mappings count badge", () => {
      const mappings: MidiMapping[] = [
        {
          parameter_id: "slot_0_brightness",
          channel: 0,
          cc_number: 1,
          min_value: 0,
          max_value: 1,
          device_id: null,
        },
        {
          parameter_id: "slot_1_hue",
          channel: null,
          cc_number: 2,
          min_value: 0,
          max_value: 360,
          device_id: null,
        },
      ];

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings,
      });

      render(<MidiPanel {...defaultProps} />);
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("shows Clear All button when mappings exist", () => {
      const mapping: MidiMapping = {
        parameter_id: "slot_0_brightness",
        channel: 0,
        cc_number: 1,
        min_value: 0,
        max_value: 1,
        device_id: null,
      };

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [mapping],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /Clear all mappings/i }),
      ).toBeInTheDocument();
    });

    it("does not show Clear All button when no mappings", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.queryByRole("button", { name: /Clear all mappings/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Remove mapping
  // ===========================================================================

  describe("remove mapping", () => {
    it("shows remove button for each mapping", () => {
      const mapping: MidiMapping = {
        parameter_id: "slot_0_brightness",
        channel: 0,
        cc_number: 1,
        min_value: 0,
        max_value: 1,
        device_id: null,
      };

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [mapping],
      });

      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByRole("button", {
          name: /Remove mapping for slot_0_brightness/i,
        }),
      ).toBeInTheDocument();
    });

    it("calls removeMapping when remove button clicked", async () => {
      const mapping: MidiMapping = {
        parameter_id: "slot_0_brightness",
        channel: 0,
        cc_number: 1,
        min_value: 0,
        max_value: 1,
        device_id: null,
      };

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [mapping],
      });

      render(<MidiPanel {...defaultProps} />);
      const removeButton = screen.getByRole("button", {
        name: /Remove mapping for slot_0_brightness/i,
      });

      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(mockRemoveMapping).toHaveBeenCalledWith("slot_0_brightness");
      });
    });
  });

  // ===========================================================================
  // Clear all mappings
  // ===========================================================================

  describe("clear all mappings", () => {
    it("shows confirmation dialog when Clear All clicked", async () => {
      const mapping: MidiMapping = {
        parameter_id: "slot_0_brightness",
        channel: 0,
        cc_number: 1,
        min_value: 0,
        max_value: 1,
        device_id: null,
      };

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [mapping],
      });

      render(<MidiPanel {...defaultProps} />);
      const clearButton = screen.getByRole("button", {
        name: /Clear all mappings/i,
      });

      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalledWith("Clear all MIDI mappings?");
      });
    });

    it("calls clearAll when confirmed", async () => {
      mockConfirm.mockReturnValue(true);

      const mapping: MidiMapping = {
        parameter_id: "slot_0_brightness",
        channel: 0,
        cc_number: 1,
        min_value: 0,
        max_value: 1,
        device_id: null,
      };

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [mapping],
      });

      render(<MidiPanel {...defaultProps} />);
      const clearButton = screen.getByRole("button", {
        name: /Clear all mappings/i,
      });

      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(mockClearAll).toHaveBeenCalled();
      });
    });

    it("does not call clearAll when cancelled", async () => {
      mockConfirm.mockReturnValue(false);

      const mapping: MidiMapping = {
        parameter_id: "slot_0_brightness",
        channel: 0,
        cc_number: 1,
        min_value: 0,
        max_value: 1,
        device_id: null,
      };

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [mapping],
      });

      render(<MidiPanel {...defaultProps} />);
      const clearButton = screen.getByRole("button", {
        name: /Clear all mappings/i,
      });

      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalled();
      });

      expect(mockClearAll).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("has accessible heading", () => {
      render(<MidiPanel {...defaultProps} />);
      expect(
        screen.getByRole("heading", { name: /MIDI/i }),
      ).toBeInTheDocument();
    });

    it("all buttons have accessible names", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: true },
        output: { id: "2", name: "Test Device", is_connected: true },
        inputConnected: true,
        outputConnected: true,
        isBidirectional: true,
        feedbackEnabled: false,
      };

      const mapping: MidiMapping = {
        parameter_id: "slot_0_brightness",
        channel: 0,
        cc_number: 1,
        min_value: 0,
        max_value: 1,
        device_id: null,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      mockUseMidiMappings.mockReturnValue({
        ...defaultMappingsState,
        mappings: [mapping],
      });

      render(<MidiPanel {...defaultProps} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        const hasLabel =
          btn.getAttribute("aria-label") &&
          btn.getAttribute("aria-label")!.length > 0;
        const hasText = btn.textContent && btn.textContent.trim().length > 0;
        expect(hasLabel || hasText).toBe(true);
      });
    });

    it("connection status has aria-label", () => {
      const device: MidiCombinedDeviceInfo = {
        name: "Test Device",
        input: { id: "1", name: "Test Device", is_connected: true },
        output: null,
        inputConnected: true,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: false,
      };

      mockUseMidiCombinedDevices.mockReturnValue({
        ...defaultDevicesState,
        devices: [device],
      });

      render(<MidiPanel {...defaultProps} />);
      const status = screen.getByLabelText("Connected");
      expect(status).toBeInTheDocument();
    });
  });
});
