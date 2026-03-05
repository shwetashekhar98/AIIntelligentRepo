"use client";

import { useState, useCallback } from "react";
import RepoInput from "./components/RepoInput";
import RepoHeader from "./components/RepoHeader";
import AnswerCard from "./components/AnswerCard";

interface ToolCallLog {
  toolName: string;
  input: Record<string, unknown>;
  outputSummary: string;
  timestamp: number;
}

interface RepoInfo {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  topics: string[];
  openIssues: number;
  updatedAt: string;
}

interface QuestionResult {
  answer: string;
  toolCallLog: ToolCallLog[];
  tokensUsed: number;
  usingMCP: boolean;
  mcpFallback: boolean;
}

interface MonitorState {
  active: boolean;
  repoUrl: string;
  webhookUrl: string;
  lastSha: string | null;
  lastChecked: string | null;
  summary: string | null;
  status: "idle" | "checking" | "error";
}

const LOADING_STEPS = [
  "Connecting to GitHub...",
  "Fetching repository metadata...",
  "Reading commits & file tree...",
  "Connecting MCP tools...",
  "Claude is analyzing the codebase...",
  "Generating insights...",
];

const QUESTIONS = [
  { id: "purpose", label: "What does this repo do?", icon: "◈", shortLabel: "Purpose" },
  { id: "commits", label: "Why were recent commits made?", icon: "◎", shortLabel: "Commits" },
  { id: "risks", label: "What could break?", icon: "⬡", shortLabel: "Risks" },
  { id: "onboarding", label: "Onboard me as a new developer", icon: "◐", shortLabel: "Onboarding" },
];

interface StoredFormData {
  repoUrl: string;
  anthropicKey: string;
  githubToken: string;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingQuestion, setLoadingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cache: questionType → result (cleared when repo URL changes)
  const [answersCache, setAnswersCache] = useState<Record<string, QuestionResult>>({});
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [analyzedRepoUrl, setAnalyzedRepoUrl] = useState<string>("");
  const [activeQuestion, setActiveQuestion] = useState<string>("purpose");
  const [isResultVisible, setIsResultVisible] = useState(false);

  // Store last used form data so switching questions doesn't need re-input
  const [storedFormData, setStoredFormData] = useState<StoredFormData | null>(null);

  // Monitor state
  const [monitor, setMonitor] = useState<MonitorState>({
    active: false,
    repoUrl: "",
    webhookUrl: "",
    lastSha: null,
    lastChecked: null,
    summary: null,
    status: "idle",
  });
  const [monitorInput, setMonitorInput] = useState({ repoUrl: "", webhookUrl: "" });
  const [monitorError, setMonitorError] = useState<string | null>(null);

