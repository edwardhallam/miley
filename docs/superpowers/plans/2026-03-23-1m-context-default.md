# 1M Context Window Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-upgrade Claude model aliases to 1M context so Miley sessions get the full context window instead of 200K.

**Architecture:** A pure `normalizeClaudeModel()` function in its own module (extracted from EdgeWorker for testability) appends `[1m]` to known Claude aliases at the final output stage of `buildAgentRunnerConfig()`. Upstream model resolution (RunnerSelectionService comparisons) stays untouched. Note: the spec says "add to EdgeWorker.ts" but a separate module is better for isolated unit testing.

**Tech Stack:** TypeScript, Vitest, Claude Agent SDK

**Spec:** `docs/superpowers/specs/2026-03-23-1m-context-default-design.md`

---

### Task 1: Add normalizeClaudeModel unit tests

**Files:**
- Create: `packages/edge-worker/test/normalizeClaudeModel.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import { normalizeClaudeModel } from "../src/normalizeClaudeModel";

describe("normalizeClaudeModel", () => {
	it("appends [1m] to bare opus alias", () => {
		expect(normalizeClaudeModel("opus")).toBe("opus[1m]");
	});

	it("appends [1m] to bare sonnet alias", () => {
		expect(normalizeClaudeModel("sonnet")).toBe("sonnet[1m]");
	});

	it("appends [1m] to bare haiku alias", () => {
		expect(normalizeClaudeModel("haiku")).toBe("haiku[1m]");
	});

	it("does not double-suffix opus[1m]", () => {
		expect(normalizeClaudeModel("opus[1m]")).toBe("opus[1m]");
	});

	it("does not double-suffix sonnet[1m]", () => {
		expect(normalizeClaudeModel("sonnet[1m]")).toBe("sonnet[1m]");
	});

	it("does not double-suffix haiku[1m]", () => {
		expect(normalizeClaudeModel("haiku[1m]")).toBe("haiku[1m]");
	});

	it("preserves original casing while appending", () => {
		expect(normalizeClaudeModel("Opus")).toBe("Opus[1m]");
	});

	it("passes through full model IDs without suffix", () => {
		expect(normalizeClaudeModel("claude-opus-4-6")).toBe("claude-opus-4-6");
	});

	it("passes through full model IDs case-insensitively", () => {
		expect(normalizeClaudeModel("Claude-opus-4-6")).toBe("Claude-opus-4-6");
	});

	it("passes through non-Claude models unchanged", () => {
		expect(normalizeClaudeModel("gemini-2.5-pro")).toBe("gemini-2.5-pro");
	});

	it("passes through unknown strings unchanged", () => {
		expect(normalizeClaudeModel("gpt-5.3-codex")).toBe("gpt-5.3-codex");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter miley-edge-worker test:run -- normalizeClaudeModel`
Expected: FAIL — module `../src/normalizeClaudeModel` does not exist

---

### Task 2: Implement normalizeClaudeModel

**Files:**
- Create: `packages/edge-worker/src/normalizeClaudeModel.ts`

- [ ] **Step 1: Write the implementation**

```typescript
/** Claude model aliases eligible for automatic 1M context upgrade */
const CLAUDE_1M_ALIASES = new Set(["opus", "sonnet", "haiku"]);

/**
 * Append [1m] suffix to known Claude model aliases for 1M context window.
 * Full model IDs (e.g., claude-opus-4-6) pass through unchanged — this
 * serves as an escape hatch for explicitly requesting 200K context.
 */
export function normalizeClaudeModel(model: string): string {
	const lower = model.toLowerCase();
	if (lower.includes("[1m]") || lower.includes("claude-")) return model;
	if (CLAUDE_1M_ALIASES.has(lower)) return `${model}[1m]`;
	return model;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter miley-edge-worker test:run -- normalizeClaudeModel`
