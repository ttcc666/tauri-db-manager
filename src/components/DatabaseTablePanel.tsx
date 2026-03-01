import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import {
  BatchTestSummary,
  ConnectionTestResult,
  DatabaseEntry,
  DatabaseFile,
  FilterDefault,
  ImportMode,
} from "../types";

type DatabaseTablePanelProps = {
  batchProgress: { done: number; total: number };
  batchSummary: BatchTestSummary | null;
  batchTesting: boolean;
  config: DatabaseFile | null;
  dbTypeOptions: string[];
  exportDisabled: boolean;
  exporting: boolean;
  filterDbType: string;
  filterDefault: FilterDefault;
  filteredDatabases: DatabaseEntry[];
  importMode: ImportMode;
  importing: boolean;
  loading: boolean;
  operationBusy: boolean;
  rowTestResults: Record<string, ConnectionTestResult>;
  searchKeyword: string;
  selectedName: string;
  testingName: string;
  onDeleteEntry: (name: string) => void;
  onExportEntries: () => void;
  onFilterDbTypeChange: (value: string) => void;
  onFilterDefaultChange: (value: FilterDefault) => void;
  onImportEntries: () => void;
  onImportModeChange: (value: ImportMode) => void;
  onResetTemplate: () => void;
  onRunBatchTestConnections: () => void;
  onSearchKeywordChange: (value: string) => void;
  onSelectEntry: (name: string) => void;
  onTestConnection: (entry: DatabaseEntry) => void;
  resolveTestDisabledReason: (entry: DatabaseEntry) => string;
};

export function DatabaseTablePanel({
  batchProgress,
  batchSummary,
  batchTesting,
  config,
  dbTypeOptions,
  exportDisabled,
  exporting,
  filterDbType,
  filterDefault,
  filteredDatabases,
  importMode,
  importing,
  loading,
  operationBusy,
  rowTestResults,
  searchKeyword,
  selectedName,
  testingName,
  onDeleteEntry,
  onExportEntries,
  onFilterDbTypeChange,
  onFilterDefaultChange,
  onImportEntries,
  onImportModeChange,
  onResetTemplate,
  onRunBatchTestConnections,
  onSearchKeywordChange,
  onSelectEntry,
  onTestConnection,
  resolveTestDisabledReason,
}: DatabaseTablePanelProps) {
  return (
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
              onChange={(e) => onSearchKeywordChange(e.target.value)}
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
                onChange={(e) => onFilterDbTypeChange(e.target.value)}
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
                onChange={(e) => onFilterDefaultChange(e.target.value as FilterDefault)}
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
              onClick={onRunBatchTestConnections}
              disabled={operationBusy || filteredDatabases.length === 0}
            >
              {batchTesting ? "批量测试中..." : "批量测试当前筛选"}
            </Button>
          </Stack>
        </Stack>

        {batchSummary ? (
          <Alert severity={batchSummary.failed > 0 ? "warning" : "success"} variant="outlined">
            <Typography variant="body2">
              批量测试完成：总计 {batchSummary.total}，成功 {batchSummary.success}，失败 {batchSummary.failed}
              ，跳过 {batchSummary.skipped}
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
                onChange={(e) => onImportModeChange(e.target.value as ImportMode)}
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
              onClick={onImportEntries}
              disabled={operationBusy}
            >
              {importing ? "导入中..." : "导入 JSON"}
            </Button>
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={onExportEntries}
              disabled={operationBusy || exportDisabled}
            >
              {exporting ? "导出中..." : "导出当前筛选"}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            导入支持合并/覆盖；导出仅导出当前筛选结果。
          </Typography>
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
              {filteredDatabases.map((db) => {
                const testDisabledReason = resolveTestDisabledReason(db);

                return (
                  <TableRow
                    key={db.name}
                    hover
                    selected={db.name === selectedName}
                    onClick={() => onSelectEntry(db.name)}
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
                    <TableCell>{db.isDefault ? <Chip label="默认" size="small" color="primary" /> : "-"}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEntry(db.name);
                        }}
                        variant="text"
                        disabled={operationBusy}
                      >
                        删除
                      </Button>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={testDisabledReason} disableHoverListener={!testDisabledReason}>
                        <span>
                          <Button
                            size="small"
                            color="info"
                            startIcon={<CheckCircleIcon />}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTestConnection(db);
                            }}
                            variant="text"
                            disabled={operationBusy || Boolean(testDisabledReason)}
                          >
                            {testingName === db.name ? "测试中..." : "测试连接"}
                          </Button>
                        </span>
                      </Tooltip>
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
                );
              })}
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
          onClick={onResetTemplate}
          sx={{ alignSelf: "flex-start" }}
          size="small"
          disabled={operationBusy}
        >
          新建配置
        </Button>
      </Stack>
    </Paper>
  );
}
