import { Octokit } from "@octokit/rest";
import { z } from "zod";

export const RepoUrlSchema = z.string().refine(
  (url) => {
    const pattern = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/;
    return pattern.test(url) || /^([^/]+)\/([^/]+)$/.test(url);
  },
  { message: "Format should be github.com/username/repo" }
);

export interface RepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  openIssues: number;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface FileTree {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  state: string;
  body: string | null;
  author: string;
  createdAt: string;
  mergedAt: string | null;
  labels: string[];
}

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  // Handle full URLs
  const fullUrlMatch = url.match(
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/
  );
  if (fullUrlMatch) {
    return { owner: fullUrlMatch[1], repo: fullUrlMatch[2] };
  }

  // Handle owner/repo format
  const shortMatch = url.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  throw new Error('Format should be github.com/username/repo');
}

export function createOctokit(token?: string): Octokit {
  return new Octokit({
    auth: token || undefined,
    userAgent: "RepoMind/1.0.0",
  });
}

export async function getRepoInfo(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<RepoInfo> {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return {
    owner,
    repo,
    fullName: data.full_name,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    language: data.language ?? null,
    defaultBranch: data.default_branch,
    isPrivate: data.private,
    topics: data.topics ?? [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    openIssues: data.open_issues_count,
  };
}

export async function getRecentCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  limit = 20
): Promise<CommitInfo[]> {
  const { data } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    per_page: limit,
  });

  return data.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name ?? "Unknown",
    date: c.commit.author?.date ?? "",
    url: c.html_url,
  }));
}

export async function getFileTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<FileTree[]> {
  const { data } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "1",
  });

  return (data.tree as FileTree[])
    .filter((f) => f.path !== undefined)
    .slice(0, 200); // Cap to prevent huge payloads
}

export async function getReadme(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string> {
  try {
    const { data } = await octokit.rest.repos.getReadme({ owner, repo });
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return content.slice(0, 8000); // Limit size
  } catch {
    return "No README found";
  }
}

export async function getRecentPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
  limit = 10
): Promise<PullRequestInfo[]> {
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "all",
    per_page: limit,
    sort: "updated",
    direction: "desc",
  });

  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    body: pr.body ? pr.body.slice(0, 500) : null,
    author: pr.user?.login ?? "Unknown",
    createdAt: pr.created_at,
    mergedAt: pr.merged_at ?? null,
    labels: pr.labels.map((l) => l.name),
  }));
}

export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if ("content" in data && typeof data.content === "string") {
      return Buffer.from(data.content, "base64").toString("utf-8").slice(0, 5000);
    }
    return "";
  } catch {
    return "";
  }
}

export async function getLatestCommitSha(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const commits = await getRecentCommits(octokit, owner, repo, 1);
    return commits[0]?.sha ?? null;
  } catch {
    return null;
  }
}
