import type { SDKMessage } from "miley-core";

/**
 * Error codes for SimpleAgentRunner operations
 */
export enum SimpleAgentErrorCode {
	INVALID_RESPONSE = "INVALID_RESPONSE",
	TIMEOUT = "TIMEOUT",
	NO_RESPONSE = "NO_RESPONSE",
	SESSION_ERROR = "SESSION_ERROR",
	INVALID_CONFIG = "INVALID_CONFIG",
	ABORTED = "ABORTED",
	MAX_TURNS_EXCEEDED = "MAX_TURNS_EXCEEDED",
}

export class SimpleAgentError extends Error {
	constructor(
		public readonly code: SimpleAgentErrorCode,
		message: string,
		public readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "SimpleAgentError";
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, SimpleAgentError);
		}
	}
}

export class InvalidResponseError extends SimpleAgentError {
	constructor(
		public readonly receivedResponse: string,
		public readonly validResponses: readonly string[],
	) {
		super(
			SimpleAgentErrorCode.INVALID_RESPONSE,
			`Agent returned invalid response: "${receivedResponse}". Valid responses: [${validResponses.join(", ")}]`,
			{ receivedResponse, validResponses },
		);
		this.name = "InvalidResponseError";
	}
}

export class NoResponseError extends SimpleAgentError {
	constructor(public readonly messages: SDKMessage[]) {
		super(
			SimpleAgentErrorCode.NO_RESPONSE,
			"Agent completed without producing a valid response",
			{ messageCount: messages.length },
		);
		this.name = "NoResponseError";
	}
}

export class SessionError extends SimpleAgentError {
	constructor(
		public readonly cause: Error,
		public readonly messages?: SDKMessage[],
	) {
		super(
			SimpleAgentErrorCode.SESSION_ERROR,
			`Agent session error: ${cause.message}`,
			{ cause: cause.message, stack: cause.stack },
		);
		this.name = "SessionError";
	}
}
