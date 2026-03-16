export interface MileyToolsOptions {
	parentSessionId?: string;
	onSessionCreated?: (childSessionId: string, parentId: string) => void;
	onFeedbackDelivery?: (
		childSessionId: string,
		message: string,
	) => Promise<boolean>;
}
export function createMileyToolsServer(
	_client: any,
	_options?: MileyToolsOptions,
): { server: any } {
	return { server: null };
}
