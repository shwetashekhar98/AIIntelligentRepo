# RepoMind — Repository Intelligence

RepoMind is a full-stack web app that gives you instant deep intelligence about any GitHub repository. Paste a repo URL, and Claude AI uses live MCP (Model Context Protocol) tools to analyze commits, file structure, pull requests, and code in real time — returning actionable insights in seconds.

## What is MCP?

Model Context Protocol (MCP) is an open standard that lets AI models call external tools during inference. RepoMind uses the official GitHub MCP server: when you ask Claude a question, it actively calls `get_file_contents`, `list_commits`, `search_code`, and `list_pull_requests` tools in real time — reading actual code, not just summaries — before generating its answer. If MCP isn't available (e.g. no GitHub token), the app transparently falls back to the GitHub REST API.

## Features

- **4 preset questions**: What does this repo do? / Why recent commits? / What could break? / Onboard me
- **Custom questions**: Ask anything about the codebase
- **Live MCP tools**: Claude calls GitHub tools in real time during analysis
- **Tool call log**: See exactly which GitHub tools Claude used to answer
- **Live Repo Monitor**: Poll for new commits every 15 min, auto-summarize changes, send Slack/Telegram alerts
- **Zero storage**: API keys stored only in browser sessionStorage

## Screenshot

![RepoMind UI](screenshot.png)

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd repomind
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
ANTHROPIC_API_KEY=sk-ant-...   # Required: get at console.anthropic.com
GITHUB_TOKEN=ghp_...           # Optional but recommended for MCP + private repos
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Use the app

1. Enter a GitHub repo URL (e.g. `https://github.com/vercel/next.js`)
2. Click "API Keys" to add your Anthropic key (and optionally a GitHub token)
3. Select a question or write your own
4. Click "Analyze Repository"

> **Note**: API keys can also be entered directly in the UI. They're stored in `sessionStorage` only — never sent to a database or logged server-side.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, Tailwind CSS, TypeScript |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) with tool use |
| MCP | `@modelcontextprotocol/sdk` — stdio transport (local), REST fallback (Vercel) |
| GitHub | `@octokit/rest` + official GitHub MCP server |
| Validation | Zod |
| Fonts | Syne (headings), JetBrains Mono (code/body) |

## Vercel Deployment

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/repomind)

After deploying, add these environment variables in Vercel project settings:

- `ANTHROPIC_API_KEY` — your Anthropic API key
- `GITHUB_TOKEN` — GitHub token (optional, enables MCP for all users)
- `NEXT_PUBLIC_APP_URL` — your Vercel deployment URL

> **Vercel note**: The MCP stdio transport (child process) is not available in Vercel serverless functions. The app automatically falls back to the GitHub REST API, which provides the same analysis quality. For full MCP support, deploy to a platform that supports long-running Node.js processes.

## API Reference

### `POST /api/analyze`

Analyze a repository with Claude.

**Headers:**
- `x-anthropic-key`: Anthropic API key
- `x-github-token`: GitHub token (optional)

**Body:**
```json
{
  "repoUrl": "https://github.com/owner/repo",
  "questionType": "purpose | commits | risks | onboarding | custom",
  "customQuestion": "optional custom question string"
}
```

**Response:**
```json
{
  "answer": "...",
  "toolCallLog": [...],
  "tokensUsed": 1234,
  "usingMCP": true,
  "repoInfo": { ... },
  "mcpFallback": false
}
```

### `POST /api/monitor`

Check or summarize new commits for repo monitoring.

**Body:**
```json
{
  "action": "check | summarize",
  "repoUrl": "https://github.com/owner/repo",
  "webhookUrl": "https://hooks.slack.com/...",
  "lastKnownSha": "abc1234"
}
```

## License

MIT
