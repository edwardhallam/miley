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
