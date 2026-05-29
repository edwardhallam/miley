import { describe, expect, it } from "vitest";
import {
	getLinearAuthorizationHeader,
	isLinearApiKey,
} from "../src/linear-auth.js";

describe("linear auth helpers", () => {
	it("uses raw Authorization header for Linear API keys", () => {
		const token = "lin_api_example";

		expect(isLinearApiKey(token)).toBe(true);
		expect(getLinearAuthorizationHeader(token)).toBe(token);
	});

	it("uses Bearer Authorization header for OAuth tokens", () => {
		const token = "lin_oauth_example";

		expect(isLinearApiKey(token)).toBe(false);
		expect(getLinearAuthorizationHeader(token)).toBe(`Bearer ${token}`);
	});

	it("normalizes an existing Bearer prefix", () => {
		expect(getLinearAuthorizationHeader("Bearer lin_oauth_example")).toBe(
			"Bearer lin_oauth_example",
		);
		expect(getLinearAuthorizationHeader("Bearer lin_api_example")).toBe(
			"lin_api_example",
		);
	});
});
