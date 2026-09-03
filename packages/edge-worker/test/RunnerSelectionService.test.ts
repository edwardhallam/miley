import type { EdgeWorkerConfig, ILogger } from "miley-core";
import { describe, expect, it } from "vitest";
import { RunnerSelectionService } from "../src/RunnerSelectionService.js";

function service(
	config: Partial<EdgeWorkerConfig> = {},
): RunnerSelectionService {
	return new RunnerSelectionService(config as EdgeWorkerConfig, {} as ILogger);
}

describe("RunnerSelectionService defaults", () => {
	it("pins unconfigured Claude work to Opus 5 without a same-provider fallback", () => {
		const selected = service().determineRunnerSelection([]);

		expect(selected).toEqual({
			runnerType: "claude",
			modelOverride: "claude-opus-5",
			fallbackModelOverride: undefined,
		});
	});

	it("preserves an explicitly configured Claude fallback model", () => {
		const selected = service({
			claudeDefaultFallbackModel: "claude-sonnet-5",
		}).determineRunnerSelection([]);

		expect(selected.fallbackModelOverride).toBe("claude-sonnet-5");
	});
});
