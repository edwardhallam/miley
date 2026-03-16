export interface CyrusToolsOptions {
	parentSessionId?: string;
	onSessionCreated?: (childSessionId: string, parentId: string) => void;
	onFeedbackDelivery?: (
		childSessionId: string,
		message: string,
	) => Promise<boolean>;
}
export function createCyrusToolsServer(
	_client: any,
	_options?: CyrusToolsOptions,
): { server: any } {
	return { server: null };
}
