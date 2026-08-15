import type { Execution } from "@e2b/code-interpreter";

// E2B puts a cell's printed output in logs.stdout / logs.stderr; execution.text
// is only the repr of the last expression (empty for print-only code). Combine
// them so tool/setup output is actually returned to the caller.
export const renderExecution = (execution: Execution): string => {
  const stdout = execution.logs?.stdout?.join("") ?? "";
  const stderr = execution.logs?.stderr?.join("") ?? "";
  const text = execution.text ?? "";
  const err = execution.error
    ? `EXECUTION ERROR: ${execution.error.name}: ${execution.error.value}\n${execution.error.traceback ?? ""}`
    : "";
  return [stdout, stderr, text, err]
    .filter((s) => s.trim().length > 0)
    .join("\n");
};
