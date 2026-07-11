# Relay deployment on `relay.launert.dev`

This bundle runs the relay in Docker on loopback and exposes it through the
server's existing Nginx and wildcard TLS certificate.

## Server prerequisites

- an administrator account with access to Docker and `/etc/nginx`;
- repository checked out at `/home/alexey/cucoudle`;
- `relay.launert.dev` resolving to the server.

The `alexey` account did not have sudo or Docker socket access when this setup
was prepared. Do not put its SSH password in this repository or in compose
environment files.

## Operator deployment

This is performed by a server administrator and repeated only for service updates. It is not part of desktop or mobile installation and is never run by end users.

Run as an administrator on the server:

```bash
cd /home/alexey/cucoudle
docker compose -f deploy/relay/compose.yaml up -d --build
cp deploy/relay/nginx.conf /etc/nginx/sites-available/cucoudle-relay
ln -s /etc/nginx/sites-available/cucoudle-relay /etc/nginx/sites-enabled/cucoudle-relay
nginx -t
systemctl reload nginx
```

If the Nginx symlink already exists, do not recreate it. Validate the service:

```bash
curl --fail https://relay.launert.dev/healthz
curl --fail https://relay.launert.dev/readyz
docker compose -f deploy/relay/compose.yaml ps
```

Desktop uses `wss://relay.launert.dev`; the daemon appends
`/v1/ws/desktop`. Mobile uses the QR-provided
`wss://relay.launert.dev/v1/ws/mobile` URL.

## Current security boundary

This is a hackathon deployment. TLS, one-time mobile pairing and expiring
mobile resume tokens are present. Desktop device-secret authentication,
persistent token revocation and multi-instance state are not implemented yet,
so the public endpoint should be treated as a demo environment.
