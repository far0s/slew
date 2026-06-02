import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useEffect } from "react";

export interface ProjectInfo {
  name: string;
  created_at: string;
  is_autosave: boolean;
  sketches: Array<string | null>;
}

export interface UseProjectsResult {
  projects: ProjectInfo[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  save: (name: string, frontendState?: string) => Promise<ProjectInfo>;
  load: (name: string) => Promise<void>;
  deleteProject: (name: string) => Promise<void>;
  rename: (oldName: string, newName: string) => Promise<ProjectInfo>;
  exportProject: (name: string) => Promise<void>;
  importProject: () => Promise<ProjectInfo | null>;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await invoke<ProjectInfo[]>("list_projects");
    setProjects(result);
  }, []);

  useEffect(() => {
    void refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const save = useCallback(
    async (name: string, frontendState?: string): Promise<ProjectInfo> => {
      const info = await invoke<ProjectInfo>("save_project", {
        name,
        frontendState: frontendState ?? null,
      });
      await refresh();
      return info;
    },
    [refresh],
  );

  const load = useCallback(async (name: string): Promise<void> => {
    await invoke<void>("load_project", { name });
  }, []);

  const deleteProject = useCallback(
    async (name: string): Promise<void> => {
      await invoke<void>("delete_project", { name });
      await refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    async (oldName: string, newName: string): Promise<ProjectInfo> => {
      const info = await invoke<ProjectInfo>("rename_project", { oldName, newName });
      await refresh();
      return info;
    },
    [refresh],
  );

  const exportProject = useCallback(async (name: string): Promise<void> => {
    await invoke<void>("export_project", { name });
  }, []);

  const importProject = useCallback(async (): Promise<ProjectInfo | null> => {
    const info = await invoke<ProjectInfo | null>("import_project");
    if (info) {
      await refresh();
    }
    return info;
  }, [refresh]);

  return {
    projects,
    isLoading,
    refresh,
    save,
    load,
    deleteProject,
    rename,
    exportProject,
    importProject,
  };
}
