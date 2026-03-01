export interface OptimizationSettings {
  autoToLower?: string;
  enableILike?: string;
  identityStrategy?: string;
}

export interface Notice {
  severity: "success" | "error" | "info";
  text: string;
}

export interface DbCatalogItem {
  dbType: string;
  template: string;
  supportsConnectionTest: boolean;
  testSupportNote: string;
}

export interface DatabaseEntry {
  name: string;
  connectionString: string;
  dbType: string;
  description?: string;
  isDefault?: boolean;
  optimizationSettings?: OptimizationSettings;
}

export interface DatabaseFile {
  databases: DatabaseEntry[];
}

export interface ConnectionTestResult {
  ok: boolean;
  dbType: string;
  latencyMs: number;
  message: string;
  detail?: string;
}

export interface ValidationResult {
  valid: boolean;
  message: string;
  detail?: string;
}

export interface BatchTestSummary {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

export type ImportMode = "merge" | "replace";

export type FilterDefault = "ALL" | "DEFAULT_ONLY" | "NON_DEFAULT";
