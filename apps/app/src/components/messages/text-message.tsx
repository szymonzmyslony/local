import { Markdown } from "@shared/ui";

interface TextMessageProps {
  text: string;
  timestamp: string;
  isUser: boolean;
}

export function TextMessage({ text, timestamp, isUser }: TextMessageProps) {
  const textLength = text?.length ?? 0;
  const isShortMessage = textLength <= 16;
  const borderRadius = isShortMessage ? "rounded-full" : "rounded-[16px]";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[98%]">
        <div
          className={`${borderRadius} px-3 py-2 ${
            isUser
              ? "bg-[#D8D3FA] text-slate-900"
              : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          }`}
        >
          <Markdown className="text-xs">{text}</Markdown>
          <p
            className={`mt-1 text-[10px] ${
              isUser
                ? "text-slate-600"
                : "text-slate-400 dark:text-slate-400"
            }`}
          >
            {timestamp}
          </p>
        </div>
      </div>
    </div>
  );
}
