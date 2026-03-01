import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import Button from "@mui/material/Button";
import Grid from "@mui/material/GridLegacy";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

type PathPanelProps = {
  dbPath: string;
  operationBusy: boolean;
  onApplyPath: () => void;
  onPathChange: (value: string) => void;
  onPickPath: () => void;
};

export function PathPanel({
  dbPath,
  operationBusy,
  onApplyPath,
  onPathChange,
  onPickPath,
}: PathPanelProps) {
  return (
    <Paper className="panel path-panel" sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={8}>
          <TextField
            label="配置文件路径"
            value={dbPath}
            onChange={(e) => onPathChange(e.target.value)}
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
              onClick={onPickPath}
              disabled={operationBusy}
              size="small"
            >
              选择文件
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<CheckCircleIcon />}
              onClick={onApplyPath}
              disabled={operationBusy}
              size="small"
            >
              应用路径并加载
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </Paper>
  );
}