  const fetchQuestion = useCallback(async (
    questionType: string,
    formData: StoredFormData,
    customQuestion?: string,
    existingRepoInfo?: RepoInfo,
  ) => {
    setIsLoading(true);
    setLoadingQuestion(questionType);
    setError(null);
    setIsResultVisible(false);

    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => Math.min(prev + 1, LOADING_STEPS.length - 1));
    }, 1800);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anthropic-key": formData.anthropicKey,
          ...(formData.githubToken ? { "x-github-token": formData.githubToken } : {}),
        },
        body: JSON.stringify({
          repoUrl: formData.repoUrl,
          questionType,
          customQuestion: customQuestion || undefined,
        }),
      });

      const data = await response.json() as QuestionResult & {
        repoInfo?: RepoInfo;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "An unexpected error occurred");
        return;
      }

      // Cache the result
      const result: QuestionResult = {
        answer: data.answer,
        toolCallLog: data.toolCallLog,
        tokensUsed: data.tokensUsed,
        usingMCP: data.usingMCP,
        mcpFallback: data.mcpFallback,
      };

      setAnswersCache((prev) => ({ ...prev, [questionType]: result }));

      // Set repo info on first fetch
      if (!existingRepoInfo && data.repoInfo) {
        setRepoInfo(data.repoInfo);
      }

      setActiveQuestion(questionType);
      setTimeout(() => setIsResultVisible(true), 100);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      clearInterval(stepInterval);
      setLoadingStep(0);
      setIsLoading(false);
      setLoadingQuestion(null);
    }
  }, []);

  const handleAnalyze = async (formData: {
    repoUrl: string;
    anthropicKey: string;
    githubToken: string;
    questionType: string;
    customQuestion: string;
  }) => {
    const { repoUrl, anthropicKey, githubToken, questionType, customQuestion } = formData;

    // If repo URL changed, clear all caches
    if (repoUrl !== analyzedRepoUrl) {
      setAnswersCache({});
      setRepoInfo(null);
      setAnalyzedRepoUrl(repoUrl);
    }

    const fd: StoredFormData = { repoUrl, anthropicKey, githubToken };
    setStoredFormData(fd);

    // If answer is already cached for this question, just switch to it
    const cacheKey = questionType === "custom" ? `custom:${customQuestion}` : questionType;
    if (repoUrl === analyzedRepoUrl && answersCache[cacheKey]) {
      setActiveQuestion(cacheKey);
      setIsResultVisible(true);
      return;
    }

    await fetchQuestion(cacheKey, fd, customQuestion || undefined, repoInfo ?? undefined);
  };

  const handleTabSwitch = async (questionId: string) => {
    // If cached, show instantly
    if (answersCache[questionId]) {
      setActiveQuestion(questionId);
      setIsResultVisible(true);
      return;
    }

    // Otherwise fetch — reuse stored form data
    if (!storedFormData) return;
    await fetchQuestion(questionId, storedFormData, undefined, repoInfo ?? undefined);
    setActiveQuestion(questionId);
  };

  const startMonitor = async () => {
    if (!monitorInput.repoUrl) return;
    setMonitorError(null);

    const anthropicKey =
      typeof window !== "undefined" ? (sessionStorage.getItem("anthropic_key") ?? "") : "";
    const githubToken =
      typeof window !== "undefined" ? (sessionStorage.getItem("github_token") ?? "") : "";

    setMonitor((prev) => ({ ...prev, status: "checking" }));

    try {
      const response = await fetch("/api/monitor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anthropic-key": anthropicKey,
          ...(githubToken ? { "x-github-token": githubToken } : {}),
        },
        body: JSON.stringify({ action: "check", repoUrl: monitorInput.repoUrl }),
      });

      const data = await response.json() as { latestSha?: string; checkedAt?: string; error?: string };
      if (!response.ok) {
        setMonitorError(data.error ?? "Failed to start monitor");
        setMonitor((prev) => ({ ...prev, status: "error" }));
        return;
      }

      setMonitor({
        active: true,
        repoUrl: monitorInput.repoUrl,
        webhookUrl: monitorInput.webhookUrl,
        lastSha: data.latestSha ?? null,
        lastChecked: data.checkedAt ?? null,
        summary: null,
        status: "idle",
      });
    } catch {
      setMonitorError("Failed to connect. Check your API keys.");
      setMonitor((prev) => ({ ...prev, status: "error" }));
    }
  };

  const stopMonitor = () => {
    setMonitor({ active: false, repoUrl: "", webhookUrl: "", lastSha: null, lastChecked: null, summary: null, status: "idle" });
  };

  const hasResults = repoInfo !== null;
  const activeResult = answersCache[activeQuestion];
  const activeQuestionMeta = QUESTIONS.find((q) => q.id === activeQuestion);
  const activeLabel = activeQuestionMeta?.label ?? activeQuestion;
  const totalTokensUsed = Object.values(answersCache).reduce((sum, r) => sum + r.tokensUsed, 0);

  return (
    <main className="min-h-screen bg-[#0a0d14] text-white">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-12 sm:py-20">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Powered by Claude AI + MCP
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight leading-tight">
            Understand any <span className="text-amber-400">codebase</span>
            <br />instantly
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Paste a GitHub repository URL. Claude uses live MCP tools to analyze commits,
            code, and PRs in real time — giving you deep intelligence about any codebase.
          </p>
        </div>

        {/* Input card */}
        <div className="bg-[#111620] border border-zinc-800 rounded-2xl p-6 shadow-2xl mb-8">
          <RepoInput onSubmit={handleAnalyze} isLoading={isLoading} />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="bg-[#111620] border border-zinc-800 rounded-2xl p-8 mb-8">
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
                <div className="relative w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-zinc-300 text-sm font-medium">{LOADING_STEPS[loadingStep]}</p>
                <div className="flex gap-1 justify-center">
                  {LOADING_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all duration-500 ${
                        i <= loadingStep ? "w-6 bg-amber-500" : "w-2 bg-zinc-700"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-8 flex items-start gap-3">
            <span className="text-red-400 text-lg flex-shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-red-300 text-sm font-medium">Analysis failed</p>
              <p className="text-red-400/80 text-sm mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <div>
            <RepoHeader
              repoInfo={repoInfo!}
              usingMCP={activeResult?.usingMCP ?? false}
              mcpFallback={activeResult?.mcpFallback ?? false}
              toolCount={activeResult?.toolCallLog.length ?? 0}
            />

            {activeResult?.mcpFallback && (
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-2.5 mb-4 flex items-center gap-2 text-xs text-zinc-400">
                <span className="text-zinc-500">ℹ</span>
                Using REST API fallback — add a GitHub token to enable live MCP tools
              </div>
            )}

            {/* Question tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {QUESTIONS.map((q) => {
                const isCached = !!answersCache[q.id];
                const isActive = activeQuestion === q.id;
                const isThisLoading = loadingQuestion === q.id;

                return (
                  <button
                    key={q.id}
                    onClick={() => handleTabSwitch(q.id)}
                    disabled={isLoading && !isCached}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      isActive
                        ? "bg-amber-500 text-black"
                        : isCached
                        ? "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                        : "bg-zinc-800/60 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 border border-zinc-700/50"
                    }`}
                  >
                    {isThisLoading ? (
                      <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />
                    ) : isCached ? (
                      <span className="text-emerald-400">✓</span>
                    ) : (
                      <span>{q.icon}</span>
                    )}
                    {q.shortLabel}
                  </button>
                );
              })}

              {totalTokensUsed > 0 && (
                <span className="ml-auto text-xs text-zinc-600 self-center font-mono">
                  {totalTokensUsed.toLocaleString()} tokens total
                </span>
              )}
            </div>

            {/* Active answer */}
            {activeResult && (
              <AnswerCard
                questionLabel={activeLabel}
                questionType={activeQuestion}
                answer={activeResult.answer}
                toolCallLog={activeResult.toolCallLog}
                tokensUsed={activeResult.tokensUsed}
                isVisible={isResultVisible}
              />
            )}
          </div>
        )}

        {/* Monitor section */}
        <div className="mt-16 pt-12 border-t border-zinc-800/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${monitor.active ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
              <h2 className="text-white font-semibold">Live Repo Monitor</h2>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">beta</span>
          </div>
          <p className="text-zinc-500 text-sm mb-6 leading-relaxed">
            Watch a repository for new commits. Claude auto-summarizes changes every 15 minutes
            and sends alerts to your Slack or Telegram webhook.
          </p>

          {!monitor.active ? (
            <div className="bg-[#111620] border border-zinc-800 rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 font-mono">Repository URL</label>
                <input
                  type="text"
                  value={monitorInput.repoUrl}
                  onChange={(e) => setMonitorInput((prev) => ({ ...prev, repoUrl: e.target.value }))}
                  placeholder="https://github.com/username/repo"
                  className="w-full bg-[#0a0d14] border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 font-mono text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 font-mono">
                  Webhook URL <span className="text-zinc-600">(Slack / Telegram — optional)</span>
                </label>
                <input
                  type="url"
                  value={monitorInput.webhookUrl}
                  onChange={(e) => setMonitorInput((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                  placeholder="https://hooks.slack.com/..."
                  className="w-full bg-[#0a0d14] border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 font-mono text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
              {monitorError && <p className="text-red-400 text-sm">{monitorError}</p>}
              <button
                onClick={startMonitor}
                disabled={!monitorInput.repoUrl}
                className="w-full py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:border-zinc-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Start Monitoring
              </button>
            </div>
          ) : (
            <div className="bg-[#111620] border border-zinc-800 rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-emerald-400 text-sm font-medium">Active</span>
                  </div>
                  <p className="text-zinc-400 text-xs font-mono">{monitor.repoUrl}</p>
                  {monitor.lastChecked && (
                    <p className="text-zinc-600 text-xs mt-1">
                      Last checked: {new Date(monitor.lastChecked).toLocaleTimeString()}
                    </p>
                  )}
                  {monitor.status === "checking" && (
                    <p className="text-amber-400 text-xs mt-1 flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 border border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                      Checking for new commits...
                    </p>
                  )}
                </div>
                <button
                  onClick={stopMonitor}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded border border-zinc-700 hover:border-red-500/30"
                >
                  Stop
                </button>
              </div>
              {monitor.summary && (
                <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-700/50">
                  <p className="text-xs text-amber-400 font-mono mb-1.5">Latest changes</p>
                  <p className="text-zinc-300 text-sm leading-relaxed">{monitor.summary}</p>
                </div>
              )}
              {monitor.webhookUrl && (
                <p className="text-zinc-600 text-xs mt-3">
                  Alerts: <span className="font-mono">{monitor.webhookUrl.slice(0, 40)}...</span>
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="mt-16 pt-8 border-t border-zinc-800/50 text-center">
          <p className="text-zinc-600 text-xs">
            RepoMind — Repository Intelligence powered by{" "}
            <span className="text-amber-500/60">Claude AI</span> and{" "}
            <span className="text-blue-500/60">MCP</span>
          </p>
          <p className="text-zinc-700 text-xs mt-1">
            API keys are stored only in your browser session and never sent to a database.
          </p>
        </footer>
      </div>
    </main>
  );
}
