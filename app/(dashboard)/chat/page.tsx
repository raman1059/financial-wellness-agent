"use client";

import { useChat } from "ai/react";
import { useState } from "react";
import { MessageBubble } from "@/components/features/chat/message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot } from "lucide-react";

const QUICK_PROMPTS = [
  "What is my tax liability for FY 2024-25?",
  "How much TDS has been deducted this year?",
  "Compare my Old vs New regime tax",
  "What deductions can I still claim?",
];

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
  });
  const [hasStarted, setHasStarted] = useState(false);

  function submitQuick(prompt: string) {
    setHasStarted(true);
    handleInputChange({ target: { value: prompt } } as never);
    setTimeout(() => {
      const form = document.getElementById("chat-form") as HTMLFormElement;
      form?.requestSubmit();
    }, 50);
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">AI Financial Advisor</h1>
        <p className="text-sm text-gray-500">Ask anything about your payroll, taxes, or investments</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
              <Bot className="h-8 w-8 text-brand-600" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-gray-900">Your AI Advisor is ready</p>
              <p className="text-sm text-gray-500 mt-1">All answers are grounded in your financial data</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => submitQuick(p)}
                  className="text-left rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role as "user" | "assistant"}
            content={m.content}
            isGrounded={m.role === "assistant"}
          />
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
              AI
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-white border border-gray-200 px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <form
        id="chat-form"
        onSubmit={(e) => { setHasStarted(true); handleSubmit(e); }}
        className="flex gap-3 pt-4 border-t border-gray-200 bg-gray-50"
      >
        <Input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask about your salary, tax, or investments…"
          className="flex-1"
          disabled={isLoading}
        />
        <Button type="submit" disabled={!input.trim() || isLoading} size="md">
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <p className="text-xs text-center text-gray-400 mt-2">
        Responses are grounded in your data · Not financial advice
      </p>
    </div>
  );
}
