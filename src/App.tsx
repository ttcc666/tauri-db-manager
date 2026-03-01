import { useCallback, useEffect, useMemo, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Grid from "@mui/material/GridLegacy";
import IconButton from "@mui/material/IconButton";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SettingsBrightnessRoundedIcon from "@mui/icons-material/SettingsBrightnessRounded";
import {
  canTestConnection,
  DB_CATALOG,
  DEFAULT_DB_TYPE,
  getConnectionTemplate,
  getTestSupportNote,
} from "./dbCatalog";
import { DatabaseTablePanel } from "./components/DatabaseTablePanel";
import { EntryEditorPanel } from "./components/EntryEditorPanel";
import { JsonPreviewPanel } from "./components/JsonPreviewPanel";
import { PathPanel } from "./components/PathPanel";
import { useConnectionTesting } from "./hooks/useConnectionTesting";
import { useDbConfigActions } from "./hooks/useDbConfigActions";
import {
  DatabaseEntry,
  DatabaseFile,
  FilterDefault,
  ImportMode,
  Notice,
  OptimizationSettings,
  ValidationResult,
} from "./types";
import "./App.css";

type ThemeMode = "light" | "dark" | "system";

type AppProps = {
  themeMode: ThemeMode;
  effectiveMode: "light" | "dark";
  onToggleTheme: () => void;
  onUseSystemTheme: () => void;
};

const PATH_STORAGE_KEY = "database-json-manager:last-path";

const emptyEntry = (): DatabaseEntry => ({
  name: "",
  connectionString: getConnectionTemplate(DEFAULT_DB_TYPE),
  dbType: DEFAULT_DB_TYPE,
  description: "",
  isDefault: false,
});

function App({ themeMode, effectiveMode, onToggleTheme, onUseSystemTheme }: AppProps) {
  const dbActions = useDbConfigActions();

  const [config, setConfig] = useState<DatabaseFile | null>(null);
  const [entry, setEntry] = useState<DatabaseEntry>(emptyEntry());
  const [dbPath, setDbPath] = useState<string>("");
  const [optText, setOptText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterDbType, setFilterDbType] = useState("ALL");
  const [filterDefault, setFilterDefault] = useState<FilterDefault>("ALL");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const {
    batchProgress,
    batchSummary,
    batchTesting,
    clearAllTestingState,
    clearBatchStatus,
    clearDetailResult,
    rowTestResults,
    runBatchTestConnections,
    testConnection,
    testResult,
    testing,
    testingName,
  } = useConnectionTesting(setNotice);

  const operationBusy =
    loading ||
    saving ||
    testing ||
    batchTesting ||
    importing ||
    exporting;

  const optimization = useMemo(() => {
    try {
      return optText.trim() ? (JSON.parse(optText) as OptimizationSettings) : undefined;
    } catch {
      return undefined;
    }
  }, [optText]);

  const optimizationInvalid = optText.trim().length > 0 && optimization === undefined;

  const configPreview = useMemo(
    () => (config ? JSON.stringify(config, null, 2) : ""),
    [config],
  );

  const dbTypeOptions = useMemo(() => {
    if (!config) return [];
    return Array.from(new Set(config.databases.map((item) => item.dbType))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [config]);

  const filteredDatabases = useMemo(() => {
    if (!config) return [];
    const keyword = searchKeyword.trim().toLowerCase();
    return config.databases.filter((item) => {
      const matchesKeyword =
        keyword.length === 0 ||
        item.name.toLowerCase().includes(keyword) ||
        item.dbType.toLowerCase().includes(keyword);
      const matchesDbType = filterDbType === "ALL" || item.dbType === filterDbType;
      const isDefault = Boolean(item.isDefault);
      const matchesDefault =
        filterDefault === "ALL"
          ? true
          : filterDefault === "DEFAULT_ONLY"
            ? isDefault
            : !isDefault;
      return matchesKeyword && matchesDbType && matchesDefault;
    });
  }, [config, filterDbType, filterDefault, searchKeyword]);

  const refreshFromData = useCallback(
    (data: DatabaseFile, nextSelect?: string) => {
      setConfig(data);
      clearAllTestingState();
      setValidationResult(null);

      if (data.databases.length === 0) {
        setEntry(emptyEntry());
        setSelectedName("");
        setOptText("");
        return;
      }

      const targetName = nextSelect ?? selectedName ?? data.databases[0]?.name;
      const found = data.databases.find((item) => item.name === targetName) ?? data.databases[0];
      setSelectedName(found.name);
      setEntry(found);
      setOptText(
        found.optimizationSettings
          ? JSON.stringify(found.optimizationSettings, null, 2)
          : "",
      );
    },
    [clearAllTestingState, selectedName],
  );

  const loadConfig = useCallback(
    async (showNotice = true) => {
      if (!dbPath.trim()) {
        setNotice({ severity: "error", text: "请先设置配置文件路径" });
        return;
      }

      setLoading(true);
      try {
        const data = await dbActions.loadDatabaseConfig();
        refreshFromData(data);
        if (showNotice) {
          setNotice({ severity: "info", text: "已载入配置" });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice({ severity: "error", text: `读取配置失败: ${message}` });
      } finally {
        setLoading(false);
      }
    },
    [dbActions, dbPath, refreshFromData],
  );

  const applyPathAndLoad = useCallback(
    async (pathOverride?: string) => {
      const targetPath = (pathOverride ?? dbPath).trim();
      if (!targetPath) {
        setNotice({ severity: "error", text: "路径不能为空" });
        return;
      }

      setLoading(true);
      try {
        const normalized = await dbActions.setDatabasePath(targetPath);
        setDbPath(normalized);
        localStorage.setItem(PATH_STORAGE_KEY, normalized);

        const data = await dbActions.loadDatabaseConfig();
        refreshFromData(data);
        setNotice({ severity: "success", text: "路径已更新并重新载入" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice({ severity: "error", text: `应用路径失败: ${message}` });
      } finally {
        setLoading(false);
      }
    },
    [dbActions, dbPath, refreshFromData],
  );

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const stored = localStorage.getItem(PATH_STORAGE_KEY)?.trim();
        if (stored) {
          await applyPathAndLoad(stored);
          return;
        }

        const initial = await dbActions.getDatabasePath();
        setDbPath(initial);
        if (initial.trim()) {
          await applyPathAndLoad(initial);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice({ severity: "error", text: `初始化失败: ${message}` });
      }
    };

    void bootstrap();
  }, [applyPathAndLoad, dbActions]);

  useEffect(() => {
    clearBatchStatus();
  }, [clearBatchStatus, filterDbType, filterDefault, searchKeyword]);

  const handleTextChange = (field: keyof DatabaseEntry, value: string | boolean) => {
    setEntry((prev) => ({ ...prev, [field]: value } as DatabaseEntry));
    clearDetailResult();
    setValidationResult(null);
  };

  const handleDbTypeChange = (value: string) => {
    setEntry((prev) => {
      const template = getConnectionTemplate(value);
      const shouldFill =
        prev.connectionString.trim() === "" ||
        getConnectionTemplate(prev.dbType) === prev.connectionString;
      return {
        ...prev,
        dbType: value,
        connectionString: shouldFill ? template : prev.connectionString,
      } as DatabaseEntry;
    });
    clearDetailResult();
    setValidationResult(null);
  };

  const resetTemplate = () => {
    setEntry(emptyEntry());
    setSelectedName("");
    setOptText("");
    clearDetailResult();
    setValidationResult(null);
  };

  const saveEntry = async () => {
    if (!dbPath.trim()) {
      setNotice({ severity: "error", text: "请先设置配置文件路径" });
      return;
    }
    if (!entry.name.trim()) {
      setNotice({ severity: "error", text: "名称不能为空" });
      return;
    }
    if (optimizationInvalid) {
      setNotice({ severity: "error", text: "optimizationSettings JSON 无法解析" });
      return;
    }

    setValidationResult(null);
    try {
      const validation = await dbActions.validateDatabaseEntry(
        entry.dbType,
        entry.connectionString,
      );
      setValidationResult(validation);
      if (!validation.valid) {
        setNotice({ severity: "error", text: validation.message });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `校验失败: ${message}` });
      return;
    }

    setSaving(true);
    try {
      const payload: DatabaseEntry = {
        ...entry,
        optimizationSettings: optimization,
      };
      const updated = await dbActions.upsertDatabaseEntry(payload);
      refreshFromData(updated, payload.name);
      setNotice({ severity: "success", text: "保存成功" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `保存失败: ${message}` });
    } finally {
      setSaving(false);
    }
  };

  const importDatabaseEntries = async () => {
    try {
      const importPath = await dbActions.pickJsonOpenPath();
      if (!importPath) {
        return;
      }

      setImporting(true);
      const updated = await dbActions.importDatabaseEntries(importPath, importMode);
      refreshFromData(updated);
      setNotice({
        severity: "success",
        text: importMode === "replace" ? "已覆盖导入配置" : "已合并导入配置",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `导入失败: ${message}` });
    } finally {
      setImporting(false);
    }
  };

  const exportFilteredEntries = async () => {
    if (filteredDatabases.length === 0) {
      setNotice({ severity: "info", text: "当前筛选结果为空，无可导出项" });
      return;
    }

    try {
      const exportPath = await dbActions.pickJsonSavePath("database.filtered.export.json");
      if (!exportPath) {
        return;
      }

      setExporting(true);
      await dbActions.exportDatabaseEntries(exportPath, filteredDatabases);
      setNotice({
        severity: "success",
        text: `导出成功，共 ${filteredDatabases.length} 条`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `导出失败: ${message}` });
    } finally {
      setExporting(false);
    }
  };

  const deleteEntry = async (name: string) => {
    if (!dbPath.trim()) {
      setNotice({ severity: "error", text: "请先设置配置文件路径" });
      return;
    }
    if (!name.trim()) {
      setNotice({ severity: "error", text: "请选择要删除的配置" });
      return;
    }

    setLoading(true);
    try {
      const updated = await dbActions.deleteDatabaseEntry(name);
      refreshFromData(updated);
      setNotice({ severity: "success", text: "已删除" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `删除失败: ${message}` });
    } finally {
      setLoading(false);
    }
  };

  const pickPath = async () => {
    try {
      const selectedPath = await dbActions.pickJsonOpenPath();
      if (selectedPath) {
        await applyPathAndLoad(selectedPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `选择文件失败: ${message}` });
    }
  };

  const handleSelectEntry = (name: string) => {
    if (!config) return;
    const found = config.databases.find((db) => db.name === name);
    if (!found) return;

    setSelectedName(found.name);
    setEntry(found);
    setOptText(
      found.optimizationSettings
        ? JSON.stringify(found.optimizationSettings, null, 2)
        : "",
    );
    clearDetailResult();
    setValidationResult(null);
  };

  const resolveTestDisabledReason = useCallback((targetEntry: DatabaseEntry): string => {
    if (!canTestConnection(targetEntry.dbType)) {
      return getTestSupportNote(targetEntry.dbType);
    }
    if (!targetEntry.connectionString.trim()) {
      return "连接字符串为空";
    }
    return "";
  }, []);

  const runFilteredBatchTesting = async () => {
    await runBatchTestConnections(
      filteredDatabases,
      selectedName,
      canTestConnection,
      getTestSupportNote,
    );
  };

  const testCurrentEntry = async () => {
    await testConnection(entry, selectedName, true);
  };

  const testEntryInTable = async (targetEntry: DatabaseEntry) => {
    await testConnection(targetEntry, selectedName, selectedName === targetEntry.name);
  };

  const themeLabel =
    themeMode === "system"
      ? `跟随系统 (${effectiveMode === "dark" ? "暗色" : "浅色"})`
      : effectiveMode === "dark"
        ? "暗色模式"
        : "浅色模式";

  return (
    <Box className="app-shell">
      <AppBar position="sticky" color="transparent" className="top-bar" enableColorOnDark>
        <Toolbar
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1.5,
            py: 1.25,
            flexWrap: "wrap",
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center" className="toolbar-brand">
            <Box className="brand-dot" />
            <Typography variant="h6" component="div" fontWeight={700} letterSpacing={0.3}>
              Database JSON Manager
            </Typography>
            <Chip label="Tauri + React" color="secondary" size="small" variant="outlined" />
            <Chip label={themeLabel} size="small" variant="outlined" />
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Tooltip title={effectiveMode === "dark" ? "切换到浅色" : "切换到暗色"}>
              <IconButton
                color="inherit"
                className="theme-button"
                aria-label="toggle-theme"
                onClick={onToggleTheme}
              >
                {effectiveMode === "dark" ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="跟随系统主题">
              <span>
                <IconButton
                  color="inherit"
                  className="theme-button"
                  aria-label="use-system-theme"
                  onClick={onUseSystemTheme}
                  disabled={themeMode === "system"}
                >
                  <SettingsBrightnessRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<RefreshIcon />}
              onClick={() => loadConfig()}
              disabled={operationBusy || !dbPath.trim()}
              size="small"
            >
              重新加载
            </Button>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<RestartAltIcon />}
              onClick={resetTemplate}
              disabled={operationBusy}
              size="small"
            >
              新建/重置
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SaveRoundedIcon />}
              onClick={saveEntry}
              disabled={operationBusy || !dbPath.trim()}
              size="small"
            >
              {saving ? "保存中..." : "保存"}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" className="enter-fade" sx={{ py: { xs: 2.5, md: 3.5 } }}>
        <PathPanel
          dbPath={dbPath}
          operationBusy={operationBusy}
          onPathChange={setDbPath}
          onPickPath={() => {
            void pickPath();
          }}
          onApplyPath={() => {
            void applyPathAndLoad();
          }}
        />

        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={5}>
            <DatabaseTablePanel
              batchProgress={batchProgress}
              batchSummary={batchSummary}
              batchTesting={batchTesting}
              config={config}
              dbTypeOptions={dbTypeOptions}
              exportDisabled={filteredDatabases.length === 0}
              exporting={exporting}
              filterDbType={filterDbType}
              filterDefault={filterDefault}
              filteredDatabases={filteredDatabases}
              importMode={importMode}
              importing={importing}
              loading={loading}
              operationBusy={operationBusy}
              rowTestResults={rowTestResults}
              searchKeyword={searchKeyword}
              selectedName={selectedName}
              testingName={testingName}
              onSearchKeywordChange={setSearchKeyword}
              onFilterDbTypeChange={setFilterDbType}
              onFilterDefaultChange={setFilterDefault}
              onRunBatchTestConnections={() => {
                void runFilteredBatchTesting();
              }}
              onImportModeChange={setImportMode}
              onImportEntries={() => {
                void importDatabaseEntries();
              }}
              onExportEntries={() => {
                void exportFilteredEntries();
              }}
              onSelectEntry={handleSelectEntry}
              onDeleteEntry={(name) => {
                void deleteEntry(name);
              }}
              onTestConnection={(targetEntry) => {
                void testEntryInTable(targetEntry);
              }}
              onResetTemplate={resetTemplate}
              resolveTestDisabledReason={resolveTestDisabledReason}
            />
          </Grid>

          <Grid item xs={12} lg={7}>
            <EntryEditorPanel
              dbCatalog={DB_CATALOG}
              entry={entry}
              operationBusy={operationBusy}
              optimizationInvalid={optimizationInvalid}
              optText={optText}
              testButtonDisabledReason={resolveTestDisabledReason(entry)}
              testResult={testResult}
              testing={testing && testingName === (entry.name || entry.dbType)}
              validationResult={validationResult}
              onDbTypeChange={handleDbTypeChange}
              onTextChange={handleTextChange}
              onOptimizationTextChange={(value) => {
                setOptText(value);
                clearDetailResult();
                setValidationResult(null);
              }}
              onTestConnection={() => {
                void testCurrentEntry();
              }}
            />
          </Grid>
        </Grid>
      </Container>

      <Container maxWidth="xl" className="enter-fade" sx={{ pb: 3.5 }}>
        <JsonPreviewPanel configPreview={configPreview} />
      </Container>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4200}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {notice ? (
          <Alert severity={notice.severity} variant="filled" onClose={() => setNotice(null)}>
            {notice.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

export default App;


