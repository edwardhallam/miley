# CLAUDE.md

This file provides guidance to Claude Code when working with the Miley codebase.

## Overview

Miley is a deep fork of [Cyrus](https://github.com/ceedaragents/cyrus) (Apache 2.0), purpose-built as a Linear-to-Claude Code bridge agent for Eddie's personal infrastructure. It receives Linear webhooks, creates git worktrees, and spawns Claude Code sessions to process assigned issues.

Key architectural difference from Cyrus: Miley stripped the classification/procedure system (ProcedureAnalyzer, subroutines, PromptBuilder). Claude Code + skills handle all routing and workflow logic natively. The launch path goes directly from webhook to session creation.

## Architecture

### Monorepo Structure

```
miley/
├── apps/
│   └── cli/                          # Main CLI application (entry point)
│       └── src/
│           ├── Application.ts        # App bootstrap, env/config watchers
│           ├── services/
│           │   ├── ConfigService.ts   # MileyConfig loading, validation, hot-reload
│           │   └── WorkerService.ts   # EdgeWorker lifecycle management
│           └── config/
│               └── constants.ts      # Default port (3457), env var names
├── packages/
│   ├── core/                         # Shared types, schemas, session management
│   │   └── src/
│   │       ├── config-schemas.ts     # Zod schemas: MileyConfig, EdgeConfig, RepositoryConfig
│   │       ├── config-types.ts       # EdgeWorkerConfig, runtime-only types
│   │       ├── MileyAgentSession.ts  # Session types, Workspace, IssueContext
│   │       └── PersistenceManager.ts # Session state serialization (v4.0 format)
│   ├── edge-worker/                  # Core orchestration engine
│   │   └── src/
│   │       ├── EdgeWorker.ts         # Main orchestrator (~5000 lines)
│   │       ├── AgentSessionManager.ts
│   │       ├── SessionConfigurator.ts # Extensibility point for per-session config
│   │       ├── GitService.ts         # Worktree creation, reuse, preferLocalBranch
│   │       ├── ConfigManager.ts      # Config file watching, hot-reload
│   │       ├── ActivityPoster.ts     # Linear activity posting
│   │       ├── RunnerSelectionService.ts
│   │       ├── RepositoryRouter.ts   # Issue-to-repo routing
│   │       ├── AskUserQuestionHandler.ts
│   │       ├── GlobalSessionRegistry.ts
│   │       ├── prompt-assembly/
│   │       │   ├── buildInitialPrompt.ts  # Simple issue-to-prompt (no subroutines)
│   │       │   └── types.ts
│   │       ├── removed-package-stubs.ts   # Type stubs for stripped packages
│   │       └── sinks/
│   │           └── IActivitySink.ts
│   ├── claude-runner/                # Claude Code SDK execution wrapper
│   │   └── src/
│   │       ├── ClaudeRunner.ts       # SDK session management, CLAUDECODE stripping
│   │       └── SimpleClaudeRunner.ts
│   ├── linear-event-transport/       # Linear webhook receiving + OAuth
│   └── config-updater/              # HTTP API for remote config updates
├── skills/                          # Shared skills (f1-test-drive)
├── .claude/
│   ├── skills/                      # Claude Code skills (f1-test-drive, release, google)
│   └── agents/                      # Subagent definitions
└── spec/                            # Design specs
```

### Session Pipeline

Miley's simplified pipeline (vs Cyrus's classification/subroutine system):

```
Linear webhook (issue assigned)
  -> EdgeWorker.handleAgentSessionCreated()
  -> RepositoryRouter.determineRepository()
  -> SessionConfigurator.configure()          # appendInstruction + tool policy
  -> GitService.createGitWorktree()           # project-local .worktrees/ or preferLocalBranch
  -> buildInitialPrompt()                     # issue title/description + appendInstruction
  -> ClaudeRunner.createSession()             # SDK with superpowers plugin
  -> Activity updates stream back to Linear
```

### Key Design Decisions

- **No classification**: Issues go straight to Claude Code. No ProcedureAnalyzer, no subroutine routing
- **appendInstruction**: Repository-specific instructions delivered via `<repository-specific-instruction>` XML block in the user prompt
- **SessionConfigurator**: Extensibility point (`DefaultConfigurator` is pass-through; future implementations can inspect labels)
- **CLAUDECODE env var stripped**: Removed from child processes to prevent nested session errors when Miley runs inside a Claude Code session
- **Default runner forced to "claude"**: Other runners (gemini, codex, cursor) exist in schemas but Claude is the only active runner
- **Superpowers plugin**: Loaded via SDK `plugins` option for Skill tool registration
- **SessionStart hook**: `~/.claude/settings.json` injects superpowers context into sessions
- **Session resume**: `claudeSessionId` carry-forward gives Claude full conversation history from prior sessions on the same issue (oldest session ID used for maximum context)
- **Worktree reuse**: If a worktree already exists for a branch, it is reused rather than recreated
- **Project-local worktrees**: Stored in `<repositoryPath>/.worktrees/` (not a central worktree directory)

