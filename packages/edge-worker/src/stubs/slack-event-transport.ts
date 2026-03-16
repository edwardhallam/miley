import { EventEmitter } from "node:events";

export interface SlackWebhookEvent {
	eventId: string;
	slackBotToken?: string;
	payload: {
		text: string;
		channel: string;
		user: string;
		ts: string;
		thread_ts?: string;
	};
}

export class SlackEventTransport extends EventEmitter {
	constructor(_config: any) {
		super();
	}
	register(): void {}
}

export class SlackMessageService {
	async getIdentity(_t: string): Promise<{ bot_id: string | undefined }> {
		return { bot_id: undefined };
	}
	async fetchThreadMessages(_o: any): Promise<any[]> {
		return [];
	}
	async postMessage(_o: any): Promise<void> {}
}

export class SlackReactionService {
	async addReaction(_o: any): Promise<void> {}
}

export function stripMention(text: string): string {
	return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}
