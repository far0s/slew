import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProjects } from "./useProjects";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

describe("useProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads project list on mount", async () => {
    const projects = [
      { name: "My Set", created_at: "2026-06-01T10:00:00Z", is_autosave: false },
    ];
    mockInvoke.mockResolvedValueOnce(projects);

    const { result } = renderHook(() => useProjects());

    await act(async () => {});

    expect(mockInvoke).toHaveBeenCalledWith("list_projects");
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].name).toBe("My Set");
  });

  it("saves project and refreshes list", async () => {
    mockInvoke.mockResolvedValueOnce([]); // initial list
    mockInvoke.mockResolvedValueOnce({ name: "New Set", created_at: "2026-06-01T11:00:00Z", is_autosave: false }); // save
    mockInvoke.mockResolvedValueOnce([{ name: "New Set", created_at: "2026-06-01T11:00:00Z", is_autosave: false }]); // refresh

    const { result } = renderHook(() => useProjects());
    await act(async () => {});

    await act(async () => {
      await result.current.save("New Set");
    });

    expect(mockInvoke).toHaveBeenCalledWith("save_project", { name: "New Set", frontendState: null });
    expect(result.current.projects).toHaveLength(1);
  });

  it("deletes project and refreshes list", async () => {
    const initial = [{ name: "My Set", created_at: "2026-06-01T10:00:00Z", is_autosave: false }];
    mockInvoke.mockResolvedValueOnce(initial); // initial
    mockInvoke.mockResolvedValueOnce(undefined); // delete
    mockInvoke.mockResolvedValueOnce([]); // refresh

    const { result } = renderHook(() => useProjects());
    await act(async () => {});

    await act(async () => {
      await result.current.deleteProject("My Set");
    });

    expect(mockInvoke).toHaveBeenCalledWith("delete_project", { name: "My Set" });
    expect(result.current.projects).toHaveLength(0);
  });
});
