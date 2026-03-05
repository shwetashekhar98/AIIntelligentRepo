import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseRepoUrl,
  createOctokit,
  getLatestCommitSha,
  getRecentCommits,
  getRepoInfo,
} from "@/lib/github";
import Anthropic from "@anthropic-ai/sdk";

const MonitorSchema = z.object({
  action: z.enum(["check", "summarize"]),
  repoUrl: z.string().min(1),
  webhookUrl: z.string().url().optional(),
  lastKnownSha: z.string().optional(),
});

const MODEL = "claude-sonnet-4-5";

async function summarizeNewCommits(
  anthropicApiKey: string,
  owner: string,
  repo: string,
  commits: Array<{ sha: string; message: string; author: string; date: string }>,
  repoDescription: string | null
): Promise<string> {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const commitList = commits
    .map((c) => `- [${c.sha}] ${c.message} by ${c.author} on ${c.date.slice(0, 10)}`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Repository: ${owner}/${repo}
Description: ${repoDescription ?? "No description"}

New commits since last check:
${commitList}

Provide a concise summary (3-5 sentences) of what changed and WHY these changes were likely made. Focus on the reasoning and impact, not just what files changed. Keep it developer-friendly and informative.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "Unable to generate summary";
}

async function sendWebhookNotification(
  webhookUrl: string,
  payload: {
    repoName: string;
    newCommits: number;
    summary: string;
    latestSha: string;
  }
): Promise<boolean> {
  try {
    // Try Slack format first
    const slackBody = {
      text: `*RepoMind Alert: ${payload.repoName}*\n${payload.newCommits} new commit${payload.newCommits !== 1 ? "s" : ""} detected.\n\n${payload.summary}\n\nLatest: \`${payload.latestSha}\``,
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackBody),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const anthropicApiKey =
    request.headers.get("x-anthropic-key") ?? process.env.ANTHROPIC_API_KEY;
  const githubToken =
    request.headers.get("x-github-token") ?? process.env.GITHUB_TOKEN ?? undefined;

  if (!anthropicApiKey) {
    return NextResponse.json(
      { error: "Anthropic API key required" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = MonitorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { action, repoUrl, webhookUrl, lastKnownSha } = parsed.data;

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

  if (action === "check") {
    // Just check for new commits
    const latestSha = await getLatestCommitSha(octokit, owner, repo);
    const hasNewCommits = latestSha !== null && latestSha !== lastKnownSha;

    return NextResponse.json({
      hasNewCommits,
      latestSha,
      lastKnownSha: lastKnownSha ?? null,
      checkedAt: new Date().toISOString(),
    });
  }

  if (action === "summarize") {
    // Fetch latest commits and summarize
    try {
      const [repoInfo, commits] = await Promise.all([
        getRepoInfo(octokit, owner, repo),
        getRecentCommits(octokit, owner, repo, 10),
      ]);

      // Filter to only new commits if we have a known SHA
      const newCommits = lastKnownSha
        ? commits.filter(
            (c, idx) =>
              idx <
              (commits.findIndex((c2) => c2.sha === lastKnownSha) !== -1
                ? commits.findIndex((c2) => c2.sha === lastKnownSha)
                : commits.length)
          )
        : commits.slice(0, 5);

      if (newCommits.length === 0) {
        return NextResponse.json({
          hasNewCommits: false,
          message: "No new commits since last check",
          checkedAt: new Date().toISOString(),
        });
      }

      const summary = await summarizeNewCommits(
        anthropicApiKey,
        owner,
        repo,
        newCommits,
        repoInfo.description
      );

      const latestSha = commits[0]?.sha ?? "";

      // Send webhook notification if URL provided
      let webhookSent = false;
      if (webhookUrl) {
        webhookSent = await sendWebhookNotification(webhookUrl, {
          repoName: `${owner}/${repo}`,
          newCommits: newCommits.length,
          summary,
          latestSha,
        });
      }

      return NextResponse.json({
        hasNewCommits: true,
        newCommitCount: newCommits.length,
        latestSha,
        summary,
        webhookSent,
        checkedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const error = err as { message?: string };
      return NextResponse.json(
        { error: `Monitor error: ${error?.message ?? "Unknown error"}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