Expected: All 11 tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/edge-worker/src/normalizeClaudeModel.ts packages/edge-worker/test/normalizeClaudeModel.test.ts
git commit -m "feat(edge-worker): add normalizeClaudeModel for 1M context"
```

---

### Task 3: Wire normalizer into EdgeWorker.buildAgentRunnerConfig

**Files:**
- Modify: `packages/edge-worker/src/EdgeWorker.ts`

- [ ] **Step 1: Import normalizeClaudeModel at the top of EdgeWorker.ts**

Add to the imports section:

```typescript
import { normalizeClaudeModel } from "./normalizeClaudeModel";
```

- [ ] **Step 2: Apply normalizer after finalModel computation**

Find the `const finalModel = modelOverride || repository.model || ...` block in `buildAgentRunnerConfig()`. Immediately after it (before the `// When disallowAllTools` comment), add:

```typescript
// Auto-upgrade Claude model aliases to 1M context window
const effectiveModel =
    runnerType === "claude" ? normalizeClaudeModel(finalModel) : finalModel;
```

- [ ] **Step 3: Replace finalModel with effectiveModel in config.model**

In the `const config = { ... }` object below, find the line:

```typescript
model: finalModel,
```

Change it to:

```typescript
model: effectiveModel,
```

- [ ] **Step 4: Add comment to fallbackModel line to document intentional exclusion**

Find the `fallbackModel:` property in the same config object. Add a comment:

```typescript
// Intentionally NOT normalized — fallback stays at 200K per design decision
fallbackModel:
    fallbackModelOverride ||
    repository.fallbackModel ||
    this.getDefaultFallbackModelForRunner(runnerType),
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/edge-worker/src/EdgeWorker.ts
git commit -m "feat(edge-worker): wire 1M context normalizer into buildAgentRunnerConfig"
```

---

### Task 4: Update ClaudeRunner.ts fallback

**Files:**
- Modify: `packages/claude-runner/src/ClaudeRunner.ts`

- [ ] **Step 1: Change the fallback model**

Find the line in the `queryOptions` object:

```typescript
model: this.config.model || "opus",
```

Change it to:

```typescript
model: this.config.model || "opus[1m]",
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `pnpm test:packages:run`
Expected: All tests pass (the fallback is dead code so no existing test should break)

- [ ] **Step 4: Commit**

```bash
git add packages/claude-runner/src/ClaudeRunner.ts
git commit -m "feat(claude-runner): update fallback model to opus[1m]"
```

---

### Task 5: Merge to main, build, deploy, and verify

**Prerequisite:** Tasks 1-4 must be complete and all tests passing.

**Important:** Miley's launchd plist points to `~/code/miley/apps/cli/dist/src/app.js` (the primary repo, not the worktree). The worktree branch must be merged to main and built from the primary repo for the deployed service to pick up changes.

- [ ] **Step 1: Merge worktree branch to main**

```bash
git fetch origin main && git rebase origin/main
git -C /Users/edwardhallam/code/miley merge worktree-crispy-scribbling-quasar
git -C /Users/edwardhallam/code/miley push origin main
```

- [ ] **Step 2: Build all packages from primary repo**

```bash
cd /Users/edwardhallam/code/miley && pnpm -r build
```
Expected: Clean build, no errors

- [ ] **Step 3: Restart Miley service**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.miley.agent.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.miley.agent.plist
```
Expected: Service restarts cleanly

- [ ] **Step 4: Verify service is running**

Run: `curl -s http://localhost:3457/status | python3 -m json.tool`
Expected: Status response with uptime

- [ ] **Step 5: Create a Linear test issue and tag Miley**

Create an issue in the NEX team with title like "Test: verify 1M context window" and assign to Miley (or @mention). Include `[model=opus]` in the description to verify tag normalization.

- [ ] **Step 6: Wait for session to start, then check the session transcript**

After Miley picks up the issue:
1. Find the session JSONL in `~/.claude/projects/` for the worktree path
2. Check `modelUsage` result blocks for `context_window` — should be `1000000` (not `200000`)
3. Check that the model field shows the `[1m]` suffix

Note: verification items 3 and 5 from the spec (tag normalization in logs, session resume) are manual-only by design — this is low-risk/self-verify QA tier.

- [ ] **Step 7: Verify no early compaction**

If the session is long enough, confirm compaction does NOT trigger at ~170K tokens. If the session is short, absence of any `compact_boundary` message is acceptable evidence.
