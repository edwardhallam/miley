export class CloudflareTunnelClient {}
export function getCyrusAppUrl(): string {
	return process.env.CYRUS_APP_URL || "https://app.atcyrus.com";
}
export class ConfigApiClient {
	static async getConfig(_key: string): Promise<any> {
		return { success: false };
	}
	static isValid(_r: any): boolean {
		return false;
	}
}
