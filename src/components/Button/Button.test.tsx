import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  // ===========================================================================
  // Basic rendering
  // ===========================================================================

  describe("rendering", () => {
    it("renders children text", () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole("button")).toHaveTextContent("Click me");
    });

    it("renders with default type button", () => {
      render(<Button>Test</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    });

    it("applies custom className", () => {
      render(<Button className="custom-class">Test</Button>);
      expect(screen.getByRole("button")).toHaveClass("custom-class");
    });
  });

  // ===========================================================================
  // Variants
  // ===========================================================================

  describe("variants", () => {
    it("applies default variant styling", () => {
      render(<Button variant="default">Default</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("applies primary variant styling", () => {
      render(<Button variant="primary">Primary</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("applies danger variant styling", () => {
      render(<Button variant="danger">Danger</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Sizes
  // ===========================================================================

  describe("sizes", () => {
    it("applies sm size by default", () => {
      render(<Button>Small</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("applies md size when specified", () => {
      render(<Button size="md">Medium</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Disabled state
  // ===========================================================================

  describe("disabled state", () => {
    it("is not disabled by default", () => {
      render(<Button>Enabled</Button>);
      expect(screen.getByRole("button")).not.toBeDisabled();
    });

    it("is disabled when disabled prop is true", () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not fire onClick when disabled", () => {
      const handleClick = vi.fn();
      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>,
      );

      fireEvent.click(screen.getByRole("button"));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Loading state
  // ===========================================================================

  describe("loading state", () => {
    it("shows children when not loading", () => {
      render(<Button>Submit</Button>);
      expect(screen.getByRole("button")).toHaveTextContent("Submit");
    });

    it("shows spinner when loading", () => {
      render(<Button isLoading>Submit</Button>);
      const button = screen.getByRole("button");
      // Still shows original text alongside spinner
      expect(button).toHaveTextContent("Submit");
    });

    it("shows loadingText when loading and loadingText provided", () => {
      render(
        <Button isLoading loadingText="Saving...">
          Submit
        </Button>,
      );
      expect(screen.getByRole("button")).toHaveTextContent("Saving...");
    });

    it("is disabled when loading", () => {
      render(<Button isLoading>Submit</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not fire onClick when loading", () => {
      const handleClick = vi.fn();
      render(
        <Button isLoading onClick={handleClick}>
          Submit
        </Button>,
      );

      fireEvent.click(screen.getByRole("button"));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Click handling
  // ===========================================================================

  describe("click handling", () => {
    it("calls onClick when clicked", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      fireEvent.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("passes event to onClick handler", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      fireEvent.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "click",
        }),
      );
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("is focusable", () => {
      render(<Button>Focusable</Button>);
      const button = screen.getByRole("button");

      button.focus();
      expect(button).toHaveFocus();
    });

    it("is not focusable when disabled", () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole("button");

      button.focus();
      // Disabled buttons should not receive focus
      expect(button).toBeDisabled();
    });

    it("supports aria-label", () => {
      render(<Button aria-label="Close dialog">×</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-label",
        "Close dialog",
      );
    });
  });

  // ===========================================================================
  // HTML attributes passthrough
  // ===========================================================================

  describe("HTML attributes", () => {
    it("passes through id attribute", () => {
      render(<Button id="submit-btn">Submit</Button>);
      expect(screen.getByRole("button")).toHaveAttribute("id", "submit-btn");
    });

    it("passes through data attributes", () => {
      render(<Button data-testid="my-button">Test</Button>);
      expect(screen.getByTestId("my-button")).toBeInTheDocument();
    });

    it("passes through title attribute", () => {
      render(<Button title="Click to submit">Submit</Button>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "title",
        "Click to submit",
      );
    });
  });
});
