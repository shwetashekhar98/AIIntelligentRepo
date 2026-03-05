import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseRepoUrl,
  createOctokit,
  getRepoInfo,
  getRecentCommits,
  getFileTree,
  getReadme,
  getRecentPullRequests,
} from "@/lib/github";
import { connectMCPServer, buildRestFallbackTools, mcpToolsToAnthropicTools } from "@/lib/mcp";
import { runClaudeAnalysis, getQuestionPrompt, RepoContext } from "@/lib/claude";

const RequestSchema = z.object({
  repoUrl: z.string().min(1, "Repository URL is required"),
  questionType: z.enum(["purpose", "commits", "risks", "onboarding", "custom"]),
  customQuestion: z.string().optional(),
});

export async function POST(request: NextRequest) {
  // Extract API keys from headers
  const anthropicApiKey =
    request.headers.get("x-anthropic-key") ?? process.env.ANTHROPIC_API_KEY;
  const githubToken =
    request.headers.get("x-github-token") ?? process.env.GITHUB_TOKEN ?? undefined;

  if (!anthropicApiKey) {
    return NextResponse.json(
      { error: "Anthropic API key is required. Please add it in the input form." },
      { status: 401 }
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { repoUrl, questionType, customQuestion } = parsed.data;

  // Parse repo URL
  let owner: string, repo: string;
  try {
    ({ owner, repo } = parseRepoUrl(repoUrl));
  } catch {
    return NextResponse.json(
      { error: "Format should be github.com/username/repo" },
      { status: 400 }
    );
  }

  const octokit = createOctokit(githubToken);

  // Fetch repo data
  let repoInfo, commits, fileTree, readme, prs;
  try {
    [repoInfo, commits, readme, prs] = await Promise.all([
      getRepoInfo(octokit, owner, repo),
      getRecentCommits(octokit, owner, repo, 20),
      getReadme(octokit, owner, repo),
      getRecentPullRequests(octokit, owner, repo, 10),
    ]);

    fileTree = await getFileTree(octokit, owner, repo, repoInfo.defaultBranch);
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error?.status === 404) {
      if (!githubToken) {
        return NextResponse.json(
          {
            error:
              "Repository not found. If this is a private repo, add a GitHub token for access.",
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Repository not found. Check the URL and ensure you have access." },
        { status: 404 }
      );
    }
    if (error?.status === 403 || error?.status === 429) {
      return NextResponse.json(
        {
          error:
            "GitHub rate limit exceeded. Add a GitHub token for higher limits.",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: `GitHub API error: ${error?.message ?? "Unknown error"}` },
      { status: 500 }
    );
  }

  const repoContext: RepoContext = {
    owner,
    repo,
    description: repoInfo.description,
    readme,
    fileTree: fileTree.map((f) => f.path).filter(Boolean) as string[],
    recentCommits: commits,
    recentPRs: prs,
    language: repoInfo.language,
    topics: repoInfo.topics,
  };

  // Try to connect to MCP server
  let mcpConnection = null;
  let usingMCPServer = false;
  let tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;

  if (githubToken) {
    mcpConnection = await connectMCPServer(githubToken);
  }

  if (mcpConnection) {
    usingMCPServer = true;
    tools = mcpToolsToAnthropicTools(mcpConnection.tools);
    // If MCP tools are empty, fall back
    if (tools.length === 0) {
      tools = buildRestFallbackTools(owner, repo);
      usingMCPServer = false;
    }
  } else {
    tools = buildRestFallbackTools(owner, repo);
  }

  const questionPrompt = getQuestionPrompt(questionType, customQuestion);

  // Run Claude analysis
  let result;
  try {
    result = await runClaudeAnalysis({
      anthropicApiKey,
      githubToken,
      repoContext,
      questionPrompt,
      tools,
      mcpCallTool: mcpConnection?.callTool ?? null,
    });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string; error?: { type?: string } };
    if (error?.status === 401) {
      return NextResponse.json(
        { error: "Invalid Anthropic API key. Please check your key and try again." },
        { status: 401 }
      );
    }
    if (error?.status === 429) {
      return NextResponse.json(
        { error: "Anthropic API rate limit exceeded. Please try again in a moment." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: `Claude API error: ${error?.message ?? "Unknown error"}` },
      { status: 500 }
    );
  } finally {
    if (mcpConnection) {
      await mcpConnection.close().catch(() => {});
    }
  }

  return NextResponse.json({
    answer: result.answer,
    toolCallLog: result.toolCallLog,
    tokensUsed: result.tokensUsed,
    usingMCP: usingMCPServer,
    repoInfo: {
      fullName: repoInfo.fullName,
      description: repoInfo.description,
      stars: repoInfo.stars,
      forks: repoInfo.forks,
      language: repoInfo.language,
      defaultBranch: repoInfo.defaultBranch,
      isPrivate: repoInfo.isPrivate,
      topics: repoInfo.topics,
      openIssues: repoInfo.openIssues,
      updatedAt: repoInfo.updatedAt,
    },
    mcpFallback: !usingMCPServer && githubToken != null,
  });
}
