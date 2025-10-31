import type { ToolUIPart } from "ai";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@shared/ui";

type ToolStatus = "waiting" | "running" | "completed" | "error";

interface ToolResultCardProps {
  part: ToolUIPart;
}

function getStatus(part: ToolUIPart): ToolStatus {
  if (part.state === "input-streaming") return "running";
  if (part.state === "input-available") return "waiting";
  if (part.state === "output-available") return part.errorText ? "error" : "completed";
  return "completed";
}

function StatusBadge({ status }: { status: ToolStatus }) {
  switch (status) {
    case "waiting":
      return <Badge variant="secondary" className="bg-amber-100 text-amber-700">Awaiting confirmation</Badge>;
    case "running":
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700">Running</Badge>;
    case "completed":
      return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Completed</Badge>;
    case "error":
      return <Badge variant="secondary" className="bg-red-100 text-red-700">Error</Badge>;
    default:
      return null;
  }
}

function formatArgs(args: unknown): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch (_error) {
    return String(args);
  }
}

function formatOutput(output: unknown): string {
  try {
    return JSON.stringify(output, null, 2);
  } catch (_error) {
    return String(output);
  }
}

export function ToolResultCard({ part }: ToolResultCardProps) {
  const status = getStatus(part);

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-col items-start gap-2 border-b border-slate-100">
        <CardTitle className="text-sm font-medium text-slate-700">{part.type.replace("tool-", "")}</CardTitle>
        <StatusBadge status={status} />
      </CardHeader>
      <CardBody className="space-y-4">
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Arguments</h4>
          <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-700">
            {formatArgs(part.input)}
          </pre>
        </section>

        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</h4>
          {status === "running" || status === "waiting" ? (
            <p className="text-sm text-slate-500">Waiting for result…</p>
          ) : (
            <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              {formatOutput(part.output ?? part.errorText ?? "")}
            </pre>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
