import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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
  FormControl,
  FormControlLabel,
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
  Toolbar,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { DatabaseEntry, DatabaseFile, OptimizationSettings } from "./types";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import "./App.css";

type Notice = {
  severity: "success" | "error" | "info";
  text: string;
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

function App() {
  const [config, setConfig] = useState<DatabaseFile | null>(null);
  const [entry, setEntry] = useState<DatabaseEntry>(emptyEntry());
  const [dbPath, setDbPath] = useState<string>("");
  const [optText, setOptText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");

  const optimization = useMemo(() => {
    try {
      return optText.trim() ? (JSON.parse(optText) as OptimizationSettings) : undefined;
    } catch {
      return undefined;
    }
  }, [optText]);

  const refreshFromData = (data: DatabaseFile, nextSelect?: string) => {
    setConfig(data);
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
    setOptText(found.optimizationSettings ? JSON.stringify(found.optimizationSettings, null, 2) : "");
  };

  const configPreview = useMemo(
    () => (config ? JSON.stringify(config, null, 2) : ""),
    [config],
  );

  const fetchPath = async () => {
    const path = await invoke<string>("get_database_path");
    setDbPath(path);
    return path;
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


  const handleTextChange = (field: keyof DatabaseEntry, value: string | boolean) => {
    setEntry((prev) => ({ ...prev, [field]: value } as DatabaseEntry));
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
  };

  const resetTemplate = () => {
    setEntry(emptyEntry());
    setSelectedName("");
    setOptText("");
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
    setSaving(true);
    try {
      let opt: OptimizationSettings | undefined;
      if (optText.trim()) {
        opt = JSON.parse(optText);
      }
      const payload: DatabaseEntry = { ...entry, optimizationSettings: opt };
      const updated = await invoke<DatabaseFile>("upsert_database_entry", { entry: payload });
      refreshFromData(updated, payload.name);
      setNotice({ severity: "success", text: "保存成功" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNotice({ severity: "error", text: `保存失败: ${message}` });
    } finally {
      setSaving(false);
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
  };

  return (
    <Box className="app-shell">
      <AppBar position="sticky" color="primary" elevation={0} enableColorOnDark>
        <Toolbar sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h6" component="div" fontWeight={700} letterSpacing={0.4}>
              Database.json 管理台
            </Typography>
            <Chip label="Tauri + React" color="secondary" size="small" variant="filled" />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<RefreshIcon />}
              onClick={() => loadConfig()}
              disabled={loading || saving || !dbPath.trim()}
            >
              重新加载
            </Button>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<RestartAltIcon />}
              onClick={resetTemplate}
              disabled={saving}
            >
              新建/重置
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SaveRoundedIcon />}
              onClick={saveEntry}
              disabled={saving || loading || !dbPath.trim()}
            >
              {saving ? "保存中..." : "保存"}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper elevation={4} sx={{ p: 2.5, mb: 3, borderRadius: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <TextField
                label="配置文件路径"
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
                fullWidth
                helperText="输入或粘贴 JSON 路径（可相对/绝对），应用后立即读取"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<FolderOpenIcon />}
                  onClick={pickPath}
                  disabled={loading || saving}
                >
                  选择文件
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<CheckCircleIcon />}
                  onClick={() => applyPathAndLoad()}
                  disabled={loading || saving}
                >
                  应用路径并加载
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Paper>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper elevation={6} sx={{ p: 3, borderRadius: 3 }}>
              <Stack spacing={2} divider={<Divider flexItem orientation="horizontal" />}>
                <Box>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    数据库配置列表
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    点击行可编辑，支持新增 / 覆盖保存 / 删除。
                  </Typography>
                </Box>
                {loading ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                    <CircularProgress />
                  </Box>
                ) : config && config.databases.length > 0 ? (
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>名称</TableCell>
                        <TableCell>类型</TableCell>
                        <TableCell>默认</TableCell>
                        <TableCell align="right">操作</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {config.databases.map((db) => (
                        <TableRow
                          key={db.name}
                          hover
                          selected={db.name === selectedName}
                          onClick={() => handleSelectEntry(db.name)}
                          sx={{ cursor: "pointer" }}
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
                            >
                              删除
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                >
                  新建配置
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper elevation={6} sx={{ p: 3, borderRadius: 3 }}>
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
                  />

                  <FormControl fullWidth>
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
                  />

                  <TextField
                    label="描述"
                    value={entry.description ?? ""}
                    onChange={(e) => handleTextChange("description", e.target.value)}
                    fullWidth
                    placeholder="用于人类可读说明"
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
                  />
                  {optText.trim() && optimization === undefined ? (
                    <Typography variant="caption" color="error">
                      JSON 无法解析，请检查格式。
                    </Typography>
                  ) : null}
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Paper elevation={4} sx={{ p: 2.5, borderRadius: 3 }}>
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
                borderRadius: 2,
                backgroundColor: "#0f172a",
                color: "#e2e8f0",
                fontFamily: '"SFMono-Regular", Consolas, ui-monospace, monospace',
                fontSize: 13,
                p: 2,
                whiteSpace: "pre",
              }}
            >
              {configPreview || "尚未加载配置"}
            </Box>
          </Stack>
        </Paper>
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
