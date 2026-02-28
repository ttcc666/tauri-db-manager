import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import Grid from "@mui/material/GridLegacy";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Toolbar,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import SettingsBrightnessRoundedIcon from "@mui/icons-material/SettingsBrightnessRounded";
import {
  BatchTestSummary,
  ChangedEntry,
  ConnectionTestResult,
  DatabaseEntry,
  DatabaseFile,
  FieldChange,
  ImportMode,
  OptimizationSettings,
  SnapshotDiffResult,
  SnapshotMeta,
  ValidationResult,
} from "./types";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import "./App.css";

type Notice = {
  severity: "success" | "error" | "info";
  text: string;
};

type ThemeMode = "light" | "dark" | "system";

type AppProps = {
  themeMode: ThemeMode;
  effectiveMode: "light" | "dark";
  onToggleTheme: () => void;
  onUseSystemTheme: () => void;
};

const PATH_STORAGE_KEY = "tauri-db-manager:last-path";
const connectionTemplates: Record<string, string> = {
  PostgreSQL:
    "Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=123456;Pooling=true;Minimum Pool Size=1;Maximum Pool Size=100;",
  MySql:
    "Server=localhost;Port=3306;Database=mydb;User=root;Password=123456;Charset=utf8mb4;Pooling=true;Min Pool Size=1;Max Pool Size=100;",
  SqlServer:
    "Server=localhost;Database=master;User Id=sa;Password=123456;Encrypt=True;TrustServerCertificate=True;Min Pool Size=1;Max Pool Size=100;",
  Oracle:
    "Data Source=localhost/orcl;User ID=system;Password=oracle123;Pooling=true;Min Pool Size=5;Max Pool Size=150;",
  Sqlite: "Data Source=./data/local.db;Cache=Shared;Mode=ReadWriteCreate;",
  MongoDb: "mongodb://root:123456@localhost:27017/mydb?authSource=admin",
  ClickHouse: "Host=localhost;Port=8123;User=default;Password=;Database=default",
  Tidb:
    "Server=localhost;Port=4000;Database=bigdata;User=root;Password=123456;Charset=utf8mb4;Pooling=true;Min Pool Size=1;Max Pool Size=50;",
  OceanBase:
    "Server=localhost;Port=2881;Database=test;User=root@sys;Password=password;Charset=utf8mb4;Pooling=true;",
  OceanBaseForOracle:
    "Driver={OceanBase ODBC 2.0 Driver};Server=localhost;Port=2883;Database=ORCL;User=USER@TENANT#CLUSTER;Password=strong_pwd;Option=3;",
  Dm: "Server=localhost;Port=5236;Database=finance;User=SYSDBA;Password=SYSDBA001;",
  Kdbndp: "Server=localhost;Port=54321;Database=crm;User=SYSTEM;Password=system123;",
  GaussDBNative:
    "PORT=5432;DATABASE=analytics;HOST=localhost;PASSWORD=Gauss@123;USER ID=gaussdb;No Reset On Close=true;",
  OpenGauss:
    "PORT=5432;DATABASE=tenant;HOST=localhost;PASSWORD=Gauss@123;USER ID=gaussdb;No Reset On Close=true;",
  PolarDB:
    "Server=localhost;Port=3306;Database=mydb;Uid=root;Pwd=123456;Pooling=false;",
  Vastbase:
    "PORT=5432;DATABASE=report;HOST=localhost;USER ID=postgres;PASSWORD=pass;No Reset On Close=true;",
  HG: "Server=localhost;Port=5866;UId=design;Password=000;Database=design;searchpath=design;Pooling=false;",
  GoldenDB:
    "Server=localhost;Port=3306;Database=mydb;Uid=root;Pwd=123456;Pooling=false;",
  GBase:
    "Host=localhost;Service=19088;Server=gbase01;Database=testdb;Protocol=onsoctcp;Uid=gbasedbt;Pwd=GBase123;Db_locale=zh_CN.utf8;Client_locale=zh_CN.utf8",
  Doris: "Server=localhost;Database=mydb;Uid=root;Pwd=123456;Pooling=false;",
  TDengine: "Host=localhost;Port=6030;Username=root;Password=taosdata;Database=power",
  DuckDB: "DataSource=./duck.db",
  QuestDB:
    "host=localhost;port=8812;username=admin;password=quest;database=qdb;ServerCompatibilityMode=NoTypeLoading;",
  Oscar: "Data Source=localhost;User Id=sysdba;Password=oscar;",
};

const defaultDbType = "PostgreSQL";

