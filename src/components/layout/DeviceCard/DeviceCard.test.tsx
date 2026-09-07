import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeviceCard } from "./DeviceCard";

describe("DeviceCard", () => {
  it("exposes expansion state and toggles", () => {
    const onToggle = vi.fn();
    render(
      <DeviceCard
        tag="MIDI"
        name="Controller"
        status="Connected"
        statusTone="success"
        expanded={false}
        onToggle={onToggle}
      >
        Details
      </DeviceCard>,
    );

    const button = screen.getByRole("button", { name: /MIDIControllerConnected/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
