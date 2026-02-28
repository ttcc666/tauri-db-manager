export interface OptimizationSettings {
  autoToLower?: string;
  enableILike?: string;
  identityStrategy?: string;
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

export interface SnapshotMeta {
  fileName: string;
  fullPath: string;
  createdAt: string;
  size: number;
}

export interface DiffSummary {
  addedCount: number;
  removedCount: number;
  changedCount: number;
}

export interface FieldChange {
  field: string;
  before?: string | null;
  after?: string | null;
}

export interface ChangedEntry {
  name: string;
  fieldChanges: FieldChange[];
}

export interface SnapshotDiffResult {
  summary: DiffSummary;
  added: string[];
  removed: string[];
  changed: ChangedEntry[];
}
