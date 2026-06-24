import { clsx } from "clsx";

interface Citation {
  field: string;
  value: string;
  table: string;
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isGrounded?: boolean;
}

export function MessageBubble({ role, content, citations, isGrounded }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={clsx("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={clsx(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        isUser ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600",
      )}>
        {isUser ? "U" : "AI"}
      </div>

      <div className={clsx("max-w-[75%] space-y-1", isUser && "items-end flex flex-col")}>
        <div className={clsx(
          "rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-brand-600 text-white rounded-tr-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm",
        )}>
          {content}
        </div>

        {citations && citations.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {citations.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 rounded px-1.5 py-0.5 border border-gray-100">
                <span className="text-gray-300">[{c.field}]</span>
                <span className="font-medium text-gray-600">{c.value}</span>
              </span>
            ))}
          </div>
        )}

        {!isUser && isGrounded === false && (
          <p className="text-xs text-amber-600 px-1">⚠ Response may not be fully grounded in your data</p>
        )}
      </div>
    </div>
  );
}