## Build and Test

```bash
# Install dependencies
pnpm install

# Build all packages (required before first run)
pnpm -r build
# or: pnpm build

# Run all tests
pnpm -r test
# or: pnpm test

# Run package tests only (excludes apps/)
pnpm test:packages:run

# Type checking
pnpm typecheck

# Lint (biome)
pnpm lint

# Fix lint + format
pnpm format

# Development mode (watch all packages)
pnpm dev
```

### Pre-commit Hooks

Husky runs on every commit:
1. `lint-staged` -- biome check on staged `.js/.jsx/.ts/.tsx/.json` files
2. `pnpm typecheck` -- full TypeScript type checking across the monorepo
3. JSON Schema sync check -- if `config-schemas.ts` changed, verifies generated schemas are up-to-date

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/config-schemas.ts` | All Zod schemas (MileyConfig, EdgeConfig, RepositoryConfig) |
| `packages/core/src/config-types.ts` | EdgeWorkerConfig (runtime config = EdgeConfig + runtime handlers) |
| `packages/edge-worker/src/EdgeWorker.ts` | Main orchestrator -- webhook handling, session lifecycle, runner config |
| `packages/edge-worker/src/SessionConfigurator.ts` | Session configuration extensibility interface |
| `packages/edge-worker/src/GitService.ts` | Worktree creation/reuse, preferLocalBranch logic |
| `packages/edge-worker/src/prompt-assembly/buildInitialPrompt.ts` | User prompt construction |
| `packages/edge-worker/src/removed-package-stubs.ts` | Type stubs for removed packages (GitHub, Slack, MCP tools, tunnel) |
| `packages/claude-runner/src/ClaudeRunner.ts` | Claude Code SDK wrapper, env var stripping, superpowers plugin loading |
| `apps/cli/src/services/ConfigService.ts` | MileyConfig loading, validation, format detection, hot-reload |
| `apps/cli/src/Application.ts` | Bootstrap, env file watcher, service initialization |

## Configuration

### MileyConfig Format (`~/.miley/config.json`)

Miley uses its own config schema (`MileyConfigSchema`) with three top-level blocks:

```json
{
  "server": {
    "port": 3457,
    "host": "0.0.0.0"
  },
  "linear": {
    "token": "lin_api_...",
    "workspaceId": "workspace-uuid",
    "workspaceName": "edwardhallam"
  },
  "repositories": [
    {
      "id": "repo-uuid",
      "name": "my-repo",
      "repositoryPath": "~/code/my-repo",
      "baseBranch": "main",
      "githubUrl": "https://github.com/user/repo",
      "preferLocalBranch": false,
      "teamKeys": ["TEAM"],
      "routingLabels": ["Miley"],
      "appendInstruction": "Additional instructions for Claude..."
    }
  ]
}
```

ConfigService auto-detects MileyConfig vs legacy EdgeConfig format and converts internally.

### Environment Variables (`~/.miley/.env`)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Required. Claude API key |
| `LINEAR_API_KEY` | Linear API token (used by MCP tools) |
| `MILEY_API_KEY` | API key for config-updater endpoints |
| `MILEY_SERVER_PORT` | Override server port (default: 3457) |
| `MILEY_HOST_EXTERNAL` | Set to `true` to bind 0.0.0.0 instead of localhost |
| `CLOUDFLARE_TOKEN` | Cloudflare Tunnel token for webhook delivery |
| `GITHUB_TOKEN` | GitHub token for PR operations |

### Adding a Repository

Add an entry to the `repositories` array in `~/.miley/config.json`:

```json
{
  "id": "unique-id",
  "name": "repo-name",
  "repositoryPath": "~/code/repo-name",
  "baseBranch": "main",
  "teamKeys": ["TEAM-KEY"],
  "routingLabels": ["Miley"],
  "appendInstruction": "You are working on repo-name. Follow the CLAUDE.md in the repo root."
}
```

Key fields:
- `teamKeys`: Linear team prefixes for routing (e.g., `["NEX"]` matches `NEX-123`)
- `routingLabels`: Linear labels that route issues to this repo
- `appendInstruction`: Injected into the user prompt as `<repository-specific-instruction>`
- `preferLocalBranch`: When `true`, work on a branch in the main repo instead of creating a worktree
- `mcpConfigPath`: Path(s) to `.mcp.json` files for MCP server configuration

## Deployment

- **Host**: Mac Studio
- **Port**: 3457
- **Service**: `com.miley.agent` (launchd)
- **Config directory**: `~/.miley/` (config.json, .env, logs/, state/)
- **Worktrees**: `<repositoryPath>/.worktrees/<issue-id>/`

### Service Management

```bash
# Start
launchctl load ~/Library/LaunchAgents/com.miley.agent.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.miley.agent.plist

