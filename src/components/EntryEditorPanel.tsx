import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { DbCatalogItem, ConnectionTestResult, DatabaseEntry, ValidationResult } from "../types";

type EntryEditorPanelProps = {
  dbCatalog: DbCatalogItem[];
  entry: DatabaseEntry;
  operationBusy: boolean;
  optimizationInvalid: boolean;
  optText: string;
  testButtonDisabledReason: string;
  testResult: ConnectionTestResult | null;
  testing: boolean;
  validationResult: ValidationResult | null;
  onDbTypeChange: (value: string) => void;
  onOptimizationTextChange: (value: string) => void;
  onTestConnection: () => void;
  onTextChange: (field: keyof DatabaseEntry, value: string | boolean) => void;
};

export function EntryEditorPanel({
  dbCatalog,
  entry,
  operationBusy,
  optimizationInvalid,
  optText,
  testButtonDisabledReason,
  testResult,
  testing,
  validationResult,
  onDbTypeChange,
  onOptimizationTextChange,
  onTestConnection,
  onTextChange,
}: EntryEditorPanelProps) {
  return (
    <Paper className="panel" sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack spacing={2} divider={<Divider flexItem orientation="horizontal" />}>
        <Box>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            配置详情
          </Typography>
          <Typography variant="body2" color="text.secondary">
            保存时按名称 upsert；optimizationSettings 以 JSON 文本填写。
          </Typography>
        </Box>

        <Stack spacing={2}>
          <TextField
            label="名称"
            value={entry.name}
            onChange={(e) => onTextChange("name", e.target.value)}
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
              onChange={(e) => onDbTypeChange(e.target.value)}
              disabled={operationBusy}
            >
              {dbCatalog.map((item) => (
                <MenuItem key={item.dbType} value={item.dbType}>
                  {item.dbType}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="连接字符串"
            value={entry.connectionString}
            onChange={(e) => onTextChange("connectionString", e.target.value)}
            minRows={3}
            multiline
            fullWidth
            required
            placeholder="Host=...;User ID=...;Password=..."
            size="small"
          />

          <Tooltip title={testButtonDisabledReason} disableHoverListener={!testButtonDisabledReason}>
            <span>
              <Button
                variant="outlined"
                color="info"
                size="small"
                startIcon={<CheckCircleIcon />}
                onClick={onTestConnection}
                disabled={operationBusy || Boolean(testButtonDisabledReason)}
              >
                {testing ? "测试中..." : "测试当前配置"}
              </Button>
            </span>
          </Tooltip>

          <TextField
            label="描述"
            value={entry.description ?? ""}
            onChange={(e) => onTextChange("description", e.target.value)}
            fullWidth
            placeholder="用于人类可读说明"
            size="small"
          />

          <FormControlLabel
            control={
              <Switch
                color="primary"
                checked={Boolean(entry.isDefault)}
                onChange={(e) => onTextChange("isDefault", e.target.checked)}
              />
            }
            label="是否默认"
          />

          <TextField
            label="optimizationSettings (JSON)"
            value={optText}
            onChange={(e) => onOptimizationTextChange(e.target.value)}
            minRows={6}
            multiline
            fullWidth
            placeholder='请输入 optimizationSettings 的 JSON'
            size="small"
          />

          {optText.trim() && optimizationInvalid ? (
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
  );
}
