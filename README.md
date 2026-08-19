# Continuum

Continuum is a personal, multi-device agent platform. A Windows or macOS executor performs local work, while the web/mobile client sends commands, approves risky actions, inspects results, and carries the same memory and policy state between devices.

This repository contains a runnable vertical MVP, not a production-ready remote-desktop replacement.

## What is implemented

- Shared Zod protocol for devices, commands, approvals, results, memory, file versions, and realtime messages.
- NestJS/Fastify control plane with OIDC JWT validation, WebSocket device presence, offline command delivery, expiry, server-derived risk, idempotency, audit events, and one-time approvals.
- PostgreSQL/pgvector storage with an in-memory development adapter.
- Explicit memory records with source and confidence.
- Versioned improvement candidates with safety evaluation, explicit activation, and rollback. The MVP never edits its own source code.
- Selected-folder metadata and MinIO presigned uploads, tombstones, and conflict preservation.
- Responsive React controller packaged for web, Tauri desktop, and Capacitor mobile.
- Rust local executor with approved-root path containment, text read/write limits, atomic writes, OS trash, application allowlisting, screenshots, duplicate-result replay protection, and macOS Keychain/Windows Credential Manager storage.
- WebRTC signaling protocol and browser peer implementation for the next live-stream/control increment.
- Docker Compose stack for PostgreSQL, Redis, MinIO, Keycloak, coturn, API, client, and Caddy TLS termination.

## Repository layout

```text
apps/api                 NestJS control plane and SQL migration
apps/client              React controller, Capacitor config, Tauri executor
packages/protocol        Shared schemas and authoritative tool policy
infra                    Caddy, Keycloak, nginx, and PostgreSQL bootstrap
docker-compose.yml       Single-VPS deployment
```

## Local development

Requirements: Node.js 22+, Rust stable, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run build
npm test
```

Start the API with the in-memory adapter and development authentication:

```bash
AUTH_DISABLED=true npm run dev:api
```

Then start the responsive controller:

```bash
npm run dev:client
```

The development client uses user ID `00000000-0000-4000-8000-000000000001` when no OIDC issuer is configured. Production startup refuses `AUTH_DISABLED=true`.

Run the desktop application:

```bash
npm run tauri --workspace @continuum/client -- dev
```

On first launch, enter the platform domain, for example `continuum.localtest.me`. The desktop client derives the API and OIDC endpoints, verifies `/health`, and stores the selected server locally. You can change it later under **Settings → Control server**.

Generate native mobile projects after installing Xcode or Android Studio:

```bash
cd apps/client
npx cap add ios
npx cap add android
npm run build
npm run mobile:sync
```

## First executor setup

1. Call `POST /v1/devices` as an authenticated user with `kind: "executor"` and the capabilities returned by the Tauri `capability_manifest` command.
2. Copy the one-time `device.id` and `credential` response into **Settings → PC executor credentials** in the Tauri app. The secret is stored in the OS credential manager.
3. Add a root ID under **Settings → Allowed folders**, then choose the folder with the native picker. Remote commands can never create or change this local allowlist.
4. Use command arguments shaped like `{ "rootId": "workspace", "relativePath": "notes.txt" }`.

## Single-VPS deployment

Copy and edit the environment file. Use independently generated random values for every secret.

```bash
cp .env.example .env
docker compose config --quiet
docker compose up -d --build
```

Before a public deployment:

- Point `APP_DOMAIN`, `API_DOMAIN`, and `AUTH_DOMAIN` at the VPS.
- Replace the example redirect origins in `infra/keycloak/continuum-realm.json` with those exact domains before the first Keycloak import.
- Create the first user in Keycloak and configure WebAuthn/passkeys.
- Allow TCP/UDP 3478 and UDP 49160–49200 for TURN.
- Back up the PostgreSQL and MinIO volumes independently; test restoration.
- Do not expose PostgreSQL, Redis, or MinIO directly to the internet.

The initial SQL migration runs automatically only when the PostgreSQL volume is empty. Apply later migrations explicitly before updating the API image.

## Security model

- Clients do not choose command risk. `packages/protocol/src/policy.ts` is authoritative on the server.
- Read tools can run automatically. Writes require approval. Destructive and privileged tools additionally require a verified biometric assertion flag.
- Device credentials are hashed in the control plane and stored in the desktop OS credential manager.
- Device WebSocket messages cannot address another user's devices.
- File tools accept only locally approved roots, reject absolute and parent paths, canonicalize targets, and block symlink escapes.
- Commands have a 24-hour maximum lifetime and an account-scoped idempotency key.
- External model calls cross a provider interface; callers must redact and minimize context before invoking it.

## Current native boundary

The agent-centered flow is functional: structured file commands, approvals, results, and on-demand screen snapshots work through the executor. Continuous screen video and interactive pointer/keyboard injection are represented by WebRTC signaling and client peer code, but the OS-specific capture sender and accessibility/input adapters still need to be completed and signed on both Windows and macOS. Likewise, the server-side file version/presigned-upload flow is present, while continuous filesystem watching and background upload scheduling remain the next executor increment.

These native capabilities should stay disabled in a device's advertised manifest until that build has the required OS implementation and permissions. See [the architecture notes](docs/architecture.md) for the extension points and acceptance checks.
