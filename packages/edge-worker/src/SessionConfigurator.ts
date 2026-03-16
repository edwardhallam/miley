import type { RepositoryConfig } from "miley-core";

/**
 * Configuration produced by a SessionConfigurator.
 *
 * Controls per-session behavior: additional instructions appended to the
 * prompt and the tool-access policy for the session.
 */
export interface SessionConfig {
	/** Extra instruction text appended to the user prompt. */
	appendInstruction?: string;
	/** Tool access policy — a list of tool names, or a preset. */
	allowedTools?: string[] | "all" | "safe" | "readOnly";
}

/**
 * Extension point for customising session configuration before launch.
 *
 * Implementations inspect the incoming issue metadata and repository
 * config and return a SessionConfig that the launch path applies. In v1
 * the DefaultConfigurator is a pass-through; future implementations
 * (e.g. LabelConfigurator) can inspect labels to modify behaviour.
 */
export interface SessionConfigurator {
	configure(
		issue: { title: string; description: string; labels: string[] },
		repoConfig: RepositoryConfig,
	): SessionConfig;
}

/**
 * Default (pass-through) configurator.
 *
 * Returns the repository's appendInstruction unchanged and grants access
 * to all tools. This preserves existing behaviour while providing the
 * extensibility seam.
 */
export class DefaultConfigurator implements SessionConfigurator {
	configure(
		_issue: { title: string; description: string; labels: string[] },
		repoConfig: RepositoryConfig,
	): SessionConfig {
		return {
			appendInstruction: repoConfig.appendInstruction,
			allowedTools: "all",
		};
	}
}
