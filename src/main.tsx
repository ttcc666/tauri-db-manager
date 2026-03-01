import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme, responsiveFontSizes } from "@mui/material";
import { alpha } from "@mui/material/styles";
import App from "./App";

type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "database-json-manager:theme-mode";
const THEME_QUERY = "(prefers-color-scheme: dark)";

const readStoredThemeMode = (): ThemeMode => {
  const fallback: ThemeMode = "system";
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }
  return fallback;
};

const resolveMode = (mode: ThemeMode): "light" | "dark" => {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window !== "undefined" && window.matchMedia(THEME_QUERY).matches) {
    return "dark";
  }
  return "light";
};

const buildTheme = (mode: "light" | "dark") => {
  const isDark = mode === "dark";
  const palette = {
    primary: isDark ? "#38bdf8" : "#0284c7",
    secondary: isDark ? "#fb923c" : "#ea580c",
    success: isDark ? "#4ade80" : "#16a34a",
    error: isDark ? "#f87171" : "#dc2626",
    warning: isDark ? "#fbbf24" : "#d97706",
    info: isDark ? "#60a5fa" : "#2563eb",
    background: {
      default: isDark ? "#0b1220" : "#edf3fb",
      paper: isDark ? "#111b2d" : "#ffffff",
    },
    text: {
      primary: isDark ? "#e2e8f0" : "#0f172a",
      secondary: isDark ? "#94a3b8" : "#475569",
    },
  };

  const baseTheme = createTheme({
    palette: {
      mode,
      primary: { main: palette.primary },
      secondary: { main: palette.secondary },
      success: { main: palette.success },
      error: { main: palette.error },
      warning: { main: palette.warning },
      info: { main: palette.info },
      background: palette.background,
      text: palette.text,
      divider: isDark ? alpha("#e2e8f0", 0.14) : alpha("#0f172a", 0.1),
    },
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily: "Manrope, 'Segoe UI', 'Helvetica Neue', system-ui, -apple-system, sans-serif",
      fontWeightBold: 700,
      button: {
        textTransform: "none",
        fontWeight: 600,
        letterSpacing: 0.2,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            colorScheme: mode,
          },
          "::selection": {
            backgroundColor: alpha(palette.primary, 0.3),
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            border: `1px solid ${isDark ? alpha("#cbd5e1", 0.12) : alpha("#0f172a", 0.08)}`,
            backgroundImage: "none",
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${isDark ? alpha("#cbd5e1", 0.16) : alpha("#0f172a", 0.08)}`,
            backgroundImage: "none",
            boxShadow: "none",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            paddingInline: 14,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${isDark ? alpha("#e2e8f0", 0.1) : alpha("#0f172a", 0.08)}`,
          },
          head: {
            fontWeight: 700,
          },
        },
      },
    },
  });

  return responsiveFontSizes(baseTheme);
};

function ThemeRoot() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const [systemMode, setSystemMode] = useState<"light" | "dark">(() => resolveMode("system"));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(THEME_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemMode(event.matches ? "dark" : "light");
    };
    setSystemMode(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const effectiveMode = themeMode === "system" ? systemMode : themeMode;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.setAttribute("data-theme", effectiveMode);
  }, [effectiveMode]);

  const theme = useMemo(() => buildTheme(effectiveMode), [effectiveMode]);

  const handleToggleTheme = () => {
    setThemeMode((prev) => {
      if (prev === "system") return systemMode === "dark" ? "light" : "dark";
      return prev === "dark" ? "light" : "dark";
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App
        themeMode={themeMode}
        effectiveMode={effectiveMode}
        onToggleTheme={handleToggleTheme}
        onUseSystemTheme={() => setThemeMode("system")}
      />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeRoot />
  </React.StrictMode>,
);

