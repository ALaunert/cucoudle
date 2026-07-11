# Relay deployment on `relay.launert.dev`

The relay is an independent production service. Its immutable Docker image,
Compose project, release state and CI/CD lifecycle are separate from desktop
and mobile applications. Source remains in the monorepo so all components share
one checked wire protocol.

The container is published as `ghcr.io/alaunert/cucoudle-relay:sha-<commit>`.
Compose exposes it only on loopback; Nginx and the wildcard TLS certificate
provide the public endpoint. Never expose the plain relay port to the internet.

## Server prerequisites

- the `alexey` deployment account in the `docker` group;
- one-time administrator access to install the Nginx virtual host;
- `relay.launert.dev` resolving to the server.

Do not put SSH passwords, private keys or registry tokens in this repository or
in Compose environment files.

## One-time server setup

Create the deployment directory and install the Nginx virtual host:

```bash
mkdir -p /home/alexey/services/cucoudle-relay
sudo cp deploy/relay/nginx.conf /etc/nginx/sites-available/cucoudle-relay
sudo ln -sfn /etc/nginx/sites-available/cucoudle-relay /etc/nginx/sites-enabled/cucoudle-relay
sudo nginx -t
sudo systemctl reload nginx
```

Nginx is stable infrastructure and is not rewritten on every application
release. Routine relay updates do not require sudo.

## Automated releases

`.github/workflows/relay-deploy.yml` runs only when relay, protocol or relay
deployment files change. It:

1. runs tests and TypeScript typecheck;
2. builds a Linux image and pushes an immutable commit tag to GHCR;
3. uploads only the deployment bundle over SSH;
4. serializes deployments with GitHub concurrency and a server lock;
5. switches Compose to the new image;
6. checks local health/readiness and the public TLS endpoint;
7. restores the previous image automatically if local checks fail.

Create the protected GitHub environment `relay-production` and configure these
Actions secrets:

| Secret | Value |
| --- | --- |
| `RELAY_SSH_HOST` | `launert.dev` |
| `RELAY_SSH_PORT` | `22` |
| `RELAY_SSH_USER` | `alexey` |
| `RELAY_SSH_PRIVATE_KEY` | private half of the dedicated deployment key |
| `RELAY_SSH_KNOWN_HOSTS` | pinned `ssh-keyscan` output for the server |
After all secrets are present, set the repository Actions variable
`RELAY_DEPLOY_ENABLED=true`. Until then, pushes still run relay tests but skip
publishing and deployment, leaving the current production container untouched.

The public key belongs in `/home/alexey/.ssh/authorized_keys`. Each workflow run
uses its short-lived built-in `GITHUB_TOKEN` for both publishing and the one
server-side image pull; no persistent registry credential is required.

Manual rollback uses the same validated release path:

```bash
cd /home/alexey/services/cucoudle-relay
./deploy.sh ghcr.io/alaunert/cucoudle-relay:sha-<known-good-commit>
```

## Operational logs

Relay writes one JSON object per protocol action to stdout. Logs always contain
routing metadata (`desktopId`, `mobileDeviceId`, method/event, request/session
IDs, byte counts and result). Pairing codes and tokens are never logged.

`RELAY_LOG_INPUT_TEXT=true` additionally records text from `session.input` and
`interaction.respond` as `inputText`. It is enabled in the current test
deployment and must be disabled for normal production where terminal text is
sensitive.

```bash
docker logs --since 10m cucoudle-relay-relay-1
docker logs -f cucoudle-relay-relay-1 | grep --line-buffered 'mobile.request.forwarded'
```

Container log rotation and retention are managed by the host Docker daemon.

Desktop uses `wss://relay.launert.dev`; the daemon appends
`/v1/ws/desktop`. Mobile uses the QR-provided
`wss://relay.launert.dev/v1/ws/mobile` URL.

## Temporary user-service fallback

The checked-in user unit can run a bootstrap relay when Docker is unavailable.
The first successful Compose release disables it automatically so exactly one
process owns port `8787`.

## Current security boundary

This is a hackathon deployment. TLS, one-time mobile pairing and expiring
mobile resume tokens are present. Desktop device-secret authentication,
persistent token revocation and multi-instance state are not implemented yet,
so the public endpoint should be treated as a demo environment.
