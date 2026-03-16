import type {
	IAgentProgressEvent,
	ISimpleAgentQueryOptions,
	ISimpleAgentResult,
	ISimpleAgentRunner,
	ISimpleAgentRunnerConfig,
	SDKMessage,
} from "cyrus-core";
import {
	InvalidResponseError,
	SimpleAgentError,
	SimpleAgentErrorCode,
} from "./simple-agent-errors.js";

/**
 * Abstract base class for simple agent runners that return enumerated responses.
 * Ported from the removed simple-agent-runner package.
 */
export abstract class SimpleAgentRunner<T extends string>
	implements ISimpleAgentRunner<T>
{
	protected readonly config: ISimpleAgentRunnerConfig<T>;
	protected readonly validResponseSet: Set<T>;

	constructor(config: ISimpleAgentRunnerConfig<T>) {
		if (!config.validResponses || config.validResponses.length === 0) {
			throw new SimpleAgentError(
				SimpleAgentErrorCode.INVALID_CONFIG,
				"validResponses must be a non-empty array",
			);
		}
		if (!config.cyrusHome) {
			throw new SimpleAgentError(
				SimpleAgentErrorCode.INVALID_CONFIG,
				"cyrusHome is required",
			);
		}
		this.config = config;
		this.validResponseSet = new Set(config.validResponses);
	}

	async query(
		prompt: string,
		options?: ISimpleAgentQueryOptions,
	): Promise<ISimpleAgentResult<T>> {
		const startTime = Date.now();

		try {
			const timeoutPromise = this.config.timeoutMs
				? new Promise<never>((_, reject) => {
						setTimeout(() => {
							reject(
								new SimpleAgentError(
									SimpleAgentErrorCode.TIMEOUT,
									`Operation timed out after ${this.config.timeoutMs}ms`,
								),
							);
						}, this.config.timeoutMs);
					})
				: null;

			const executionPromise = this.executeAgent(prompt, options);
			const messages = timeoutPromise
				? await Promise.race([executionPromise, timeoutPromise])
				: await executionPromise;

			const response = this.extractResponse(messages);
			if (!this.isValidResponse(response)) {
				throw new InvalidResponseError(
					response,
					Array.from(this.validResponseSet),
				);
			}

			const durationMs = Date.now() - startTime;
			const sessionId = messages[0]?.session_id || null;
			const resultMessage = messages.find((m) => m.type === "result");
			const costUSD =
				resultMessage?.type === "result"
					? resultMessage.total_cost_usd
					: undefined;

			return {
				response: response as T,
				messages,
				sessionId,
				durationMs,
				costUSD,
			};
		} catch (error) {
			if (error instanceof SimpleAgentError) {
				throw error;
			}
			throw new SimpleAgentError(
				SimpleAgentErrorCode.SESSION_ERROR,
				error instanceof Error ? error.message : String(error),
				{ originalError: error },
			);
		}
	}

	protected isValidResponse(response: string): response is T {
		return this.validResponseSet.has(response as T);
	}

	protected buildSystemPrompt(): string {
		const basePrompt = this.config.systemPrompt || "";
		const validResponsesStr = Array.from(this.validResponseSet)
			.map((r) => `"${r}"`)
			.join(", ");

		return `${basePrompt}\n\nIMPORTANT: You must respond with EXACTLY one of the following values:\n${validResponsesStr}\n\nYour final response MUST be one of these exact strings, with no additional text, explanation, or formatting.\nDo not use markdown, code blocks, or quotes around your response.\nSimply output the chosen value as your final answer.\n`;
	}

	protected emitProgress(event: IAgentProgressEvent): void {
		if (this.config.onProgress) {
			this.config.onProgress(event);
		}
	}

	protected abstract executeAgent(
		prompt: string,
		options?: ISimpleAgentQueryOptions,
	): Promise<SDKMessage[]>;

	protected abstract extractResponse(messages: SDKMessage[]): string;
}
