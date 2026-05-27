import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SlotColumn, type SlotColumnProps } from "./SlotColumn";
import type { SketchId } from "@/sketches";

// Mock dependencies
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
    enabled: false,
    stream_slots: false,
  }),
}));

vi.mock("motion/react", () => ({
  motion: {
    article: ({ children, ...props }: React.PropsWithChildren) => (
      <article {...props}>{children}</article>
    ),
    div: ({ children, ...props }: React.PropsWithChildren) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/sketches", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/sketches")>();
  const MockSketchComponent = () => <div data-testid="mock-sketch">Mock Sketch</div>;
  return {
    ...actual,
    SKETCH_COMPONENT_REGISTRY: {
      blueCube: MockSketchComponent,
      orangeCube: MockSketchComponent,
      greenPulse: MockSketchComponent,
    },
  };
});

vi.mock("@/renderer/WebGPUCanvas", () => ({
  WebGPUCanvas: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="webgpu-canvas">{children}</div>,
}));

vi.mock("@/components/preview/StreamedPreview", () => ({
  StreamedPreview: ({
    source,
  }: {
    source: string;
    onFirstFrame?: () => void;
  }) => <div data-testid={`streamed-preview-${source}`}>Streamed Preview</div>,
}));

vi.mock("@/components/slots/SlotParameterControls", () => ({
  SlotParameterControls: ({ slotIndex }: { slotIndex: number }) => (
    <div data-testid={`slot-parameter-controls-${slotIndex}`}>
      Slot Parameter Controls
    </div>
  ),
}));

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
});

