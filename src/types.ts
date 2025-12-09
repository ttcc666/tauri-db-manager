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
