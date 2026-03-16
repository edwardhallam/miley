import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		setupFiles: ["./test/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules",
				"test",
				"dist",
				"**/*.d.ts",
				"**/*.config.*",
				"**/mockData.ts",
			],
		},
		testTimeout: 30000,
		hookTimeout: 30000,
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@test": path.resolve(__dirname, "./test"),
			"miley-claude-runner": path.resolve(
				__dirname,
				"../claude-runner/src/index.ts",
			),
			"miley-config-updater": path.resolve(
				__dirname,
				"../config-updater/src/index.ts",
			),
			"miley-linear-event-transport": path.resolve(
				__dirname,
				"../linear-event-transport/src/index.ts",
			),
			// Aliases for removed packages — separate stub files so vi.mock() works per-package
			"miley-codex-runner": path.resolve(
				__dirname,
				"src/stubs/codex-runner.ts",
			),
			"miley-cursor-runner": path.resolve(
				__dirname,
				"src/stubs/cursor-runner.ts",
			),
			"miley-gemini-runner": path.resolve(
				__dirname,
				"src/stubs/gemini-runner.ts",
			),
			"miley-simple-agent-runner": path.resolve(
				__dirname,
				"src/stubs/simple-agent-runner.ts",
			),
			"miley-mcp-tools": path.resolve(__dirname, "src/stubs/mcp-tools.ts"),
			"miley-cloudflare-tunnel-client": path.resolve(
				__dirname,
				"src/stubs/cloudflare-tunnel-client.ts",
			),
			"miley-github-event-transport/test/fixtures": path.resolve(
				__dirname,
				"src/stubs/github-event-transport.ts",
			),
			"miley-github-event-transport": path.resolve(
				__dirname,
				"src/stubs/github-event-transport.ts",
			),
			"miley-slack-event-transport": path.resolve(
				__dirname,
				"src/stubs/slack-event-transport.ts",
			),
		},
	},
});
