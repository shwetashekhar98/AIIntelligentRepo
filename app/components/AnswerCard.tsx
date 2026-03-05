"use client";

import { useState } from "react";

interface ToolCallLog {
  toolName: string;
  input: Record<string, unknown>;
  outputSummary: string;
  timestamp: number;
}

interface AnswerCardProps {
  questionLabel: string;
  questionType: string;
  answer: string;
  toolCallLog: ToolCallLog[];
  tokensUsed: number;
  isVisible: boolean;
}

const QUESTION_ICONS: Record<string, string> = {
  purpose: "◈",
  commits: "◎",
  risks: "⬡",
  onboarding: "◐",
  custom: "✦",
};

function formatAnswer(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="text-white font-semibold text-base mt-5 mb-2">
          {line.slice(4)}
        </h4>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="text-white font-bold text-lg mt-6 mb-2">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="text-amber-400 font-bold text-xl mt-6 mb-3">
          {line.slice(2)}
        </h2>
      );
    }
    // Bold
    else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(
        <p key={i} className="text-white font-semibold mt-3 mb-1">
          {line.slice(2, -2)}
        </p>
      );
    }
    // Bullet points
    else if (line.match(/^[-*•]\s/)) {
      elements.push(
        <li key={i} className="text-zinc-300 text-sm leading-relaxed ml-4 mb-1">
          <span dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }} />
        </li>
      );
    }
    // Numbered list
    else if (line.match(/^\d+\.\s/)) {
      elements.push(
        <li key={i} className="text-zinc-300 text-sm leading-relaxed ml-4 mb-1 list-decimal">
          <span dangerouslySetInnerHTML={{ __html: formatInline(line.replace(/^\d+\.\s/, "")) }} />
        </li>
      );
    }
    // Code blocks
    else if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre
          key={i}
          className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 my-3 overflow-x-auto"
        >
          <code className="text-emerald-400 text-xs font-mono">{codeLines.join("\n")}</code>
        </pre>
      );
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    }
    // Regular paragraph
    else {
      elements.push(
        <p
          key={i}
          className="text-zinc-300 text-sm leading-relaxed mb-2"
          dangerouslySetInnerHTML={{ __html: formatInline(line) }}
        />
      );
    }
    i++;
  }

  return elements;
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="text-zinc-200">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="text-amber-400 bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono">$1</code>');
}

export default function AnswerCard({
  questionLabel,
  questionType,
  answer,
  toolCallLog,
  tokensUsed,
  isVisible,
}: AnswerCardProps) {
  const [showToolLog, setShowToolLog] = useState(false);

  const icon = QUESTION_ICONS[questionType] ?? "◈";

  return (
    <div
      className={`bg-[#111620] border border-zinc-800 rounded-xl overflow-hidden transition-all duration-500 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="text-amber-500 text-lg">{icon}</span>
          <h3 className="text-white font-semibold text-sm">{questionLabel}</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-600">
          <span className="font-mono">{tokensUsed.toLocaleString()} tokens</span>
        </div>
      </div>

      {/* Answer content */}
      <div className="px-5 py-5">
        <div className="prose-custom">{formatAnswer(answer)}</div>
      </div>

      {/* Tool call log */}
      {toolCallLog.length > 0 && (
        <div className="border-t border-zinc-800">
          <button
            onClick={() => setShowToolLog(!showToolLog)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span className="text-amber-500/70">⚙</span>
              Claude used {toolCallLog.length} GitHub tool{toolCallLog.length !== 1 ? "s" : ""} to
              answer this
            </span>
            <span className={`transition-transform ${showToolLog ? "rotate-180" : ""}`}>▾</span>
          </button>

          {showToolLog && (
            <div className="px-5 pb-4 space-y-2">
              {toolCallLog.map((call, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800/50"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono text-amber-400 font-semibold">
                      {call.toolName}
                    </span>
                    <span className="text-zinc-600 text-xs">→</span>
                  </div>
                  <div className="text-xs font-mono text-zinc-500 mb-1">
                    Input:{" "}
                    <span className="text-zinc-400">
                      {JSON.stringify(call.input).slice(0, 120)}
                      {JSON.stringify(call.input).length > 120 ? "..." : ""}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-zinc-600">
                    Output:{" "}
                    <span className="text-zinc-500">
                      {call.outputSummary.slice(0, 150)}
                      {call.outputSummary.length > 150 ? "..." : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
