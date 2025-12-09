import React from "react";
import ReactDOM from "react-dom/client";
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  responsiveFontSizes,
} from "@mui/material";
import App from "./App";

const baseTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#0ea5e9" },
    secondary: { main: "#f97316" },
    background: {
      default: "#e9eef5",
      paper: "#ffffff",
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: "Manrope, 'Segoe UI', 'Helvetica Neue', system-ui, -apple-system, sans-serif",
    fontWeightBold: 700,
  },
  components: {
    MuiPaper: {
      defaultProps: {
        elevation: 4,
      },
    },
  },
});

const theme = responsiveFontSizes(baseTheme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
