import { Markdown } from "@shared/ui";

interface TextMessageProps {
  text: string;
  timestamp: string;
  isUser: boolean;
}

export function TextMessage({ text, timestamp, isUser }: TextMessageProps) {
  const textLength = text?.length ?? 0;
  const isShortMessage = textLength <= 16;
  const borderRadius = isShortMessage ? "rounded-lg" : "rounded-lg";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[92%] md:max-w-[82%]">
        <div
          className={`${borderRadius} px-4 py-3 ${
            isUser
              ? "bg-[#0140B6] text-white"
              : "border border-[#0140B6]/25 bg-[#F1F5FF] text-[#161A23]"
          }`}
        >
          <Markdown className="text-sm leading-relaxed">{text}</Markdown>
          <p
            className={`mt-2 font-mono text-[9px] ${
              isUser
                ? "text-white/60"
                : "text-[#0140B6]/55"
            }`}
          >
            {timestamp}
          </p>
        </div>
      </div>
    </div>
  );
}
