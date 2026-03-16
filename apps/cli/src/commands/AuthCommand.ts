import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BaseCommand } from "./ICommand.js";

const getMileyAppUrl = () =>
	process.env.MILEY_APP_URL || "https://app.atmiley.com";

/**
 * Auth command - authenticate with Miley Pro plan using auth key
 */
export class AuthCommand extends BaseCommand {
	async execute(args: string[]): Promise<void> {
		// Get auth key from command line arguments
		const authKey = args[0];

		if (
			!authKey ||
			typeof authKey !== "string" ||
			authKey.trim().length === 0
		) {
			this.logError("Error: Auth key is required");
			console.log("\nUsage: miley auth <auth-key>");
			console.log(
				`\nGet your auth key from: ${getMileyAppUrl()}/onboarding/auth-miley`,
			);
			process.exit(1);
		}

		console.log("\n🔑 Authenticating with Miley...");
		this.logDivider();

		try {
			// Call the config API to get credentials
			console.log("Validating auth key...");
			const configUrl = `${getMileyAppUrl()}/api/config?auth_key=${encodeURIComponent(authKey)}`;
			const response = await fetch(configUrl);
			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Config API request failed: ${response.status} ${response.statusText} - ${errorText}`,
				);
			}
			const configResponse = (await response.json()) as {
				success: boolean;
				config?: { cloudflareToken: string; apiKey: string };
				error?: string;
			};

			if (
				!configResponse.success ||
				!configResponse.config?.cloudflareToken ||
				!configResponse.config?.apiKey
			) {
				this.logError("Authentication failed");
				console.error(configResponse.error || "Invalid response from server");
				console.log("\nPlease verify your auth key is correct.");
				console.log(
					`Get your auth key from: ${getMileyAppUrl()}/onboarding/auth-miley`,
				);
				process.exit(1);
			}

			this.logSuccess("Authentication successful!");

			// Ensure MILEY_HOME directory exists
			if (!existsSync(this.app.mileyHome)) {
				mkdirSync(this.app.mileyHome, { recursive: true });
			}

			// Store tokens in ~/.miley/.env file
			const envPath = resolve(this.app.mileyHome, ".env");
			const envContent = `# Miley Authentication Credentials
# Generated on ${new Date().toISOString()}
CLOUDFLARE_TOKEN=${configResponse.config!.cloudflareToken}
MILEY_API_KEY=${configResponse.config!.apiKey}
MILEY_SETUP_PENDING=true
`;

			writeFileSync(envPath, envContent, "utf-8");
			this.logSuccess(`Credentials saved to ${envPath}`);

			// Reload environment variables to pick up MILEY_SETUP_PENDING
			const dotenv = await import("dotenv");
			dotenv.config({ path: envPath, override: true });

			console.log("\n✨ Setup complete! Starting Miley...");
			this.logDivider();
			console.log();

			// Start the edge app with the new configuration
			// Import StartCommand to avoid circular dependency
			const { StartCommand } = await import("./StartCommand.js");
			const startCommand = new StartCommand(this.app);
			await startCommand.execute([]);
		} catch (error) {
			this.logError("Authentication failed:");
			console.error((error as Error).message);
			console.log(
				"\nPlease try again or contact support if the issue persists.",
			);
			process.exit(1);
		}
	}
}
