# Enable 1M Context Window for Miley Sessions

**Date**: 2026-03-23
**Status**: Approved
**Linear**: Related to NEX-492 investigation, NEX-612 (SDK updates)

## Problem

Miley passes `model: "opus"` to the Claude Agent SDK, which resolves to Opus 4.6 with a **200K** context window. The `opus[1m]` alias is required for the 1M window. NEX-492 confirmed this: compaction triggered at 170,114 tokens (textbook 200K threshold), and the API reported `context_window: 200000`.

## Decision

Auto-upgrade all Claude model aliases to 1M context via a normalizer function at the `buildAgentRunnerConfig` chokepoint. This catches all model resolution paths: hardcoded defaults, per-repo config, and `[model=X]` Linear description tags.

Fallback model stays at 200K (`sonnet`) — rate-limit fallback scenarios don't need the full window.

Full model IDs (e.g., `claude-opus-4-6`) pass through without `[1m]` — this serves as an escape hatch for explicitly requesting 200K.

## Changes

### 1. Add `normalizeClaudeModel()` to EdgeWorker.ts

Pure function that appends `[1m]` to known Claude aliases (`opus`, `sonnet`, `haiku`) that don't already have it. Passes through full model IDs and already-suffixed aliases.

```typescript
const CLAUDE_1M_ALIASES = new Set(["opus", "sonnet", "haiku"]);

function normalizeClaudeModel(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("[1m]") || lower.includes("claude-")) return model;
  if (CLAUDE_1M_ALIASES.has(lower)) return `${model}[1m]`;
  return model;
}
```

### 2. Apply normalizer in `buildAgentRunnerConfig()`

After computing `finalModel` (~line 4585-4588), wrap it for the claude runner:

```typescript
const effectiveModel = runnerType === "claude"
  ? normalizeClaudeModel(finalModel)
  : finalModel;
```

Use `effectiveModel` (not `finalModel`) when setting `config.model` at line 4626.

The fallback model is **not** normalized — it stays at the raw alias per the design decision.

### 3. Update ClaudeRunner.ts fallback

Change line 422 from `this.config.model || "opus"` to `this.config.model || "opus[1m]"`. This fallback is dead code (EdgeWorker always provides model), but prevents 200K if ClaudeRunner is ever used standalone.

## Why defaults in RunnerSelectionService stay as bare aliases

Spec review identified that `inferFallbackModel()` and `inferRunnerFromModel()` in `RunnerSelectionService.ts` use exact string equality against bare aliases (`"opus"`, `"sonnet"`, etc.). Pushing `"opus[1m]"` into `getDefaultModelForRunner()` would contaminate these comparisons, causing silent mismatches in fallback model resolution.

The normalizer is applied **late** — at the `buildAgentRunnerConfig` output, after all runner selection and fallback inference has completed using bare aliases. This keeps the existing comparison logic intact.

## Files Modified

| File | Change |
|------|--------|
| `packages/edge-worker/src/EdgeWorker.ts` | Add `normalizeClaudeModel()`, apply to `finalModel` in `buildAgentRunnerConfig()` |
| `packages/claude-runner/src/ClaudeRunner.ts` | Change fallback from `"opus"` to `"opus[1m]"` |

## What stays unchanged

- `RunnerSelectionService.ts` — defaults remain bare aliases to preserve `inferFallbackModel`/`inferRunnerFromModel` comparisons
- Config schemas (`config-schemas.ts`) — no new fields
- `~/.miley/config.json` — no config changes needed
- `~/.miley/.env` — no env vars needed
- Fallback model — stays `"sonnet"` (200K)
- Non-Claude runners (gemini, codex, cursor) — untouched

## Verification

1. Start a session and confirm `model` in the SDK init message shows the `[1m]` suffix
2. Check `context_window` in `modelUsage` result blocks — should report 1M
3. Verify a `[model=opus]` description tag gets normalized to `opus[1m]` in logs
4. Verify `[model=claude-opus-4-6]` passes through without `[1m]` (escape hatch)
5. Verify resumed sessions still work (model alias change doesn't affect session ID lookup)
6. Run a session long enough to confirm compaction does NOT trigger at ~170K tokens

## Unit tests for `normalizeClaudeModel()`

| Input | Expected Output |
|-------|-----------------|
| `"opus"` | `"opus[1m]"` |
| `"sonnet"` | `"sonnet[1m]"` |
| `"haiku"` | `"haiku[1m]"` |
| `"opus[1m]"` | `"opus[1m]"` (no double-suffix) |
| `"Opus"` | `"Opus[1m]"` (preserves original casing) |
| `"claude-opus-4-6"` | `"claude-opus-4-6"` (full ID passthrough) |
| `"Claude-opus-4-6"` | `"Claude-opus-4-6"` (case-insensitive guard) |
| `"gemini-2.5-pro"` | `"gemini-2.5-pro"` (non-Claude passthrough) |

## Risk Assessment

- **Risk**: Low — model alias change only, no data flow or API contract changes
- **Complexity**: Low — 2 files, ~12 lines changed
- **QA**: Self-verify. Unit test the normalizer. Run a test session, check init message and modelUsage for context_window value.
