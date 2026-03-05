"use client";

interface RepoHeaderData {
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

interface RepoHeaderProps {
  repoInfo: RepoHeaderData;
  usingMCP: boolean;
  mcpFallback: boolean;
  toolCount: number;
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f7df1e",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#ffac45",
  Kotlin: "#A97BFF",
};

export default function RepoHeader({ repoInfo, usingMCP, mcpFallback, toolCount }: RepoHeaderProps) {
  const langColor = repoInfo.language
    ? LANGUAGE_COLORS[repoInfo.language] ?? "#6e7681"
    : null;

  const updatedDate = new Date(repoInfo.updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="bg-[#111620] border border-zinc-800 rounded-xl p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Repo name */}
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-zinc-400 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z" />
            </svg>
            <h2 className="text-white font-semibold text-lg font-mono truncate">
              {repoInfo.fullName}
            </h2>
            {repoInfo.isPrivate && (
              <span className="text-xs px-1.5 py-0.5 rounded border border-zinc-600 text-zinc-400 flex-shrink-0">
                Private
              </span>
            )}
          </div>

          {repoInfo.description && (
            <p className="text-zinc-400 text-sm mb-3 leading-relaxed">
              {repoInfo.description}
            </p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
            {repoInfo.language && (
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: langColor ?? "#6e7681" }}
                />
                {repoInfo.language}
              </span>
            )}

            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
              </svg>
              {repoInfo.stars.toLocaleString()}
            </span>

            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
              </svg>
              {repoInfo.forks.toLocaleString()}
            </span>

            {repoInfo.openIssues > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                  <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
                </svg>
                {repoInfo.openIssues} issues
              </span>
            )}

            <span className="text-zinc-600">Updated {updatedDate}</span>
          </div>

          {/* Topics */}
          {repoInfo.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {repoInfo.topics.slice(0, 8).map((topic) => (
                <span
                  key={topic}
                  className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* MCP status badge */}
        <div className="flex-shrink-0">
          {usingMCP ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-emerald-400 font-mono">MCP Live</span>
            </div>
          ) : mcpFallback ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-500/10 border border-zinc-600/20">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
              <span className="text-xs text-zinc-400 font-mono">REST fallback</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-500/10 border border-zinc-600/20">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
              <span className="text-xs text-zinc-400 font-mono">REST API</span>
            </div>
          )}

          {toolCount > 0 && (
            <p className="text-xs text-zinc-600 text-right mt-1.5">
              Claude used {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
