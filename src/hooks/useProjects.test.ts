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

  it("sets error when list_projects fails on mount", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("backend unavailable"));

    const { result } = renderHook(() => useProjects());
    await act(async () => {});

    expect(result.current.error).toBe("backend unavailable");
    expect(result.current.projects).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("clears error on successful refresh after failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("backend unavailable")); // mount
    const { result } = renderHook(() => useProjects());
    await act(async () => {});
    expect(result.current.error).toBe("backend unavailable");

    mockInvoke.mockResolvedValueOnce([]); // recovery
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
  });

  it("sets error when refresh fails after delete", async () => {
    mockInvoke.mockResolvedValueOnce([{ name: "A", created_at: "2026-06-01T00:00:00Z", is_autosave: false }]); // mount
    mockInvoke.mockResolvedValueOnce(undefined); // delete
    mockInvoke.mockRejectedValueOnce(new Error("disk error")); // refresh after delete

    const { result } = renderHook(() => useProjects());
    await act(async () => {});

    await act(async () => {
      await result.current.deleteProject("A");
    });

    expect(result.current.error).toBe("disk error");
  });
});
