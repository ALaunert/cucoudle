#!/usr/bin/env bash
set -Eeuo pipefail

readonly RELEASE_IMAGE="${1:?usage: deploy.sh <immutable-image>}"
readonly DEPLOY_DIR="${CUCOUDLE_RELAY_DEPLOY_DIR:-$HOME/services/cucoudle-relay}"
readonly COMPOSE_FILE="$DEPLOY_DIR/compose.yaml"
readonly ENV_FILE="$DEPLOY_DIR/.env"
readonly NEXT_ENV_FILE="$DEPLOY_DIR/.env.next"

cd "$DEPLOY_DIR"
command -v docker >/dev/null
command -v curl >/dev/null
test -f "$COMPOSE_FILE"

exec 9>"$DEPLOY_DIR/.deploy.lock"
flock 9

previous_image=""
if [[ -f "$ENV_FILE" ]]; then
  previous_image="$(sed -n 's/^RELAY_IMAGE=//p' "$ENV_FILE" | tail -n 1)"
fi

compose_up() {
  local image="$1"
  RELAY_IMAGE="$image" docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
}

wait_until_ready() {
  local _
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error http://127.0.0.1:8787/healthz >/dev/null \
      && curl --fail --silent --show-error http://127.0.0.1:8787/readyz >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  echo "Relay release failed; rolling back to ${previous_image:-no previous image}." >&2
  if [[ -n "$previous_image" ]]; then
    compose_up "$previous_image"
    wait_until_ready || true
  else
    RELAY_IMAGE="$RELEASE_IMAGE" docker compose -f "$COMPOSE_FILE" down || true
  fi
  rm -f "$NEXT_ENV_FILE"
  exit 1
}

docker image inspect "$RELEASE_IMAGE" >/dev/null 2>&1 || docker pull "$RELEASE_IMAGE"

# The user service was a temporary bootstrap path. Compose owns production.
systemctl --user disable --now cucoudle-relay.service >/dev/null 2>&1 || true

compose_up "$RELEASE_IMAGE" || rollback
wait_until_ready || rollback

printf 'RELAY_IMAGE=%s\n' "$RELEASE_IMAGE" >"$NEXT_ENV_FILE"
mv "$NEXT_ENV_FILE" "$ENV_FILE"
printf '%s\n' "$RELEASE_IMAGE" >"$DEPLOY_DIR/.release"

echo "Relay is healthy on $RELEASE_IMAGE"
