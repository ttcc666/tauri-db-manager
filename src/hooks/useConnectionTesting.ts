import React from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BatchTestSummary,
  ConnectionTestResult,
  DatabaseEntry,
  Notice,
} from "../types";

type PerformConnectionTestOptions = {
  showNotice?: boolean;
  syncDetailPanel?: boolean;
};

export function useConnectionTesting(setNotice: (notice: Notice) => void) {
  const [testing, setTesting] = React.useState(false);
  const [testingName, setTestingName] = React.useState<string>("");
  const [batchTesting, setBatchTesting] = React.useState(false);
  const [batchProgress, setBatchProgress] = React.useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [batchSummary, setBatchSummary] = React.useState<BatchTestSummary | null>(null);
  const [rowTestResults, setRowTestResults] = React.useState<Record<string, ConnectionTestResult>>({});
  const [testResult, setTestResult] = React.useState<ConnectionTestResult | null>(null);

  const clearAllTestingState = React.useCallback(() => {
    setRowTestResults({});
    setBatchSummary(null);
    setBatchProgress({ done: 0, total: 0 });
    setTestingName("");
    setTesting(false);
    setBatchTesting(false);
    setTestResult(null);
  }, []);

  const clearDetailResult = React.useCallback(() => {
    setTestResult(null);
  }, []);

  const clearBatchStatus = React.useCallback(() => {
    setBatchSummary(null);
    setBatchProgress({ done: 0, total: 0 });
  }, []);

  const performConnectionTest = React.useCallback(
    async (
      candidate: DatabaseEntry,
      options?: PerformConnectionTestOptions,
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
    },
    [setNotice],
  );

  const testConnection = React.useCallback(
    async (candidate: DatabaseEntry, selectedName: string, syncDetailPanel: boolean) => {
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
      if (syncDetailPanel || selectedName === candidate.name) {
        setTestResult(null);
      }

      try {
        await performConnectionTest(candidate, {
          showNotice: true,
          syncDetailPanel: syncDetailPanel || selectedName === candidate.name,
        });
      } finally {
        setTesting(false);
        setTestingName("");
      }
    },
    [performConnectionTest, setNotice],
  );

  const runBatchTestConnections = React.useCallback(
    async (
      entries: DatabaseEntry[],
      selectedName: string,
      canTestDbType: (dbType: string) => boolean,
      getUnsupportedReason: (dbType: string) => string,
    ) => {
      if (entries.length === 0) {
        setNotice({ severity: "info", text: "当前筛选结果为空，无可测试项" });
        return;
      }

      const total = entries.length;
      let success = 0;
      let failed = 0;
      let skipped = 0;

      setBatchTesting(true);
      setBatchSummary(null);
      setBatchProgress({ done: 0, total });

      try {
        for (let index = 0; index < entries.length; index += 1) {
          const candidate = entries[index];
          setTestingName(candidate.name || candidate.dbType);

          if (!canTestDbType(candidate.dbType)) {
            skipped += 1;
            const unsupportedResult: ConnectionTestResult = {
              ok: false,
              dbType: candidate.dbType,
              latencyMs: 0,
              message: "当前数据库类型暂不支持测试连接",
              detail: getUnsupportedReason(candidate.dbType),
            };
            if (candidate.name.trim()) {
              setRowTestResults((prev) => ({ ...prev, [candidate.name]: unsupportedResult }));
            }
            setBatchProgress({ done: index + 1, total });
            continue;
          }

          if (!candidate.connectionString.trim()) {
            skipped += 1;
            const skippedResult: ConnectionTestResult = {
              ok: false,
              dbType: candidate.dbType,
              latencyMs: 0,
              message: "连接字符串为空，已跳过",
              detail: "该项未填写 connectionString，未执行测试",
            };
            if (candidate.name.trim()) {
              setRowTestResults((prev) => ({ ...prev, [candidate.name]: skippedResult }));
            }
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
    },
    [performConnectionTest, setNotice],
  );

  return {
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
  };
}
