/**
 * Application constants
 */

/**
 * Default server port for OAuth callbacks and webhooks
 */
export const DEFAULT_SERVER_PORT = 3457;

/**
 * Default internal server port for admin/MCP endpoints (localhost only)
 */
export const DEFAULT_INTERNAL_PORT = 3458;

/**
 * Parse a port number from string with validation
 */
export function parsePort(
	value: string | undefined,
	defaultPort: number,
): number {
	if (!value) return defaultPort;
	const parsed = parseInt(value, 10);
	return Number.isNaN(parsed) || parsed < 1 || parsed > 65535
		? defaultPort
		: parsed;
}
