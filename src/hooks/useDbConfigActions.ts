import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  DatabaseEntry,
  DatabaseFile,
  ImportMode,
  ValidationResult,
} from "../types";

export function useDbConfigActions() {
  const getDatabasePath = () => invoke<string>("get_database_path");

  const setDatabasePath = (path: string) =>
    invoke<string>("set_database_path", { path });

  const loadDatabaseConfig = () => invoke<DatabaseFile>("load_database_config");

  const upsertDatabaseEntry = (entry: DatabaseEntry) =>
    invoke<DatabaseFile>("upsert_database_entry", { entry });

  const deleteDatabaseEntry = (name: string) =>
    invoke<DatabaseFile>("delete_database_entry", { name });

  const validateDatabaseEntry = (dbType: string, connectionString: string) =>
    invoke<ValidationResult>("validate_database_entry", {
      dbType,
      connectionString,
    });

  const importDatabaseEntries = (path: string, mode: ImportMode) =>
    invoke<DatabaseFile>("import_database_entries", {
      path,
      mode,
    });

  const exportDatabaseEntries = (path: string, entries: DatabaseEntry[]) =>
    invoke("export_database_entries", {
      path,
      entries,
    });

  const pickJsonOpenPath = async (): Promise<string | null> => {
    const result = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
    const selected = Array.isArray(result) ? result[0] : result;
    return typeof selected === "string" && selected.trim() ? selected : null;
  };

  const pickJsonSavePath = async (defaultPath: string): Promise<string | null> => {
    const result = await save({
      defaultPath,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    return typeof result === "string" && result.trim() ? result : null;
  };

  return useMemo(
    () => ({
      deleteDatabaseEntry,
      exportDatabaseEntries,
      getDatabasePath,
      importDatabaseEntries,
      loadDatabaseConfig,
      pickJsonOpenPath,
      pickJsonSavePath,
      setDatabasePath,
      upsertDatabaseEntry,
      validateDatabaseEntry,
    }),
    [],
  );
}
