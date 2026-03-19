# API Endpoint Hardening Design

**Issue:** NEX-508
**Date:** 2026-03-18
**Status:** Approved (via Linear comments on 2026-03-17)

## Problem

Miley's Cloudflare Tunnel (`miley.spicyeddie.com → http://192.168.1.104:3457`) forwards all HTTP traffic to a single Fastify server. This exposes admin endpoints (`/api/update/*`, `/mcp/miley-tools`) to the public internet. While these endpoints require `MILEY_API_KEY` bearer auth, a leaked key would allow arbitrary command execution (`/api/update/test-mcp`), recursive file deletion (`DELETE /api/update/repository`), config rewriting, and env var injection.

Only `/webhook` needs to be publicly reachable (Linear sends webhooks here). Everything else is consumed locally.

## Design: Two-Server Split

Split the single `SharedApplicationServer` Fastify instance into two:

| Server | Bind | Port | Endpoints | Access |
|--------|------|------|-----------|--------|
| **Public** | `0.0.0.0` | 3457 | `/webhook`, `/status`, `/version` | CF Tunnel, CF Access service token |
| **Internal** | `127.0.0.1` | 3458 | `/api/update/*`, `/api/check-gh`, `/mcp/miley-tools` | Localhost only |

### Why two servers instead of path filtering

- Binding to `127.0.0.1` makes internal endpoints physically unreachable from the network — stronger than any path filter or middleware
- The CF Tunnel uses remote config, where path-based ingress rules may not be supported the same as local `config.yml`
- Simpler to reason about: the internal server literally cannot receive external traffic

## Changes

### 1. SharedApplicationServer: support two Fastify instances

Currently `SharedApplicationServer` creates one Fastify instance. Add an internal server:

- New constructor parameter: `internalPort` (default: 3458)
- New Fastify instance bound to `127.0.0.1:internalPort`
- New method `getInternalFastifyInstance()` returning the internal instance
- `start()` starts both servers; `stop()` stops both
- The raw body content-type parser must be registered on both instances (webhook signature verification needs it on public; MCP may need it on internal)

**File:** `packages/edge-worker/src/SharedApplicationServer.ts`

### 2. EdgeWorker: route registrations to correct server

In `EdgeWorker.start()` (around line 547-571), change which Fastify instance receives each route:

- **Public server** (`getFastifyInstance()`): `/webhook`, `/github-webhook`, `/status`, `/version`
- **Internal server** (`getInternalFastifyInstance()`): ConfigUpdater routes, `/mcp/miley-tools`

Specific changes:
- `ConfigUpdater` constructor receives the internal Fastify instance instead of the public one
- `registerMileyToolsMcpEndpoint()` uses internal Fastify instance
- `registerStatusEndpoint()` and `registerVersionEndpoint()` stay on public instance
- `LinearEventTransport` stays on public instance (it registers `/webhook`)

**File:** `packages/edge-worker/src/EdgeWorker.ts`

### 3. getMileyToolsMcpUrl: update port

`getMileyToolsMcpUrl()` (line 4041) currently returns `http://127.0.0.1:{publicPort}/mcp/miley-tools`. Update to use `internalPort`. Since MCP clients are always local Claude Code sessions, `127.0.0.1` is already correct — only the port changes.

**File:** `packages/edge-worker/src/EdgeWorker.ts`

### 4. WorkerService: pass internal port through config

`WorkerService.startEdgeWorker()`, `startSetupWaitingMode()`, and `startIdleMode()` all create `SharedApplicationServer`. They need to pass the internal port.

Add `MILEY_INTERNAL_PORT` env var (default 3458) and wire it through `EdgeWorkerConfig`.

For setup/idle modes, `ConfigUpdater` should register on the internal server so admin routes are never exposed publicly even during onboarding.

**File:** `apps/cli/src/services/WorkerService.ts`

### 5. Fail-closed MCP auth

In `isMileyToolsMcpAuthorizationValid()` (EdgeWorker.ts line 4196-4208), the current logic:

```typescript
if (!expectedHeader) {
  return true; // BUG: skips auth when MILEY_API_KEY is unset
}
```

Change to:

```typescript
if (!expectedHeader) {
  return false; // Fail closed: reject when no key configured
}
```

**File:** `packages/edge-worker/src/EdgeWorker.ts`

### 6. Config schema: add internalPort

Add `internalPort` to `MileyConfigSchema.server` (optional, default 3458).

**File:** `packages/core/src/config-schemas.ts`, `packages/core/src/config-types.ts`

### 7. Webhook audit logging

Add lightweight logging on webhook auth events (success and failure) to stdout via the existing logger:

```
[AUDIT] POST /webhook auth=linear-signature result=ok
[AUDIT] POST /webhook auth=bearer result=rejected
```

No new dependencies. Use the existing `ILogger` instance.

**File:** `packages/linear-event-transport/src/LinearEventTransport.ts`

## What we are NOT doing

- **CF Access policy** — the two-server split makes admin endpoints unreachable without it. Can be added later for defense-in-depth on `/webhook` if desired.
- **Rate limiting** — Linear sends low volume; CF has built-in DDoS protection on the tunnel.
- **IP allowlisting** — localhost binding is stronger.
- **Request signing** — bearer token + localhost is sufficient for the threat model.
- **Tailscale admin port** — localhost is simpler; SSH tunnel if remote admin is ever needed.

## Testing

- Verify internal endpoints respond on `localhost:3458` but are unreachable from other hosts
- Verify `/webhook`, `/status`, `/version` respond on `0.0.0.0:3457`
- Verify MCP auth rejects requests when `MILEY_API_KEY` is unset
- Verify audit log entries appear for webhook auth events
- Existing tests continue to pass (ConfigUpdater, EdgeWorker)

## Constants

| Constant | Value | Source |
|----------|-------|--------|
| Public port | 3457 | `MILEY_SERVER_PORT` env var, default in `constants.ts` |
| Internal port | 3458 | `MILEY_INTERNAL_PORT` env var, default `publicPort + 1` |
| Internal host | `127.0.0.1` | Hardcoded, not configurable |
