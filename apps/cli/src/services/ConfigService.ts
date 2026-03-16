import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { MileyConfig } from "miley-core";
import {
	computeWorktreeBaseDir,
	MileyConfigSchema,
	migrateEdgeConfig,
} from "miley-core";
import type { EdgeConfig } from "../config/types.js";
import type { Logger } from "./Logger.js";

/**
 * Detect whether a raw JSON object is a MileyConfig (new format)
 * by checking for the distinctive top-level `server` and `linear` keys.
 */
function isMileyConfigFormat(raw: Record<string, unknown>): boolean {
	return (
		typeof raw.server === "object" &&
		raw.server !== null &&
		typeof raw.linear === "object" &&
		raw.linear !== null
	);
}

/**
 * Convert a validated MileyConfig to EdgeConfig for backward compatibility
 * with the rest of the codebase (EdgeWorker, PromptBuilder, etc.).
 *
 * Mapping:
 * - config.linear → linearWorkspaces[linear.workspaceId]
 * - config.server → serverPort/serverHost (set via EdgeWorkerRuntimeConfig, not here)
 * - repo.preferLocalBranch → preserved as-is (new field, consumed by GitService)
 * - workspaceBaseDir → computed from repositoryPath + /.worktrees/
 */
function mileyConfigToEdgeConfig(miley: MileyConfig): EdgeConfig {
	return {
		repositories: miley.repositories.map((repo) => ({
			id: repo.id,
			name: repo.name,
			repositoryPath: repo.repositoryPath,
			baseBranch: repo.baseBranch,
			githubUrl: repo.githubUrl,
			linearWorkspaceId: repo.linearWorkspaceId,
			teamKeys: repo.teamKeys,
			routingLabels: repo.routingLabels,
			projectKeys: repo.projectKeys,
			// Compute worktreeBaseDir from repositoryPath (the key schema change)
			workspaceBaseDir: computeWorktreeBaseDir(repo.repositoryPath),
			preferLocalBranch: repo.preferLocalBranch,
			isActive: repo.isActive,
			allowedTools: repo.allowedTools,
			disallowedTools: repo.disallowedTools,
			mcpConfigPath: repo.mcpConfigPath,
			appendInstruction: repo.appendInstruction,
			model: repo.model,
			fallbackModel: repo.fallbackModel,
			userAccessControl: repo.userAccessControl,
		})),
		// Map top-level linear block to the linearWorkspaces record format
		linearWorkspaces: {
			[miley.linear.workspaceId]: {
				linearToken: miley.linear.token,
				linearWorkspaceName: miley.linear.workspaceName,
			},
		},
		claudeDefaultModel: miley.claudeDefaultModel,
		claudeDefaultFallbackModel: miley.claudeDefaultFallbackModel,
		geminiDefaultModel: miley.geminiDefaultModel,
		codexDefaultModel: miley.codexDefaultModel,
		defaultRunner: miley.defaultRunner,
		global_setup_script: miley.global_setup_script,
		defaultAllowedTools: miley.defaultAllowedTools,
		defaultDisallowedTools: miley.defaultDisallowedTools,
		userAccessControl: miley.userAccessControl,
	};
}

/**
 * Service responsible for configuration management
 * Handles loading, saving, and validation of edge configuration.
 *
 * Supports two config formats:
 * - MileyConfig (new): has top-level `server` and `linear` blocks
 * - EdgeConfig (legacy): has `linearWorkspaces` record and `workspaceBaseDir` per-repo
 *
 * Both formats are converted to EdgeConfig internally for backward compatibility.
 */
export class ConfigService {
	private configPath: string;
	private _mileyConfig: MileyConfig | null = null;

	constructor(
		mileyHome: string,
		private logger: Logger,
	) {
		this.configPath = resolve(mileyHome, "config.json");
	}

	/**
	 * Get the configuration file path
	 */
	getConfigPath(): string {
		return this.configPath;
	}

	/**
	 * Get the MileyConfig if the config file uses the new format.
	 * Returns null if using the legacy EdgeConfig format.
	 */
	getMileyConfig(): MileyConfig | null {
		return this._mileyConfig;
	}