const emptyEntry = (): DatabaseEntry => ({
  name: "",
  connectionString: connectionTemplates[defaultDbType] ?? "",
  dbType: defaultDbType,
  description: "",
  isDefault: false,
});

function App({ themeMode, effectiveMode, onToggleTheme, onUseSystemTheme }: AppProps) {
  const [config, setConfig] = useState<DatabaseFile | null>(null);
  const [entry, setEntry] = useState<DatabaseEntry>(emptyEntry());
  const [dbPath, setDbPath] = useState<string>("");
  const [optText, setOptText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingName, setTestingName] = useState<string>("");
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [batchSummary, setBatchSummary] = useState<BatchTestSummary | null>(null);
  const [rowTestResults, setRowTestResults] = useState<Record<string, ConnectionTestResult>>({});
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [restoringSnapshot, setRestoringSnapshot] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [diffingSnapshot, setDiffingSnapshot] = useState("");
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffSnapshotName, setDiffSnapshotName] = useState("");
  const [snapshotDiff, setSnapshotDiff] = useState<SnapshotDiffResult | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterDbType, setFilterDbType] = useState("ALL");
  const [filterDefault, setFilterDefault] = useState<"ALL" | "DEFAULT_ONLY" | "NON_DEFAULT">(
    "ALL",
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const operationBusy =
    loading ||
    saving ||
    testing ||
    batchTesting ||
    importing ||
    exporting ||
    loadingSnapshots ||
    restoringSnapshot ||
    Boolean(diffingSnapshot);

  const optimization = useMemo(() => {
    try {
      return optText.trim() ? (JSON.parse(optText) as OptimizationSettings) : undefined;
    } catch {
      return undefined;
    }
  }, [optText]);

  const refreshFromData = (data: DatabaseFile, nextSelect?: string) => {
    setConfig(data);
    setRowTestResults({});
    setBatchSummary(null);
    setBatchProgress({ done: 0, total: 0 });
    setValidationResult(null);
    setTestingName("");
    if (data.databases.length === 0) {
      setEntry(emptyEntry());
      setSelectedName("");
      setOptText("");
      setTestResult(null);
      return;
    }
    const targetName = nextSelect ?? selectedName ?? data.databases[0]?.name;
    const found = data.databases.find((item) => item.name === targetName) ?? data.databases[0];
    setSelectedName(found.name);
    setEntry(found);
    setOptText(found.optimizationSettings ? JSON.stringify(found.optimizationSettings, null, 2) : "");
    setTestResult(null);
  };

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
        keyword.length === 0 || item.name.toLowerCase().includes(keyword) || item.dbType.toLowerCase().includes(keyword);
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

  const fetchPath = async () => {
    const path = await invoke<string>("get_database_path");
    setDbPath(path);
    return path;
  };

  const refreshSnapshots = async (silenceError = true, pathHint?: string) => {
    const effectivePath = (pathHint ?? dbPath).trim();
    if (!effectivePath) {
      setSnapshots([]);
      return;
    }

    setLoadingSnapshots(true);
    try {
      const data = await invoke<SnapshotMeta[]>("list_snapshots");
      setSnapshots(data);
    } catch (error) {
      if (!silenceError) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice({ severity: "error", text: `读取快照列表失败: ${message}` });
      }
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const loadConfig = async (showNotice = true) => {
    if (!dbPath.trim()) {
      setNotice({ severity: "error", text: "请先设置配置文件路径" });
      return;
    }
    setLoading(true);
    try {
      const data = await invoke<DatabaseFile>("load_database_config");
      refreshFromData(data);
      await refreshSnapshots();
      if (showNotice) {
        setNotice({ severity: "info", text: "已载入配置" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `读取配置失败: ${message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const stored = localStorage.getItem(PATH_STORAGE_KEY)?.trim();
        if (stored) {
          await applyPathAndLoad(stored);
          return;
        }
        const initial = await fetchPath();
        if (initial.trim()) {
          await applyPathAndLoad(initial);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setNotice({ severity: "error", text: `初始化失败: ${message}` });
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    setBatchSummary(null);
    setBatchProgress({ done: 0, total: 0 });
  }, [filterDbType, filterDefault, searchKeyword]);


  const handleTextChange = (field: keyof DatabaseEntry, value: string | boolean) => {
    setEntry((prev) => ({ ...prev, [field]: value } as DatabaseEntry));
    setTestResult(null);
    setValidationResult(null);
  };

  const handleDbTypeChange = (value: string) => {
    setEntry((prev) => {
      const template = connectionTemplates[value] ?? "";
      const shouldFill = prev.connectionString.trim() === "" || connectionTemplates[prev.dbType] === prev.connectionString;
      return {
        ...prev,
        dbType: value,
        connectionString: shouldFill ? template : prev.connectionString,
      } as DatabaseEntry;
    });
    setTestResult(null);
    setValidationResult(null);
  };

  const resetTemplate = () => {
    setEntry(emptyEntry());
    setSelectedName("");
    setOptText("");
    setTestResult(null);
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

    setValidationResult(null);
    try {
      const validation = await invoke<ValidationResult>("validate_database_entry", {
        dbType: entry.dbType,
        connectionString: entry.connectionString,
      });
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
      let opt: OptimizationSettings | undefined;
      if (optText.trim()) {
        opt = JSON.parse(optText);
      }
      const payload: DatabaseEntry = { ...entry, optimizationSettings: opt };
      const updated = await invoke<DatabaseFile>("upsert_database_entry", { entry: payload });
      refreshFromData(updated, payload.name);
      await refreshSnapshots();
      setNotice({ severity: "success", text: "保存成功" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `保存失败: ${message}` });
    } finally {
      setSaving(false);
    }
  };

  const performConnectionTest = async (
    candidate: DatabaseEntry,
    options?: { showNotice?: boolean; syncDetailPanel?: boolean },
  ): Promise<ConnectionTestResult> => {
    const showNotice = options?.showNotice ?? true;
    const syncDetailPanel = options?.syncDetailPanel ?? false;

    try {
      const result = await invoke<ConnectionTestResult>("test_database_connection", {
        dbType: candidate.dbType,
        connectionString: candidate.connectionString,
      });
      if (candidate.name.trim()) {
        setRowTestResults((prev) => ({ ...prev, [candidate.name]: result }));
      }
      if (syncDetailPanel) {
        setTestResult(result);
      }
      if (showNotice) {
        setNotice({
          severity: result.ok ? "success" : "error",
          text: `${result.message}${result.latencyMs ? `（${result.latencyMs} ms）` : ""}`,
        });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fallback: ConnectionTestResult = {
        ok: false,
        dbType: candidate.dbType,
        latencyMs: 0,
        message: "测试连接执行失败",
        detail: message,
      };
      if (candidate.name.trim()) {
        setRowTestResults((prev) => ({ ...prev, [candidate.name]: fallback }));
      }
      if (syncDetailPanel) {
        setTestResult(fallback);
      }
      if (showNotice) {
        setNotice({ severity: "error", text: `测试连接失败: ${message}` });
      }
      return fallback;
    }
  };

  const testConnection = async (targetEntry?: DatabaseEntry) => {
    const candidate = targetEntry ?? entry;

    if (!candidate.dbType.trim()) {
      setNotice({ severity: "error", text: "请先选择数据库类型" });
      return;
    }
    if (!candidate.connectionString.trim()) {
      setNotice({ severity: "error", text: "连接字符串不能为空" });
      return;
    }

    setTesting(true);
    setTestingName(candidate.name || candidate.dbType);
    if (!targetEntry) {
      setTestResult(null);
    }
    try {
      await performConnectionTest(candidate, {
        showNotice: true,
        syncDetailPanel: !targetEntry || selectedName === candidate.name,
      });
    } finally {
      setTesting(false);
      setTestingName("");
    }
  };

  const runBatchTestConnections = async () => {
    if (filteredDatabases.length === 0) {
      setNotice({ severity: "info", text: "当前筛选结果为空，无可测试项" });
      return;
    }

    const total = filteredDatabases.length;
    let success = 0;
    let failed = 0;
    let skipped = 0;

    setBatchTesting(true);
    setBatchSummary(null);
    setBatchProgress({ done: 0, total });

    try {
      for (let index = 0; index < filteredDatabases.length; index += 1) {
        const candidate = filteredDatabases[index];
        setTestingName(candidate.name || candidate.dbType);

        if (!candidate.connectionString.trim()) {
          skipped += 1;
          const skippedResult: ConnectionTestResult = {
            ok: false,
            dbType: candidate.dbType,
            latencyMs: 0,
            message: "连接字符串为空，已跳过",
            detail: "该项未填写 connectionString，未执行测试",
          };
          setRowTestResults((prev) => ({ ...prev, [candidate.name]: skippedResult }));
          setBatchProgress({ done: index + 1, total });
          continue;
        }

        const result = await performConnectionTest(candidate, {
          showNotice: false,
          syncDetailPanel: selectedName === candidate.name,
        });
        if (result.ok) {
          success += 1;
        } else {
          failed += 1;
        }
        setBatchProgress({ done: index + 1, total });
      }
    } finally {
      setBatchTesting(false);
      setTestingName("");
    }

    const summary: BatchTestSummary = { total, success, failed, skipped };
    setBatchSummary(summary);
    setNotice({
      severity: failed > 0 ? "error" : "success",
      text: `批量测试完成：成功 ${success} / 失败 ${failed} / 跳过 ${skipped}`,
    });
  };

  const importDatabaseEntries = async () => {
    try {
      const result = await open({
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      const importPath = Array.isArray(result) ? result[0] : result;
      if (typeof importPath !== "string" || !importPath.trim()) {
        return;
      }

      setImporting(true);
      const updated = await invoke<DatabaseFile>("import_database_entries", {
        path: importPath,
        mode: importMode,
      });
      refreshFromData(updated);
      await refreshSnapshots();
      setNotice({
        severity: "success",
        text:
          importMode === "replace"
            ? "已覆盖导入配置"
            : "已合并导入配置",
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
      const exportPath = await save({
        defaultPath: "database.filtered.export.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof exportPath !== "string" || !exportPath.trim()) {
        return;
      }

      setExporting(true);
      await invoke("export_database_entries", {
        path: exportPath,
        entries: filteredDatabases,
      });
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

  const restoreFromSnapshot = async (snapshot: SnapshotMeta) => {
    if (!window.confirm(`确认回滚到快照 ${snapshot.fileName} 吗？`)) {
      return;
    }

    setRestoringSnapshot(true);
    try {
      const updated = await invoke<DatabaseFile>("restore_snapshot", {
        snapshotFile: snapshot.fullPath,
      });
      refreshFromData(updated);
      await refreshSnapshots();
      setNotice({ severity: "success", text: `已回滚到快照：${snapshot.fileName}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `回滚失败: ${message}` });
    } finally {
      setRestoringSnapshot(false);
    }
  };

  const viewSnapshotDiff = async (snapshot: SnapshotMeta) => {
    setDiffingSnapshot(snapshot.fullPath);
    try {
      const result = await invoke<SnapshotDiffResult>("compare_snapshot_with_current", {
        snapshotFile: snapshot.fullPath,
      });
      setSnapshotDiff(result);
      setDiffSnapshotName(snapshot.fileName);
      setDiffDialogOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `读取快照差异失败: ${message}` });
    } finally {
      setDiffingSnapshot("");
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
      const updated = await invoke<DatabaseFile>("delete_database_entry", { name });
      refreshFromData(updated);
      await refreshSnapshots();
      setNotice({ severity: "success", text: "已删除" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `删除失败: ${message}` });
    } finally {
      setLoading(false);
    }
  };

  const applyPathAndLoad = async (pathOverride?: string) => {
    const targetPath = (pathOverride ?? dbPath).trim();
    if (!targetPath) {
      setNotice({ severity: "error", text: "路径不能为空" });
      return;
    }
    setLoading(true);
    try {
      const normalized = await invoke<string>("set_database_path", { path: targetPath });
      setDbPath(normalized);
      localStorage.setItem(PATH_STORAGE_KEY, normalized);
      const data = await invoke<DatabaseFile>("load_database_config");
      refreshFromData(data);
      await refreshSnapshots(false, normalized);
      setNotice({ severity: "success", text: "路径已更新并重新载入" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `应用路径失败: ${message}` });
    } finally {
      setLoading(false);
    }
  };


  const pickPath = async () => {
    try {
      const result = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
      if (typeof result === "string") {
        await applyPathAndLoad(result);
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
    setOptText(found.optimizationSettings ? JSON.stringify(found.optimizationSettings, null, 2) : "");
    setTestResult(null);
    setValidationResult(null);
  };

  const themeLabel =
    themeMode === "system"
      ? `跟随系统 (${effectiveMode === "dark" ? "暗色" : "浅色"})`
      : effectiveMode === "dark"
        ? "暗色模式"
        : "浅色模式";

  const formatSnapshotTime = (value: string) => {
    const unixSeconds = Number(value);
    if (Number.isNaN(unixSeconds) || unixSeconds <= 0) {
      return value;
    }
    return new Date(unixSeconds * 1000).toLocaleString();
  };

  const formatSnapshotSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDiffValue = (value?: string | null) => {
    if (value === undefined || value === null) return "(未设置)";
    if (value === "") return "(空字符串)";
    return value;
  };

  const fieldLabelMap: Record<string, string> = {
    dbType: "数据库类型",
    connectionString: "连接字符串",
    description: "描述",
    isDefault: "默认标记",
    optimizationSettings: "优化设置",
  };

  const renderFieldChange = (change: FieldChange) => (
    <Box
      key={`${change.field}-${change.before ?? ""}-${change.after ?? ""}`}
      sx={(theme) => ({
        borderRadius: 1.5,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
        backgroundColor: alpha(theme.palette.primary.main, 0.04),
        px: 1.2,
        py: 0.9,
      })}
    >
      <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
        {fieldLabelMap[change.field] ?? change.field}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          mt: 0.25,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, ui-monospace, monospace',
        }}
      >
        当前值: {formatDiffValue(change.before)}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          mt: 0.25,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, ui-monospace, monospace',
        }}
      >
        快照值: {formatDiffValue(change.after)}
      </Typography>
    </Box>
  );

  const renderChangedEntry = (entryChange: ChangedEntry) => (
    <Box
      key={entryChange.name}
      sx={(theme) => ({
        borderRadius: 1.8,
        border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
        backgroundColor: alpha(theme.palette.warning.main, 0.06),
        p: 1.2,
      })}
    >
      <Typography variant="body2" fontWeight={700}>
        {entryChange.name}
      </Typography>
      <Stack spacing={0.75} sx={{ mt: 0.75 }}>
        {entryChange.fieldChanges.map((change) => renderFieldChange(change))}
      </Stack>
    </Box>
  );

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
              Database.json 管理台
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
        <Paper className="panel path-panel" sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <TextField
                label="配置文件路径"
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
                fullWidth
                helperText="输入或粘贴 JSON 路径（可相对/绝对），应用后立即读取"
                size="small"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<FolderOpenIcon />}
                  onClick={pickPath}
                  disabled={operationBusy}
                  size="small"
                >
                  选择文件
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<CheckCircleIcon />}
                  onClick={() => applyPathAndLoad()}
                  disabled={operationBusy}
                  size="small"
                >
                  应用路径并加载
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Paper>

        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={5}>
            <Paper className="panel" sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack spacing={2} divider={<Divider flexItem orientation="horizontal" />}>
                <Box>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    数据库配置列表
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    点击行可编辑，支持新增 / 覆盖保存 / 删除。
                  </Typography>
                </Box>

                <Stack spacing={1.25}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.25}>
                    <TextField
                      label="搜索（名称/类型）"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      size="small"
                      fullWidth
                      disabled={operationBusy}
                    />
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <InputLabel id="filter-db-type-label">类型筛选</InputLabel>
                      <Select
                        labelId="filter-db-type-label"
                        label="类型筛选"
                        value={filterDbType}
                        onChange={(e) => setFilterDbType(e.target.value)}
                        disabled={operationBusy}
                      >
                        <MenuItem value="ALL">全部类型</MenuItem>
                        {dbTypeOptions.map((dbType) => (
                          <MenuItem key={dbType} value={dbType}>
                            {dbType}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <InputLabel id="filter-default-label">默认筛选</InputLabel>
                      <Select
                        labelId="filter-default-label"
                        label="默认筛选"
                        value={filterDefault}
                        onChange={(e) =>
                          setFilterDefault(e.target.value as "ALL" | "DEFAULT_ONLY" | "NON_DEFAULT")
                        }
                        disabled={operationBusy}
                      >
                        <MenuItem value="ALL">全部</MenuItem>
                        <MenuItem value="DEFAULT_ONLY">仅默认</MenuItem>
                        <MenuItem value="NON_DEFAULT">仅非默认</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>

                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", md: "center" }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      当前显示 {filteredDatabases.length} / {config?.databases.length ?? 0} 条
                      {batchTesting ? ` · 进度 ${batchProgress.done}/${batchProgress.total}` : ""}
                    </Typography>
                    <Button
                      variant="outlined"
                      color="info"
                      startIcon={<CheckCircleIcon />}
                      size="small"
                      onClick={runBatchTestConnections}
                      disabled={operationBusy || filteredDatabases.length === 0}
                    >
                      {batchTesting ? "批量测试中..." : "批量测试当前筛选"}
                    </Button>
                  </Stack>
                </Stack>

                {batchSummary ? (
                  <Alert severity={batchSummary.failed > 0 ? "warning" : "success"} variant="outlined">
                    <Typography variant="body2">
                      批量测试完成：总计 {batchSummary.total}，成功 {batchSummary.success}，失败{" "}
                      {batchSummary.failed}，跳过 {batchSummary.skipped}
                    </Typography>
                  </Alert>
                ) : null}

                <Stack spacing={1}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 130 }}>
                      <InputLabel id="import-mode-label">导入模式</InputLabel>
                      <Select
                        labelId="import-mode-label"
                        label="导入模式"
                        value={importMode}
                        onChange={(e) => setImportMode(e.target.value as ImportMode)}
                        disabled={operationBusy}
                      >
                        <MenuItem value="merge">合并（按名称 upsert）</MenuItem>
                        <MenuItem value="replace">覆盖（替换全部）</MenuItem>
                      </Select>
                    </FormControl>
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      onClick={importDatabaseEntries}
                      disabled={operationBusy}
                    >
                      {importing ? "导入中..." : "导入 JSON"}
                    </Button>
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      onClick={exportFilteredEntries}
                      disabled={operationBusy || filteredDatabases.length === 0}
                    >
                      {exporting ? "导出中..." : "导出当前筛选"}
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => refreshSnapshots(false)}
                      disabled={operationBusy || !dbPath.trim()}
                    >
                      刷新快照
                    </Button>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    导入支持合并/覆盖；导出仅导出当前筛选结果。
                  </Typography>
                </Stack>

                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" fontWeight={600}>
                      配置快照（最近 5 次）
                    </Typography>
                    {loadingSnapshots ? (
                      <Typography variant="caption" color="text.secondary">
                        读取中...
                      </Typography>
                    ) : null}
                  </Stack>

                  {!dbPath.trim() ? (
                    <Typography variant="caption" color="text.secondary">
                      设置配置路径后可查看快照。
                    </Typography>
                  ) : loadingSnapshots ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : snapshots.length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      暂无快照。保存、删除、导入或回滚前会自动创建快照。
                    </Typography>
                  ) : (
                    <Stack spacing={0.75} sx={{ maxHeight: 180, overflowY: "auto", pr: 0.5 }}>
                      {snapshots.map((snapshot) => (
                        <Box
                          key={snapshot.fullPath}
                          sx={(theme) => ({
                            borderRadius: 1.4,
                            px: 1.2,
                            py: 0.9,
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
                            backgroundColor: alpha(theme.palette.primary.main, 0.04),
                          })}
                        >
                          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                variant="caption"
                                sx={{
                                  display: "block",
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                }}
                                title={snapshot.fileName}
                              >
                                {snapshot.fileName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatSnapshotTime(snapshot.createdAt)} · {formatSnapshotSize(snapshot.size)}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.5}>
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => viewSnapshotDiff(snapshot)}
                                disabled={operationBusy}
                              >
                                {diffingSnapshot === snapshot.fullPath ? "比对中..." : "查看差异"}
                              </Button>
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => restoreFromSnapshot(snapshot)}
                                disabled={operationBusy}
                              >
                                恢复
                              </Button>
                            </Stack>
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Stack>

                {loading ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                    <CircularProgress />
                  </Box>
                ) : config && config.databases.length > 0 && filteredDatabases.length > 0 ? (
                  <Table size="small" stickyHeader className="config-table">
                    <TableHead>
                      <TableRow>
                        <TableCell>名称</TableCell>
                        <TableCell>类型</TableCell>
                        <TableCell>默认</TableCell>
                        <TableCell align="right">操作</TableCell>
                        <TableCell align="right">测试连接</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredDatabases.map((db) => (
                        <TableRow
                          key={db.name}
                          hover
                          selected={db.name === selectedName}
                          onClick={() => handleSelectEntry(db.name)}
                          sx={(theme) => ({
                            cursor: "pointer",
                            transition: "background-color 140ms ease",
                            "&:hover": {
                              backgroundColor: alpha(theme.palette.primary.main, 0.08),
                            },
                            "&.Mui-selected": {
                              backgroundColor: alpha(
                                theme.palette.primary.main,
                                theme.palette.mode === "dark" ? 0.22 : 0.12,
                              ),
                            },
                            "&.Mui-selected:hover": {
                              backgroundColor: alpha(
                                theme.palette.primary.main,
                                theme.palette.mode === "dark" ? 0.28 : 0.16,
                              ),
                            },
                          })}
                        >
                          <TableCell>{db.name}</TableCell>
                          <TableCell>{db.dbType}</TableCell>
                          <TableCell>
                            {db.isDefault ? <Chip label="默认" size="small" color="primary" /> : "-"}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              color="error"
                              startIcon={<DeleteIcon />}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteEntry(db.name);
                              }}
                              variant="text"
                              disabled={operationBusy}
                            >
                              删除
                            </Button>
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              color="info"
                              startIcon={<CheckCircleIcon />}
                              onClick={(e) => {
                                e.stopPropagation();
                                void testConnection(db);
                              }}
                              variant="text"
                              disabled={operationBusy || !db.connectionString.trim()}
                            >
                              {testingName === db.name ? "测试中..." : "测试连接"}
                            </Button>
                            {rowTestResults[db.name] ? (
                              <Typography
                                variant="caption"
                                sx={{
                                  display: "block",
                                  mt: 0.25,
                                  color: rowTestResults[db.name].ok ? "success.main" : "error.main",
                                }}
                              >
                                {rowTestResults[db.name].ok ? "成功" : "失败"}
                                {rowTestResults[db.name].latencyMs > 0
                                  ? ` · ${rowTestResults[db.name].latencyMs} ms`
                                  : ""}
                              </Typography>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : config && config.databases.length > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    未命中筛选结果，请调整搜索或筛选条件。
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    暂无配置，点击“新建/重置”开始。
                  </Typography>
                )}
                <Button
                  variant="text"
                  startIcon={<AddIcon />}
                  onClick={resetTemplate}
                  sx={{ alignSelf: "flex-start" }}
                  size="small"
                  disabled={operationBusy}
                >
                  新建配置
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Paper className="panel" sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack spacing={2} divider={<Divider flexItem orientation="horizontal" />}>
                <Box>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    配置详情
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    保存时将按名称 upsert；删除按名称删除；optimizationSettings 以 JSON 文本填写，适配不同数据库。
                  </Typography>
                </Box>

                <Stack spacing={2}>
                  <TextField
                    label="名称"
                    value={entry.name}
                    onChange={(e) => handleTextChange("name", e.target.value)}
                    fullWidth
                    required
                    size="small"
                  />

                  <FormControl fullWidth size="small">
                    <InputLabel id="db-type-label">数据库类型</InputLabel>
                    <Select
                      labelId="db-type-label"
                      label="数据库类型"
                      value={entry.dbType}
                      onChange={(e) => handleDbTypeChange(e.target.value)}
                    >
                      <MenuItem value="PostgreSQL">PostgreSQL</MenuItem>
                      <MenuItem value="MySql">MySql</MenuItem>
                      <MenuItem value="SqlServer">SqlServer</MenuItem>
                      <MenuItem value="Oracle">Oracle</MenuItem>
                      <MenuItem value="Sqlite">Sqlite</MenuItem>
                      <MenuItem value="MongoDb">MongoDb</MenuItem>
                      <MenuItem value="ClickHouse">ClickHouse</MenuItem>
                      <MenuItem value="Tidb">Tidb</MenuItem>
                      <MenuItem value="OceanBase">OceanBase</MenuItem>
                      <MenuItem value="OceanBaseForOracle">OceanBaseForOracle</MenuItem>
                      <MenuItem value="Dm">Dm</MenuItem>
                      <MenuItem value="Kdbndp">Kdbndp</MenuItem>
                      <MenuItem value="GaussDBNative">GaussDBNative</MenuItem>
                      <MenuItem value="OpenGauss">OpenGauss</MenuItem>
                      <MenuItem value="PolarDB">PolarDB</MenuItem>
                      <MenuItem value="Vastbase">Vastbase</MenuItem>
                      <MenuItem value="HG">HG</MenuItem>
                      <MenuItem value="GoldenDB">GoldenDB</MenuItem>
                      <MenuItem value="GBase">GBase</MenuItem>
                      <MenuItem value="Doris">Doris</MenuItem>
                      <MenuItem value="TDengine">TDengine</MenuItem>
                      <MenuItem value="DuckDB">DuckDB</MenuItem>
                      <MenuItem value="QuestDB">QuestDB</MenuItem>
                      <MenuItem value="Oscar">Oscar</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    label="连接字符串"
                    value={entry.connectionString}
                    onChange={(e) => handleTextChange("connectionString", e.target.value)}
                    minRows={3}
                    multiline
                    fullWidth
                    required
                    placeholder="Host=...;User ID=...;Password=..."
                    size="small"
                  />

                  <TextField
                    label="描述"
                    value={entry.description ?? ""}
                    onChange={(e) => handleTextChange("description", e.target.value)}
                    fullWidth
                    placeholder="用于人类可读说明"
                    size="small"
                  />

                  <FormControlLabel
                    control={
                      <Switch
                        color="primary"
                        checked={Boolean(entry.isDefault)}
                        onChange={(e) => handleTextChange("isDefault", e.target.checked)}
                      />
                    }
                    label="是否默认"
                  />

                  <TextField
                    label="optimizationSettings (JSON)"
                    value={optText}
                    onChange={(e) => setOptText(e.target.value)}
                    minRows={6}
                    multiline
                    fullWidth
                    placeholder='请输入 optimizationSettings 的 JSON'
                    size="small"
                  />
                  {optText.trim() && optimization === undefined ? (
                    <Typography variant="caption" color="error">
                      JSON 无法解析，请检查格式。
                    </Typography>
                  ) : null}

                  {validationResult && !validationResult.valid ? (
                    <Alert severity="error" variant="outlined" sx={{ alignItems: "flex-start" }}>
                      <Typography variant="body2" fontWeight={700}>
                        {validationResult.message}
                      </Typography>
                      {validationResult.detail ? (
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            mt: 0.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {validationResult.detail}
                        </Typography>
                      ) : null}
                    </Alert>
                  ) : null}

                  {testResult ? (
                    <Alert
                      severity={testResult.ok ? "success" : "error"}
                      variant="outlined"
                      sx={{ alignItems: "flex-start" }}
                    >
                      <Typography variant="body2" fontWeight={700}>
                        {testResult.message}
                        {testResult.latencyMs > 0 ? `（${testResult.latencyMs} ms）` : ""}
                      </Typography>
                      {testResult.detail ? (
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            mt: 0.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {testResult.detail}
                        </Typography>
                      ) : null}
                    </Alert>
                  ) : null}
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Container maxWidth="xl" className="enter-fade" sx={{ pb: 3.5 }}>
        <Paper className="panel preview-panel" sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={700}>
              当前文件 JSON 预览
            </Typography>
            <Typography variant="body2" color="text.secondary">
              只读显示当前加载的完整内容，便于校验写入结果。
            </Typography>
            <Box
              sx={{
                maxHeight: 320,
                overflow: "auto",
                borderRadius: 2.5,
                border: (theme) => `1px solid ${alpha(theme.palette.primary.main, 0.24)}`,
                backgroundColor: (theme) =>
                  theme.palette.mode === "dark" ? alpha("#020617", 0.84) : "#0b1324",
                color: "#e2e8f0",
                fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, ui-monospace, monospace',
                fontSize: 13,
                lineHeight: 1.5,
                p: 2.2,
                whiteSpace: "pre",
              }}
              className="json-preview"
            >
              {configPreview || "尚未加载配置"}
            </Box>
          </Stack>
        </Paper>
      </Container>
      <Dialog
        open={diffDialogOpen}
        onClose={() => setDiffDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          快照差异预览
          {diffSnapshotName ? ` · ${diffSnapshotName}` : ""}
        </DialogTitle>
        <DialogContent dividers>
          {snapshotDiff ? (
            <Stack spacing={1.5}>
              <Alert
                severity={
                  snapshotDiff.summary.addedCount +
                    snapshotDiff.summary.removedCount +
                    snapshotDiff.summary.changedCount >
                  0
                    ? "warning"
                    : "success"
                }
                variant="outlined"
              >
                <Typography variant="body2">
                  差异统计：新增 {snapshotDiff.summary.addedCount}，删除{" "}
                  {snapshotDiff.summary.removedCount}，修改 {snapshotDiff.summary.changedCount}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  口径说明：当前配置应用该快照后，将新增/删除/修改以上条目。
                </Typography>
              </Alert>

              {snapshotDiff.summary.addedCount === 0 &&
              snapshotDiff.summary.removedCount === 0 &&
              snapshotDiff.summary.changedCount === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  该快照与当前配置一致，无需回滚。
                </Typography>
              ) : null}

              {snapshotDiff.added.length > 0 ? (
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    将新增（快照有，当前无）
                  </Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {snapshotDiff.added.map((name) => (
                      <Chip key={`added-${name}`} size="small" color="success" variant="outlined" label={name} />
                    ))}
                  </Stack>
                </Box>
              ) : null}

              {snapshotDiff.removed.length > 0 ? (
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    将删除（当前有，快照无）
                  </Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {snapshotDiff.removed.map((name) => (
                      <Chip key={`removed-${name}`} size="small" color="error" variant="outlined" label={name} />
                    ))}
                  </Stack>
                </Box>
              ) : null}

              {snapshotDiff.changed.length > 0 ? (
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    将修改（同名条目字段变化）
                  </Typography>
                  <Stack spacing={1}>{snapshotDiff.changed.map((entryChange) => renderChangedEntry(entryChange))}</Stack>
                </Box>
              ) : null}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              暂无差异数据。
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiffDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
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
