import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  timestamp: number;
}

export interface MCPConnection {
  client: Client;
  tools: MCPTool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<void>;
}

const GITHUB_MCP_TOOLS = [
  "get_file_contents",
  "list_commits",
  "search_code",
  "get_pull_request",
  "list_issues",
  "get_repository",
  "list_branches",
  "get_commit",
];

export async function connectMCPServer(
  githubToken: string
): Promise<MCPConnection | null> {
  try {
    const client = new Client({ name: "repomind-client", version: "1.0.0" });

    const transport = new StdioClientTransport({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: githubToken,
      },
    });

    // Set a connection timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("MCP connection timeout")), 10000)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // List available tools
    const toolsResult = await client.listTools();
    const allTools: MCPTool[] = toolsResult.tools
      .filter((t) => GITHUB_MCP_TOOLS.some((name) => t.name.includes(name)))
      .map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
      }));

    // If no filtered tools, use all available
    const tools: MCPTool[] =
      allTools.length > 0
        ? allTools
        : toolsResult.tools.slice(0, 10).map((t) => ({
            name: t.name,
            description: t.description ?? "",
            inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
          }));

    const callTool = async (
      name: string,
      args: Record<string, unknown>
    ): Promise<unknown> => {
      const result = await client.callTool({ name, arguments: args });
      return result.content;
    };

    const close = async () => {
      await client.close();
    };

    return { client, tools, callTool, close };
  } catch (error) {
    console.warn("MCP connection failed, will use REST fallback:", error);
    return null;
  }
}

// Convert MCP tools to Anthropic tool format
export function mcpToolsToAnthropicTools(
  tools: MCPTool[]
): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

// Build fallback REST-based tools for when MCP is unavailable
export function buildRestFallbackTools(
  owner: string,
  repo: string
): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return [
    {
      name: "get_file_contents",
      description: `Get the contents of a file from the ${owner}/${repo} GitHub repository`,
      input_schema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: {
            type: "string",
            description: "Path to the file in the repository",
          },
        },
        required: ["owner", "repo", "path"],
      },
    },
    {
      name: "list_commits",
      description: `List recent commits for the ${owner}/${repo} repository`,
      input_schema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          per_page: {
            type: "number",
            description: "Number of commits to return (max 30)",
          },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "search_code",
      description: `Search for code patterns in the ${owner}/${repo} repository`,
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
        },
        required: ["query", "owner", "repo"],
      },
    },
    {
      name: "list_pull_requests",
      description: `List pull requests for the ${owner}/${repo} repository`,
      input_schema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "State of pull requests to list",
          },
        },
        required: ["owner", "repo"],
      },
    },
  ];
}
