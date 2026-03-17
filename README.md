# Miley

> **Fork notice:** Miley is a derivative work of [Cyrus](https://github.com/ceedaragents/cyrus) by [Ceedar](https://ceedaragents.com), licensed under the Apache License 2.0. See [NOTICE](NOTICE) for attribution details.

A self-hosted Linear-to-Claude Code bridge agent. Miley monitors Linear issues assigned to it, creates isolated git worktrees for each issue, runs Claude Code sessions to process them, and streams activity updates back to Linear.

## Why Miley Exists

[Cyrus](https://github.com/ceedaragents/cyrus) is a powerful multi-runner agent framework with a full classification engine, procedure system, and support for Gemini, Codex, and Cursor alongside Claude. For a single-user setup running only Claude Code, most of that machinery is unnecessary complexity.

Miley strips the classification/procedure pipeline and lets Claude Code + skills handle all routing natively. The result is a simpler architecture with fewer moving parts:

| Concern | Cyrus | Miley |
|---------|-------|-------|
| Issue classification | ProcedureAnalyzer classifies as code/question/research/etc. | None -- issues go straight to Claude Code |
| Workflow routing | Subroutines (coding-activity, verifications, git-gh, concise-summary) | Claude Code skills handle workflow |
| Prompt construction | PromptBuilder with label-based system prompts, subroutine templates | `buildInitialPrompt()` -- issue + appendInstruction |
| Runner support | Claude, Gemini, Codex, Cursor | Claude only (runner schemas preserved, others inactive) |
| Platform integrations | Linear, Slack, GitHub webhooks | Linear only (GitHub/Slack stubs for compilation) |
| Session configuration | Labels -> procedure -> subroutine chain | SessionConfigurator interface (pass-through default) |
| Hosting model | Cloud-hosted (Ceedar) or self-hosted | Self-hosted only |

## Architecture

### Cyrus Pipeline (Upstream)

```
Webhook -> EdgeWorker -> ProcedureAnalyzer
                            |
                            v
                      Classification (code/question/research/...)
                            |
                            v
                      Procedure selection (full-development, question-answer, ...)
                            |
                            v
                      Subroutine chain (coding-activity -> verifications -> git-gh -> summary)
                            |
                            v
                      PromptBuilder (label-based system prompt + subroutine template)
                            |
                            v
                      Runner (Claude/Gemini/Codex/Cursor)
```

### Miley Pipeline

```
Webhook -> EdgeWorker -> SessionConfigurator
                            |
                            v
                      buildInitialPrompt (issue + appendInstruction)
                            |
                            v
                      GitService (worktree creation/reuse)
                            |
                            v
                      ClaudeRunner (SDK session with superpowers plugin)
```

No classification step. No subroutine chain. No multi-runner dispatch. Claude Code receives the issue and handles everything via its own skills and CLAUDE.md instructions.

### Monorepo Packages

| Package | Purpose |
|---------|---------|
| `apps/cli` | Main CLI application -- bootstrap, config loading, service wiring |
| `packages/core` | Shared types, Zod schemas (MileyConfig, EdgeConfig), session management, persistence |
| `packages/edge-worker` | Core orchestration -- webhook handling, session lifecycle, git worktrees, prompt assembly |
| `packages/claude-runner` | Claude Code SDK wrapper -- session creation, env var management, plugin loading |
| `packages/linear-event-transport` | Linear webhook receiving, OAuth token management |
| `packages/config-updater` | HTTP API endpoints for remote configuration updates |

## What Was Kept (and Why)

**Session lifecycle** (`AgentSessionManager`, `MileyAgentSession`, `PersistenceManager`): The session tracking system is essential -- it maps Linear issues to running Claude Code processes, handles mid-session user prompts, and persists state across restarts.

**Webhook infrastructure** (`LinearEventTransport`, `EdgeWorker` webhook handlers): The Linear webhook plumbing is the core value of the project. Receiving assignment events, routing to repositories, and streaming activity back to Linear are all preserved.

**AskUserQuestion** (`AskUserQuestionHandler`): Allows Claude Code sessions to pause and ask the user a question via Linear, then resume with the answer. This interactive loop is critical for autonomous operation.

**Git worktree management** (`GitService`): Issue isolation via worktrees is fundamental. Enhanced with project-local worktrees (`.worktrees/` inside each repo), worktree reuse, and `preferLocalBranch` mode.

**Session resume** (`claudeSessionId` carry-forward): When a new session starts for an issue that already had a previous session, the previous session's Claude session ID is carried forward. This gives Claude full conversation history so it doesn't redo completed work.

**Config hot-reload** (`ConfigService`, `ConfigManager`): Config file watching and live reloading without restart.

**User access control** (`UserAccessControl`): Whitelist/blacklist Linear users from triggering sessions.

**Activity posting** (`ActivityPoster`, `IActivitySink`): Streaming thoughts and actions back to Linear for visibility.

## What Was Removed (and Why)

**ProcedureAnalyzer** (classification engine): Cyrus classifies each issue as `code`, `question`, `research`, etc. and selects a procedure. Miley doesn't need this -- Claude Code with skills handles routing natively via its own judgment.

**Subroutines** (coding-activity, verifications, git-gh, concise-summary): The multi-step procedure chain is replaced by Claude Code's natural workflow. Skills like `/commit` and project CLAUDE.md files provide the same guidance without framework-level orchestration.

**PromptBuilder** (label-based system prompts): Cyrus builds elaborate system prompts based on issue labels (debugger, builder, scoper, orchestrator). Miley uses a simple `buildInitialPrompt()` that includes the issue and `appendInstruction`. Repository-specific instructions go in `appendInstruction`.

**Multi-runner support** (Gemini, Codex, Cursor runners): The runner schemas and types still exist in `core` for compatibility, but the actual runner packages were removed. Only `claude-runner` ships.

**Platform integrations** (Slack, GitHub): The `slack-event-transport`, `github-event-transport`, and `mcp-tools` packages were removed. Type stubs in `removed-package-stubs.ts` keep EdgeWorker compiling. These can be re-added from upstream if needed.

**F1 test framework**: Cyrus's end-to-end testing harness. Removed since Miley doesn't have the classification/procedure system it was designed to test.

**Cloud hosting infrastructure** (proxy app, OAuth flows, ngrok): Miley is self-hosted only, behind a Cloudflare Tunnel.

## Configuration

### config.json Schema

Miley uses the `MileyConfig` schema (`~/.miley/config.json`):

```json
{
  "server": {
    "port": 3457,
    "host": "0.0.0.0"
  },
  "linear": {
    "token": "lin_api_...",
    "workspaceId": "your-workspace-uuid",
    "workspaceName": "your-workspace"
  },
  "repositories": [
    {
      "id": "unique-repo-id",
      "name": "my-project",
      "repositoryPath": "~/code/my-project",
      "baseBranch": "main",
      "githubUrl": "https://github.com/user/my-project",
      "preferLocalBranch": false,
      "teamKeys": ["PROJ"],
      "routingLabels": ["Miley"],
      "appendInstruction": "Follow the CLAUDE.md in the repository root."
    }
  ],
  "defaultRunner": "claude"
}
```

#### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `server` | object | `port` (number) and `host` (string) for the webhook server |
| `linear` | object | `token`, `workspaceId`, `workspaceName` for Linear API access |
| `repositories` | array | Repository configurations (see below) |
| `defaultRunner` | string | Runner type (default: `"claude"`) |
| `claudeDefaultModel` | string | Default Claude model (e.g., `"opus"`, `"sonnet"`) |
| `defaultAllowedTools` | string[] | Tools allowed across all repositories |
| `defaultDisallowedTools` | string[] | Tools blocked across all repositories |
| `global_setup_script` | string | Script path run in new worktrees |
| `userAccessControl` | object | Global user whitelist/blacklist |

#### Repository Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the repository |
| `name` | string | Human-readable name |
| `repositoryPath` | string | Absolute path (supports `~`) |
| `baseBranch` | string | Default branch for worktree creation |
| `githubUrl` | string | GitHub URL for PR operations |
| `preferLocalBranch` | boolean | Work on branch instead of worktree (default: `false`) |
| `teamKeys` | string[] | Linear team prefixes for routing (e.g., `["NEX"]`) |
| `routingLabels` | string[] | Linear labels that route to this repo |
| `projectKeys` | string[] | Linear project keys for routing |
| `appendInstruction` | string | Extra instructions injected into prompts |
| `allowedTools` | string[] | Tools permitted for this repo |
| `disallowedTools` | string[] | Tools blocked for this repo |
| `mcpConfigPath` | string or string[] | Path(s) to `.mcp.json` files |
| `model` | string | Per-repo Claude model override |
| `isActive` | boolean | Enable/disable the repo |
| `userAccessControl` | object | Per-repo user whitelist/blacklist |

### .env Setup

Create `~/.miley/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
LINEAR_API_KEY=lin_api_...
MILEY_API_KEY=your-api-key-for-config-endpoints
GITHUB_TOKEN=ghp_...

# Optional
CLOUDFLARE_TOKEN=your-tunnel-token
MILEY_LOG_LEVEL=INFO
```

### appendInstruction

The `appendInstruction` field is the primary way to give Claude repository-specific context. It is injected into the user prompt wrapped in XML:

```xml
<repository-specific-instruction repository="my-project">
Your appendInstruction text here.
</repository-specific-instruction>
```

Use it for:
- Pointing Claude to the repo's CLAUDE.md
- Specifying coding conventions
- Defining PR/commit workflows
- Referencing project-specific skills

## How to Add a Repository

1. Generate a unique ID (UUID or descriptive slug)
2. Add the repository entry to `~/.miley/config.json`:

```json
{
  "id": "my-new-repo",
  "name": "my-new-repo",
  "repositoryPath": "~/code/my-new-repo",
  "baseBranch": "main",
  "teamKeys": ["MNR"],
  "routingLabels": ["Miley"],
  "appendInstruction": "Read the project CLAUDE.md before starting work."
}
```

3. Config hot-reload picks up the change (no restart needed)
4. Assign a Linear issue with team key `MNR-*` or label `Miley` to trigger routing

### Routing Priority

When an issue is assigned, `RepositoryRouter` determines the target repository:
1. `[repo=name]` description tag (explicit override)
2. `routingLabels` match on the issue's Linear labels
3. `teamKeys` match on the issue identifier prefix
4. `projectKeys` match on the issue's Linear project

## Upstream Review Process

Miley tracks upstream Cyrus releases via the `CHANGELOG.internal.md` which preserves the full Cyrus changelog history. To review upstream changes:

1. Check the [Cyrus releases](https://github.com/ceedaragents/cyrus/releases) for new versions
2. Review the changelog entries against Miley's current state
3. Cherry-pick relevant fixes/features (session management, webhook handling, Linear SDK updates)
4. Skip classification/procedure/multi-runner changes (intentionally removed)
5. Skip Slack/GitHub integration changes (packages removed)

When cherry-picking, watch for:
- Package name changes (`cyrus-*` -> `miley-*`)
- Removed package imports (use stubs in `removed-package-stubs.ts`)
- ProcedureAnalyzer references (should not be re-introduced)
- Multi-runner dispatch logic (keep Claude-only paths)

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm -r test

# Type checking
pnpm typecheck

# Lint
pnpm lint

# Development mode (watch)
pnpm dev
```

Pre-commit hooks run biome lint + typecheck automatically via Husky.

## License

This project is licensed under the Apache 2.0 license -- see the [LICENSE](LICENSE) file for details.

## Credits

- [Cyrus](https://github.com/ceedaragents/cyrus) by [Ceedar](https://ceedaragents.com) -- the upstream project Miley is forked from
- [Linear API](https://linear.app/developers)
- [Anthropic Claude Code](https://docs.anthropic.com/en/docs/claude-code)
