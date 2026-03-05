import Anthropic from "@anthropic-ai/sdk";
import { createOctokit, getFileContent, getRecentCommits } from "./github";

export interface ToolCallLog {
  toolName: string;
  input: Record<string, unknown>;
  outputSummary: string;
  timestamp: number;
}

export interface AnalysisResult {
  answer: string;
  toolCallLog: ToolCallLog[];
  tokensUsed: number;
  usingMCP: boolean;
}

export interface RepoContext {
  owner: string;
  repo: string;
  description: string | null;
  readme: string;
  fileTree: string[];
  recentCommits: Array<{ sha: string; message: string; author: string; date: string }>;
  recentPRs: Array<{ number: number; title: string; state: string; body: string | null }>;
  language: string | null;
  topics: string[];
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

type AnthropicMessageParam = Anthropic.MessageParam;

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const MAX_TOOL_ROUNDS = 8;

export async function runClaudeAnalysis(params: {
  anthropicApiKey: string;
  githubToken: string | undefined;
  repoContext: RepoContext;
  questionPrompt: string;
  tools: AnthropicTool[];
  mcpCallTool: ((name: string, args: Record<string, unknown>) => Promise<unknown>) | null;
}): Promise<AnalysisResult> {
  const { anthropicApiKey, githubToken, repoContext, questionPrompt, tools, mcpCallTool } = params;

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const toolCallLog: ToolCallLog[] = [];
  const usingMCP = mcpCallTool !== null;

  const systemPrompt = `You are an expert software engineer analyzing the GitHub repository ${repoContext.owner}/${repoContext.repo}.

Repository Context:
- Language: ${repoContext.language ?? "Unknown"}
- Topics: ${repoContext.topics.join(", ") || "None listed"}
- Description: ${repoContext.description ?? "No description"}

File Structure (top-level):
${repoContext.fileTree.slice(0, 50).join("\n")}

Recent Commits:
${repoContext.recentCommits.slice(0, 10).map((c) => `- [${c.sha}] ${c.message} (${c.author}, ${c.date.slice(0, 10)})`).join("\n")}

Recent Pull Requests:
${repoContext.recentPRs.slice(0, 5).map((pr) => `- #${pr.number} [${pr.state}] ${pr.title}`).join("\n")}

README (excerpt):
${repoContext.readme.slice(0, 3000)}

You have access to GitHub tools to fetch more information in real time. Use them to provide a thorough, accurate analysis. Always use the tools to get additional context before answering — don't rely solely on what's provided above.`;

  const messages: AnthropicMessageParam[] = [
    {
      role: "user",
      content: questionPrompt,
    },
  ];

  let totalTokens = 0;
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool["input_schema"],
      })),
      messages,
    });

    totalTokens += response.usage.input_tokens + response.usage.output_tokens;

    // Add assistant response to message history
    messages.push({
      role: "assistant",
      content: response.content,
    });

    // If no tool use, we're done
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const answer = textBlock && textBlock.type === "text" ? textBlock.text : "";
      return { answer, toolCallLog, tokensUsed: totalTokens, usingMCP };
    }

    // Handle tool use
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;

      const toolInput = block.input as Record<string, unknown>;
      let toolOutput: unknown;
      const startTime = Date.now();

      try {
        if (usingMCP && mcpCallTool) {
          // Use MCP server
          toolOutput = await mcpCallTool(block.name, toolInput);
        } else {
          // REST fallback
          toolOutput = await callRestFallback(block.name, toolInput, githubToken);
        }
      } catch (error) {
        toolOutput = { error: String(error) };
      }

      const outputStr = JSON.stringify(toolOutput);
      const outputSummary =
        outputStr.length > 200 ? outputStr.slice(0, 200) + "..." : outputStr;

      toolCallLog.push({
        toolName: block.name,
        input: toolInput,
        outputSummary,
        timestamp: startTime,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: outputStr.slice(0, 10000), // Limit tool result size
      });
    }

    // Add tool results to messages
    messages.push({
      role: "user",
      content: toolResults,
    });
  }

  // Extract final answer from last assistant message
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  let answer = "";
  if (lastAssistantMsg && Array.isArray(lastAssistantMsg.content)) {
    const textBlock = lastAssistantMsg.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      answer = textBlock.text;
    }
  }

  return { answer, toolCallLog, tokensUsed: totalTokens, usingMCP };
}

async function callRestFallback(
  toolName: string,
  args: Record<string, unknown>,
  githubToken: string | undefined
): Promise<unknown> {
  const octokit = createOctokit(githubToken);
  const owner = (args.owner as string) ?? "";
  const repo = (args.repo as string) ?? "";

  switch (toolName) {
    case "get_file_contents": {
      const path = (args.path as string) ?? "";
      const content = await getFileContent(octokit, owner, repo, path);
      return { content, path };
    }

    case "list_commits": {
      const perPage = Math.min((args.per_page as number) ?? 20, 30);
      const commits = await getRecentCommits(octokit, owner, repo, perPage);
      return commits;
    }

    case "search_code": {
      const query = (args.query as string) ?? "";
      const { data } = await octokit.rest.search.code({
        q: `${query} repo:${owner}/${repo}`,
        per_page: 10,
      });
      return data.items.map((item) => ({
        path: item.path,
        name: item.name,
        url: item.html_url,
      }));
    }

    case "list_pull_requests": {
      const state = (args.state as "open" | "closed" | "all") ?? "all";
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state,
        per_page: 10,
      });
      return data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        body: pr.body?.slice(0, 300),
        author: pr.user?.login,
        createdAt: pr.created_at,
      }));
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

export function getQuestionPrompt(
  questionType: string,
  customQuestion: string | undefined
): string {
  const prompts: Record<string, string> = {
    purpose:
      "Explain what this repository does, its main purpose, core features, and architecture in clear plain English. Be specific about what problems it solves and who it's for. Use the available GitHub tools to read key files and understand the codebase deeply.",

    commits:
      "Analyze the recent commit messages and explain WHY these changes were made. What problems were being solved? What was being improved or fixed? Give me the reasoning behind the changes, not just what changed. Use the available tools to read specific commits and files that were modified.",

    risks:
      "Based on the codebase structure, what are the most fragile or tightly coupled parts? If I were to make changes, what areas would most likely cause issues? What are the critical dependencies I should be careful about? Use the GitHub tools to examine the actual code and identify real fragile points.",

    onboarding:
      "I'm a new developer joining this project. Give me a structured onboarding guide: where to start reading the code, the key files I need to understand first, the main patterns used, and what I should build or modify first to get familiar. Read the key files using the available tools to give specific, accurate advice.",
  };

  if (questionType === "custom" && customQuestion) {
    return `${customQuestion}\n\nUse the available GitHub tools to read relevant files and provide a thorough, accurate answer based on the actual code.`;
  }

  return prompts[questionType] ?? prompts.purpose;
}
