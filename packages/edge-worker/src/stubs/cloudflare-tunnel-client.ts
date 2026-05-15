export class CloudflareTunnelClient {}
export function getMileyAppUrl(): string {
	return process.env.MILEY_APP_URL || "https://app.atmiley.com";
}
export const ConfigApiClient = {
	async getConfig(_key: string): Promise<any> {
		return { success: false };
	},
	isValid(_r: any): boolean {
		return false;
	},
};
