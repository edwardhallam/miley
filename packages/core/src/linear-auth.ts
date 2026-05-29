import { LinearClient } from "@linear/sdk";

function normalizeLinearToken(linearToken: string): string {
	const token = linearToken.trim().replace(/^Bearer\s+/i, "");
	if (!token) {
		throw new Error("Linear token is empty");
	}
	return token;
}

export function isLinearApiKey(linearToken: string): boolean {
	return normalizeLinearToken(linearToken).startsWith("lin_api_");
}

export function getLinearAuthorizationHeader(linearToken: string): string {
	const token = normalizeLinearToken(linearToken);
	return isLinearApiKey(token) ? token : `Bearer ${token}`;
}

export function createLinearClientFromToken(linearToken: string): LinearClient {
	const token = normalizeLinearToken(linearToken);
	return isLinearApiKey(token)
		? new LinearClient({ apiKey: token })
		: new LinearClient({ accessToken: token });
}
