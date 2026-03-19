import { afterEach, describe, expect, it } from "vitest";
import { SharedApplicationServer } from "../src/SharedApplicationServer.js";

describe("SharedApplicationServer - Internal Server", () => {
	let server: SharedApplicationServer;

	afterEach(async () => {
		if (server) {
			await server.stop();
		}
	});

	it("should expose getInternalFastifyInstance()", () => {
		server = new SharedApplicationServer(0, "127.0.0.1", false, undefined, 0);
		const internal = server.getInternalFastifyInstance();
		expect(internal).toBeDefined();
		expect(typeof internal.get).toBe("function");
		expect(typeof internal.post).toBe("function");
	});

	it("should return different Fastify instances for public and internal", () => {
		server = new SharedApplicationServer(0, "127.0.0.1", false, undefined, 0);
		const pub = server.getFastifyInstance();
		const internal = server.getInternalFastifyInstance();
		expect(pub).not.toBe(internal);
	});

	it("should start and stop both servers", async () => {
		server = new SharedApplicationServer(0, "127.0.0.1", false, undefined, 0);
		await server.start();
		// If no error, both servers started
		await server.stop();
	});

	it("should return the internal port", () => {
		server = new SharedApplicationServer(
			3457,
			"127.0.0.1",
			false,
			undefined,
			3458,
		);
		expect(server.getInternalPort()).toBe(3458);
	});
});
