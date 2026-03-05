"use client";

import { useState } from "react";

interface RepoInputProps {
  onSubmit: (data: {
    repoUrl: string;
    anthropicKey: string;
    githubToken: string;
    questionType: string;
    customQuestion: string;
  }) => void;
  isLoading: boolean;
}

const QUESTION_OPTIONS = [
  {
    id: "purpose",
    label: "What does this repo do?",
    icon: "◈",
    description: "Purpose, architecture & features",
  },
  {
    id: "commits",
    label: "Why were recent commits made?",
    icon: "◎",
    description: "Reasoning behind recent changes",
  },
  {
    id: "risks",
    label: "What could break if I make changes?",
    icon: "⬡",
    description: "Fragile parts & critical dependencies",
  },
  {
    id: "onboarding",
    label: "Onboard me as a new developer",
    icon: "◐",
    description: "Where to start & key patterns",
  },
];

export default function RepoInput({ onSubmit, isLoading }: RepoInputProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [anthropicKey, setAnthropicKey] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("anthropic_key") ?? "" : ""
  );
  const [githubToken, setGithubToken] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("github_token") ?? "" : ""
  );
  const [selectedQuestion, setSelectedQuestion] = useState("purpose");
  const [customQuestion, setCustomQuestion] = useState("");
  const [showKeys, setShowKeys] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || !anthropicKey.trim()) return;

    // Store keys in sessionStorage (never in server/DB)
    sessionStorage.setItem("anthropic_key", anthropicKey);
    if (githubToken) sessionStorage.setItem("github_token", githubToken);

    onSubmit({
      repoUrl: repoUrl.trim(),
      anthropicKey: anthropicKey.trim(),
      githubToken: githubToken.trim(),
      questionType: selectedQuestion,
      customQuestion: customQuestion.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Repo URL */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-2 font-mono">
          Repository URL
        </label>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/username/repo"
          className="w-full bg-[#0a0d14] border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 font-mono text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          required
        />
      </div>

      {/* Question selector */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-3 font-mono">
          What do you want to know?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUESTION_OPTIONS.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setSelectedQuestion(q.id)}
              className={`text-left p-3 rounded-lg border transition-all ${
                selectedQuestion === q.id
                  ? "border-amber-500 bg-amber-500/10 text-white"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 text-base leading-none">{q.icon}</span>
                <div>
                  <div className="text-sm font-medium leading-tight">{q.label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{q.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Custom question */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setSelectedQuestion("custom")}
            className={`w-full text-left p-3 rounded-lg border transition-all ${
              selectedQuestion === "custom"
                ? "border-amber-500 bg-amber-500/10 text-white"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-amber-500">✦</span>
              <span className="text-sm font-medium">Ask a custom question</span>
            </div>
          </button>
          {selectedQuestion === "custom" && (
            <textarea
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="e.g. How does authentication work in this codebase?"
              rows={3}
              className="mt-2 w-full bg-[#0a0d14] border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 font-mono text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-colors resize-none"
            />
          )}
        </div>
      </div>

      {/* API Keys */}
      <div>
        <button
          type="button"
          onClick={() => setShowKeys(!showKeys)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-3"
        >
          <span className={`transition-transform ${showKeys ? "rotate-90" : ""}`}>▶</span>
          API Keys
          <span className="text-xs text-zinc-600">(stored in sessionStorage only)</span>
        </button>

        {showKeys && (
          <div className="space-y-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 font-mono">
                ANTHROPIC_API_KEY <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-[#0a0d14] border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 font-mono text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5 font-mono">
                GITHUB_TOKEN{" "}
                <span className="text-zinc-600">(optional for public repos)</span>
              </label>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
                className="w-full bg-[#0a0d14] border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 font-mono text-xs focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-colors"
              />
              <p className="text-xs text-zinc-600 mt-1">
                Required for private repos and enables MCP live GitHub tools
              </p>
            </div>
          </div>
        )}

        {/* Show key status even when collapsed */}
        {!showKeys && (
          <div className="flex gap-3 text-xs text-zinc-600">
            <span className={anthropicKey ? "text-emerald-500" : "text-red-400"}>
              {anthropicKey ? "✓ Anthropic key set" : "✗ Anthropic key required"}
            </span>
            {githubToken && <span className="text-emerald-500">✓ GitHub token set</span>}
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || !repoUrl.trim() || !anthropicKey.trim()}
        className="w-full py-3 px-6 rounded-lg bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-amber-500/20 active:scale-[0.99]"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Analyzing...
          </span>
        ) : (
          "Analyze Repository →"
        )}
      </button>
    </form>
  );
}
