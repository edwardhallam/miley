import { describe, expect, it } from "vitest";
import { normalizeClaudeModel } from "../src/normalizeClaudeModel";

describe("normalizeClaudeModel", () => {
	it("appends [1m] to bare opus alias", () => {
		expect(normalizeClaudeModel("opus")).toBe("opus[1m]");
	});

	it("appends [1m] to bare sonnet alias", () => {
		expect(normalizeClaudeModel("sonnet")).toBe("sonnet[1m]");
	});

	it("appends [1m] to bare haiku alias", () => {
		expect(normalizeClaudeModel("haiku")).toBe("haiku[1m]");
	});

	it("does not double-suffix opus[1m]", () => {
		expect(normalizeClaudeModel("opus[1m]")).toBe("opus[1m]");
	});

	it("does not double-suffix sonnet[1m]", () => {
		expect(normalizeClaudeModel("sonnet[1m]")).toBe("sonnet[1m]");
	});

	it("does not double-suffix haiku[1m]", () => {
		expect(normalizeClaudeModel("haiku[1m]")).toBe("haiku[1m]");
	});

	it("preserves original casing while appending", () => {
		expect(normalizeClaudeModel("Opus")).toBe("Opus[1m]");
	});

	it("passes through full model IDs without suffix", () => {
		expect(normalizeClaudeModel("claude-opus-4-6")).toBe("claude-opus-4-6");
	});

	it("passes through full model IDs case-insensitively", () => {
		expect(normalizeClaudeModel("Claude-opus-4-6")).toBe("Claude-opus-4-6");
	});

	it("passes through non-Claude models unchanged", () => {
		expect(normalizeClaudeModel("gemini-2.5-pro")).toBe("gemini-2.5-pro");
	});

	it("passes through unknown strings unchanged", () => {
		expect(normalizeClaudeModel("gpt-5.3-codex")).toBe("gpt-5.3-codex");
	});
});