describe("SlotColumn", () => {
  const defaultProps: SlotColumnProps = {
    slotIndex: 0,
    sketchId: null,
    isActive: false,
    isCrossfadeTarget: false,
    crossfadeProgress: 0,
    isCrossfading: false,
    excludeSketchIds: [],
    canRemove: false,
    getValue: vi.fn(),
    setValue: vi.fn(),
    onSketchChange: vi.fn(),
    onCrossfade: vi.fn(),
    onRemove: vi.fn(),
    filledSlots: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
  });

  // ===========================================================================
  // Empty state (InlineSketchBrowser)
  // ===========================================================================

  describe("empty state", () => {
    it("renders inline sketch browser when sketchId is null", () => {
      render(<SlotColumn {...defaultProps} />);
      expect(screen.getByText("Choose a sketch")).toBeInTheDocument();
    });

    it("displays slot number badge", () => {
      const { container } = render(<SlotColumn {...defaultProps} slotIndex={0} />);
      const badge = container.querySelector('[class*="inlineSlotBadge"]');
      expect(badge).toHaveTextContent("1");
    });

    it("displays correct slot number (index + 1)", () => {
      const { container } = render(<SlotColumn {...defaultProps} slotIndex={4} />);
      const badge = container.querySelector('[class*="inlineSlotBadge"]');
      expect(badge).toHaveTextContent("5");
    });

    it("shows search input", () => {
      render(<SlotColumn {...defaultProps} />);
      expect(screen.getByPlaceholderText("Search sketches…")).toBeInTheDocument();
    });

    it("renders sketch groups", () => {
      render(<SlotColumn {...defaultProps} />);
      // Examples group should be present
      expect(screen.getByText("Examples")).toBeInTheDocument();
    });

    it("shows sketch count in group header", () => {
      render(<SlotColumn {...defaultProps} />);
      // The Examples group has a count badge
      const examplesHeader = screen
        .getByText("Examples")
        .closest("button");
      expect(examplesHeader).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Filled state
  // ===========================================================================

  describe("filled state", () => {
    const filledProps: SlotColumnProps = {
      ...defaultProps,
      sketchId: "blueCube" as SketchId,
      getSlotSketchParams: () => ({}),
    };

    it("renders sketch preview when sketchId is provided", () => {
      render(<SlotColumn {...filledProps} />);
      expect(screen.getByTestId("webgpu-canvas")).toBeInTheDocument();
    });

    it("renders slot parameter controls", () => {
      render(<SlotColumn {...filledProps} />);
      expect(
        screen.getByTestId("slot-parameter-controls-0"),
      ).toBeInTheDocument();
    });

    it("displays slot number badge in filled state", () => {
      render(<SlotColumn {...filledProps} slotIndex={2} />);
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("renders sketch selector with current sketch", () => {
      render(<SlotColumn {...filledProps} />);
      // The Select trigger should show sketch shortLabel (might be truncated)
      const selectTrigger = screen.getByRole("combobox", { name: /sketch selection/i });
      expect(selectTrigger).toBeInTheDocument();
      expect(selectTrigger).toHaveTextContent(/Blue/i);
    });
  });

  // ===========================================================================
  // Active state
  // ===========================================================================

  describe("active state", () => {
    const activeProps: SlotColumnProps = {
      ...defaultProps,
      sketchId: "blueCube" as SketchId,
      isActive: true,
    };

    it("shows Active button when active", () => {
      render(<SlotColumn {...activeProps} />);
      expect(screen.getByRole("button", { name: /Active/i })).toBeInTheDocument();
    });

    it("disables crossfade button when active", () => {
      render(<SlotColumn {...activeProps} />);
      const crossfadeButton = screen.getByRole("button", { name: /Active/i });
      expect(crossfadeButton).toBeDisabled();
    });

    it("does not show remove button when active", () => {
      render(<SlotColumn {...activeProps} canRemove={true} />);
      expect(
        screen.queryByLabelText(/Remove slot/i),
      ).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Crossfade state
  // ===========================================================================

  describe("crossfade state", () => {
    it("shows Crossfade button when not active", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        isActive: false,
      };
      render(<SlotColumn {...props} />);
      expect(
        screen.getByRole("button", { name: /Crossfade/i }),
      ).toBeInTheDocument();
    });

    it("shows progress percentage when crossfading to target", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        isCrossfadeTarget: true,
        isCrossfading: true,
        crossfadeProgress: 75,
      };
      render(<SlotColumn {...props} />);
      expect(screen.getByText("75%")).toBeInTheDocument();
    });

    it("shows inverse progress when active and crossfading", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        isActive: true,
        isCrossfading: true,
        crossfadeProgress: 30,
      };
      render(<SlotColumn {...props} />);
      expect(screen.getByText("70%")).toBeInTheDocument();
    });

    it("calls onCrossfade when crossfade button clicked", () => {
      const onCrossfade = vi.fn();
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        onCrossfade,
      };
      render(<SlotColumn {...props} />);

      const crossfadeButton = screen.getByRole("button", {
        name: /Crossfade/i,
      });
      fireEvent.click(crossfadeButton);

      expect(onCrossfade).toHaveBeenCalledTimes(1);
    });

    it("disables crossfade button during crossfading", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        isCrossfading: true,
        isCrossfadeTarget: false,
        crossfadeProgress: 50,
      };
      const { container } = render(<SlotColumn {...props} />);
      // Find crossfade button specifically
      const crossfadeButton = container.querySelector('[class*="crossfadeButton"]');
      expect(crossfadeButton).toBeDisabled();
    });
  });

  // ===========================================================================
  // Remove functionality
  // ===========================================================================

  describe("remove functionality", () => {
    it("shows remove button when canRemove is true and not active", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        canRemove: true,
        isActive: false,
      };
      render(<SlotColumn {...props} />);
      expect(screen.getByLabelText(/Remove slot 1/i)).toBeInTheDocument();
    });

    it("does not show remove button when canRemove is false", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        canRemove: false,
      };
      render(<SlotColumn {...props} />);
      expect(screen.queryByLabelText(/Remove slot/i)).not.toBeInTheDocument();
    });

    it("calls onRemove when remove button clicked", () => {
      const onRemove = vi.fn();
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        canRemove: true,
        onRemove,
      };
      render(<SlotColumn {...props} />);

      const removeButton = screen.getByLabelText(/Remove slot 1/i);
      fireEvent.click(removeButton);

      expect(onRemove).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Alpha and audio reactivity overlay
  // ===========================================================================

  describe("alpha and audio overlay", () => {
    it("shows alpha value when alpha < 0.99", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        alpha: 0.5,
      };
      render(<SlotColumn {...props} />);
      expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("does not show alpha value when alpha = 1", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        alpha: 1,
      };
      render(<SlotColumn {...props} />);
      expect(screen.queryByText("100%")).not.toBeInTheDocument();
    });

  });

  // ===========================================================================
  // Macropad selection state
  // ===========================================================================

  describe("macropad selection", () => {
    it("shows macropad indicator when isMacropadSelected is true", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        isMacropadSelected: true,
      };
      render(<SlotColumn {...props} />);
      expect(screen.getByText("⎈")).toBeInTheDocument();
    });

    it("does not show macropad indicator by default", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
      };
      render(<SlotColumn {...props} />);
      expect(screen.queryByText("⎈")).not.toBeInTheDocument();
    });

    it("includes macropad selected in aria-label", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        isMacropadSelected: true,
      };
      render(<SlotColumn {...props} />);
      expect(
        screen.getByLabelText(/Slot 1 \(macropad selected\)/i),
      ).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Search functionality
  // ===========================================================================

  describe("search functionality", () => {
    it("filters sketches based on search query", () => {
      render(<SlotColumn {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText("Search sketches…");
      fireEvent.change(searchInput, { target: { value: "Blue" } });

      // Blue Cube should be visible in the filtered results
      const results = screen.getAllByText(/Blue/i);
      expect(results.length).toBeGreaterThan(0);
    });

    it("shows clear button when searching", () => {
      render(<SlotColumn {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText("Search sketches…");
      fireEvent.change(searchInput, { target: { value: "test" } });

      expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
    });

    it("clears search when clear button clicked", () => {
      render(<SlotColumn {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText(
        "Search sketches…",
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "test" } });

      const clearButton = screen.getByLabelText("Clear search");
      fireEvent.click(clearButton);

      expect(searchInput.value).toBe("");
    });

    it("shows no results message when no matches", () => {
      render(<SlotColumn {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText("Search sketches…");
      fireEvent.change(searchInput, {
        target: { value: "nonexistentsketch" },
      });

      expect(
        screen.getByText(/No sketches match "nonexistentsketch"/i),
      ).toBeInTheDocument();
    });

    it("shows search results count", () => {
      render(<SlotColumn {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText("Search sketches…");
      fireEvent.change(searchInput, { target: { value: "Cube" } });

      // Should show count of matched sketches
      expect(screen.getByText(/sketch(es)? found/i)).toBeInTheDocument();
    });

    it("persists search query to sessionStorage", () => {
      render(<SlotColumn {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText("Search sketches…");
      fireEvent.change(searchInput, { target: { value: "test query" } });

      expect(sessionStorage.getItem("slew-sketch-search")).toBe("test query");
    });

    it("loads search query from sessionStorage on mount", () => {
      sessionStorage.setItem("slew-sketch-search", "persisted query");

      render(<SlotColumn {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText(
        "Search sketches…",
      ) as HTMLInputElement;
      expect(searchInput.value).toBe("persisted query");
    });
  });

  // ===========================================================================
  // Copy from slot functionality
  // ===========================================================================

  describe("copy from slot", () => {
    it("shows copy section when filledSlots provided", () => {
      const filledSlots = [
        { index: 1, sketchId: "blueCube" as SketchId },
        { index: 2, sketchId: "orangeCube" as SketchId },
      ];
      const props: SlotColumnProps = {
        ...defaultProps,
        filledSlots,
        onCopyToSlot: vi.fn(),
      };
      render(<SlotColumn {...props} />);

      expect(screen.getByText("Or copy from")).toBeInTheDocument();
    });

    it("does not show copy section when no filled slots", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        filledSlots: [],
        onCopyToSlot: vi.fn(),
      };
      render(<SlotColumn {...props} />);

      expect(screen.queryByText("Or copy from")).not.toBeInTheDocument();
    });

    it("calls onCopyToSlot when copy button clicked", () => {
      const onCopyToSlot = vi.fn();
      const filledSlots = [
        { index: 1, sketchId: "blueCube" as SketchId },
      ];
      const props: SlotColumnProps = {
        ...defaultProps,
        filledSlots,
        onCopyToSlot,
      };
      render(<SlotColumn {...props} />);

      const copyButton = screen.getByLabelText("Copy from slot 2");
      fireEvent.click(copyButton);

      expect(onCopyToSlot).toHaveBeenCalledWith(1);
    });

    it("displays slot number and sketch name in copy button", () => {
      const filledSlots = [
        { index: 3, sketchId: "blueCube" as SketchId },
      ];
      const props: SlotColumnProps = {
        ...defaultProps,
        filledSlots,
        onCopyToSlot: vi.fn(),
      };
      render(<SlotColumn {...props} />);

      // Find copy button and check it has both slot number and sketch name
      const copyButton = screen.getByLabelText("Copy from slot 4");
      expect(copyButton).toBeInTheDocument();
      expect(within(copyButton).getByText("4")).toBeInTheDocument();
      // Text might be split across spans, so check for partial match
      expect(within(copyButton).getByText(/Blue/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("has accessible label for empty slot", () => {
      render(<SlotColumn {...defaultProps} slotIndex={0} />);
      expect(
        screen.getByLabelText(/Slot 1 - choose a sketch/i),
      ).toBeInTheDocument();
    });

    it("has accessible label for filled slot", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
      };
      render(<SlotColumn {...props} slotIndex={0} />);
      const article = screen.getByRole("article", { name: /Slot 1/i });
      expect(article).toBeInTheDocument();
    });

    it("search input has accessible label", () => {
      render(<SlotColumn {...defaultProps} />);
      expect(screen.getByLabelText("Search sketches")).toBeInTheDocument();
    });

    it("sketch groups have aria-expanded attribute", () => {
      render(<SlotColumn {...defaultProps} />);
      const groupHeader = screen.getByText("Examples").closest("button");
      expect(groupHeader).toHaveAttribute("aria-expanded");
    });

    it("sketch groups have aria-controls attribute", () => {
      render(<SlotColumn {...defaultProps} />);
      const groupHeader = screen.getByText("Examples").closest("button");
      expect(groupHeader).toHaveAttribute("aria-controls");
    });
  });

  // ===========================================================================
  // Renderer aspect ratio
  // ===========================================================================

  describe("renderer aspect ratio", () => {
    it("uses default 16:9 aspect ratio", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
      };
      const { container } = render(<SlotColumn {...props} />);
      const previewContainer = container.querySelector('[class*="previewContainer"]');
      expect(previewContainer).toBeInTheDocument();
    });

    it("applies custom aspect ratio", () => {
      const props: SlotColumnProps = {
        ...defaultProps,
        sketchId: "blueCube" as SketchId,
        rendererAspectRatio: 4 / 3,
      };
      const { container } = render(<SlotColumn {...props} />);
      const previewContainer = container.querySelector('[class*="previewContainer"]');
      expect(previewContainer).toBeInTheDocument();
    });
  });
});
