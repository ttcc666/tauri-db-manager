import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

type JsonPreviewPanelProps = {
  configPreview: string;
};

export function JsonPreviewPanel({ configPreview }: JsonPreviewPanelProps) {
  return (
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
  );
}
