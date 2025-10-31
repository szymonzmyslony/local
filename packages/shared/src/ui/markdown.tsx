import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../utils/cn";

export interface MarkdownProps extends ComponentProps<typeof ReactMarkdown> {
  className?: string;
}

export function Markdown({ className, ...props }: MarkdownProps) {
  return (
    <div className={cn("prose prose-sm prose-slate max-w-none dark:prose-invert", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} {...props} />
    </div>
  );
}
