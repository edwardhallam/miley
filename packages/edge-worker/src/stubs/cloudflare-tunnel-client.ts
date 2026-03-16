export class CloudflareTunnelClient {}
export function getMileyAppUrl(): string {
	return process.env.MILEY_APP_URL || "https://app.atmiley.com";
}
export class ConfigApiClient {
	static async getConfig(_key: string): Promise<any> {
		return { success: false };
	}
	static isValid(_r: any): boolean {
		return false;
	}
}