# Restart
launchctl unload ~/Library/LaunchAgents/com.miley.agent.plist && launchctl load ~/Library/LaunchAgents/com.miley.agent.plist

# View logs
tail -f ~/.miley/logs/miley.log
```

### Hot-Reload

ConfigService watches `~/.miley/config.json` and `~/.miley/.env` for changes. Config changes are applied without restart. The EdgeWorker emits `configChanged` events for downstream services (RunnerSelectionService, ConfigManager).

## Troubleshooting

### Common Issues

**Session hangs on start**: Check that `CLAUDECODE` env var is being stripped in `ClaudeRunner.ts`. If Miley is launched from within a Claude Code session, the nested `CLAUDECODE` var causes the SDK to error.

**Superpowers/Skill tool not available**: Verify the plugins path in `EdgeWorker.ts` points to a valid superpowers plugin directory. The hardcoded path must match the installed version.

**Worktree creation fails**: Check that the repository has no uncommitted changes on the base branch. `git worktree add` requires a clean state. Also verify `.worktrees/` exists or can be created in the repository path.

**Config not loading**: ConfigService auto-detects format. If it fails, check that `config.json` has both `server` and `linear` top-level keys (MileyConfig format). Legacy EdgeConfig format (flat `repositories` array with per-repo `linearToken`) is still supported but converted internally.

**Session resume not working**: `claudeSessionId` carry-forward requires at least one previous session for the same issue. The oldest session ID is used (most accumulated context). Check `PersistenceManager` state files in `~/.miley/state/`.

### Logs

```bash
# Application logs
tail -f ~/.miley/logs/miley.log

# Set log level via env var
MILEY_LOG_LEVEL=DEBUG  # DEBUG, INFO, WARN, ERROR, SILENT
```

## Upstream Relationship

Miley is a deep fork of [ceedaragents/cyrus](https://github.com/ceedaragents/cyrus). Upstream changes can be cherry-picked selectively, but the classification/procedure system was intentionally removed and should not be re-imported. See `NOTICE` for Apache 2.0 attribution.

Removed upstream packages (stubs in `removed-package-stubs.ts`):
- `miley-github-event-transport`
- `miley-slack-event-transport`
- `miley-mcp-tools`
- `miley-cloudflare-tunnel-client`
- codex-runner, cursor-runner, gemini-runner, simple-agent-runner, f1 test framework

## Session Learnings (2026-03-17)

Critical discoveries from the initial Miley build-out session:

### SDK Plugin Loading
- `settingSources: ["user", "project", "local"]` loads skills into Claude's context but does NOT register them in the Skill tool registry (known bug #22171)
- The `plugins` option (`plugins: [{ type: "local", path: "..." }]`) DOES register skills in the Skill tool — required for superpowers
- Only pass the superpowers plugin (hardcoded path) — loading all 12+ plugins hangs the session
- The CLAUDECODE env var must be stripped (`CLAUDECODE: undefined`) to prevent "nested session" errors when spawning SDK sessions from a Claude Code terminal

### Session Resume
- `resume` parameter in the SDK works on completed sessions — session files persist at `~/.claude/projects/<encoded-cwd>/`
- Carry-forward logic in `carryForwardClaudeSessionId()` finds the OLDEST session for an issue (most context)
- The `initializeAgentRunner` path (initial assignment webhook) must pass `session.claudeSessionId` as `resumeSessionId` to `buildAgentRunnerConfig` — this was the missing link
- CWD must match between original and resumed sessions for the SDK to find the session file

### Worktree Lifecycle
- Miley merges but NEVER cleans up worktrees — n8n handles cleanup on schedule
- Worktree reuse: if `.worktrees/<ISSUE-ID>` already exists, reuse it
- The nightly cleanup workflow can eat Miley's own worktree mid-session — the "never cleanup" rule in miley-agent.md prevents this from Miley's side

### Skill Invocation
- Sparse issue descriptions trigger skill invocation; dense specs cause Claude to skip skills
- The superpowers SessionStart hook must be in `~/.claude/settings.json` (user-level, loads before project settings)
- Plugin hooks from `hooks.json` don't fire via settingSources — only via the `plugins` SDK option
- The `Skill` tool only resolves plugin-registered skills, not filesystem-discovered skills

### Config Architecture  
- appendInstruction is minimal: "You are Miley, an autonomous agent..."
- Per-repo behavior rules live in `.claude/rules/miley-agent.md`
- The rules file uses a conditional: "If you have not been told you are Miley, ignore this section"
- Config is hot-reloaded via ConfigService watching ~/.miley/config.json

### launchd
- Use `launchctl bootout/bootstrap` for clean restarts — `load/unload` caches stale state
- The plist must point to the source path directly (`~/code/miley/apps/cli/dist/src/app.js`), not the npm global symlink
- Default port changed from 3456 (Cyrus) to 3457