	/**
	 * Load edge configuration from disk.
	 * Detects and handles both MileyConfig (new) and EdgeConfig (legacy) formats.
	 */
	load(): EdgeConfig {
		let config: EdgeConfig = { repositories: [] };
		this._mileyConfig = null;

		if (existsSync(this.configPath)) {
			try {
				const content = readFileSync(this.configPath, "utf-8");
				const raw = JSON.parse(content);

				if (isMileyConfigFormat(raw)) {
					// New MileyConfig format
					const parseResult = MileyConfigSchema.safeParse(raw);
					if (parseResult.success) {
						this._mileyConfig = parseResult.data;
						config = mileyConfigToEdgeConfig(parseResult.data);
						this.logger.info("Loaded config (MileyConfig format)");
					} else {
						this.logger.error(
							`Invalid MileyConfig: ${parseResult.error.message}`,
						);
					}
				} else {
					// Legacy EdgeConfig format
					config = migrateEdgeConfig(raw) as EdgeConfig;
				}
			} catch (e) {
				this.logger.error(
					`Failed to load edge config: ${(e as Error).message}`,
				);
			}
		}

		// Strip promptTemplatePath from all repositories to ensure built-in template is used
		if (config.repositories) {
			config.repositories = config.repositories.map(
				(repo: EdgeConfig["repositories"][number]) => {
					const { promptTemplatePath, ...repoWithoutTemplate } = repo;
					if (promptTemplatePath) {
						this.logger.info(
							`Ignoring custom prompt template for repository: ${repo.name} (using built-in template)`,
						);
					}
					return repoWithoutTemplate;
				},
			);
		}

		// Run migrations on loaded config (only for legacy format)
		if (!this._mileyConfig) {
			config = this.migrateConfig(config);
		}

		return config;
	}

	/**
	 * Run migrations on config to ensure it's up to date
	 * Persists changes to disk if any migrations were applied
	 */
	private migrateConfig(config: EdgeConfig): EdgeConfig {
		let configModified = false;

		// Migration: Rename legacy global model fields to Claude-specific names
		// Keep old values but move them to the new keys and remove deprecated fields.
		if (config.defaultModel !== undefined) {
			if (!config.claudeDefaultModel) {
				config.claudeDefaultModel = config.defaultModel;
				this.logger.info(
					`[Migration] Moved "defaultModel" to "claudeDefaultModel"`,
				);
			}
			delete (config as EdgeConfig & { defaultModel?: string }).defaultModel;
			configModified = true;
		}

		if (config.defaultFallbackModel !== undefined) {
			if (!config.claudeDefaultFallbackModel) {
				config.claudeDefaultFallbackModel = config.defaultFallbackModel;
				this.logger.info(
					`[Migration] Moved "defaultFallbackModel" to "claudeDefaultFallbackModel"`,
				);
			}
			delete (config as EdgeConfig & { defaultFallbackModel?: string })
				.defaultFallbackModel;
			configModified = true;
		}

		// Migration: Add "Skill" to allowedTools arrays that don't have it
		// This enables Claude Skills functionality for existing configurations
		// See: https://code.claude.com/docs/en/skills
		// See: https://platform.claude.com/docs/en/agent-sdk/skills
		if (config.repositories) {
			for (const repo of config.repositories) {
				if (repo.allowedTools && Array.isArray(repo.allowedTools)) {
					if (!repo.allowedTools.includes("Skill")) {
						repo.allowedTools.push("Skill");
						configModified = true;
						this.logger.info(
							`[Migration] Added "Skill" to allowedTools for repository: ${repo.name}`,
						);
					}
				}
			}
		}

		// Persist changes if any migrations were applied
		if (configModified) {
			this.save(config);
			this.logger.info("[Migration] Configuration updated and saved to disk");
		}

		return config;
	}

	/**
	 * Save edge configuration to disk
	 */
	save(config: EdgeConfig): void {
		const configDir = dirname(this.configPath);

		// Ensure the ~/.miley directory exists
		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true });
		}

		writeFileSync(this.configPath, JSON.stringify(config, null, 2));
	}

	/**
	 * Update a specific field in the configuration
	 */
	update(updater: (config: EdgeConfig) => EdgeConfig): void {
		const config = this.load();
		const updated = updater(config);
		this.save(updated);
	}

	/**
	 * Check if configuration exists
	 */
	exists(): boolean {
		return existsSync(this.configPath);
	}
}
