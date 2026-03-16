import type { Issue, RepositoryConfig } from "miley-core";

/**
 * Build the initial user prompt for a new session.
 *
 * This is the single entry point for constructing the issue prompt that
 * gets sent to Claude Code on session creation. The format is intentionally
 * simple — repository-specific instructions are delivered via the system
 * prompt (appendInstruction → appendSystemPrompt), not inlined here.
 *
 * @param issue  Full Linear issue (title + description)
 * @param repo   Primary repository configuration
 * @returns      The assembled user prompt string
 */
export function buildInitialPrompt(
	issue: Issue,
	repo: RepositoryConfig,
): string {
	const parts: string[] = [
		"Here is a Linear issue assigned to you:",
		"",
		`Title: ${issue.title}`,
	];

	if (issue.description) {
		parts.push(`Description: ${issue.description}`);
	}

	if (repo.appendInstruction) {
		parts.push("");
		parts.push(`<repository-specific-instruction repository="${repo.name}">`);
		parts.push(repo.appendInstruction);
		parts.push("</repository-specific-instruction>");
	}

	return parts.join("\n");
}
