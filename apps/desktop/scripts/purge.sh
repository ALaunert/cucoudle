#!/usr/bin/env bash
#
# Cucoudle desktop — full purge / clean-slate reset.
#
# Removes every trace of the desktop install so you can test install/uninstall
# cycles from a pristine state:
#   - stops the running daemon (and, with --with-relay, the local relay/observer);
#   - strips the marked PATH block from every managed shell config
#     (.zshrc/.bashrc/.bash_profile/.profile and fish config);
#   - deletes the Cucoudle home directory (~/.cucoudle, or $CUCOUDLE_HOME).
#
# Intentionally self-contained (no Python / venv needed) so it works even if a
# previous install is broken. It only touches Cucoudle's own artifacts and the
# clearly-marked block in your shell configs.
#
# Usage:
#   purge.sh [--dry-run] [--remove-backups] [--with-relay] [-y]
#
#   --dry-run          show what would happen, change nothing
#   --remove-backups   also delete the *.cucoudle.bak shell-config backups
#   --with-relay       also stop a locally-running relay and observer helpers
#   -y, --yes          do not prompt for confirmation
#   -h, --help         this help
#
# Honors $CUCOUDLE_HOME and $HOME for isolated testing.

set -u

DRY_RUN=0
REMOVE_BACKUPS=0
WITH_RELAY=0
ASSUME_YES=0

MARK_START="# >>> cucoudle shell integration >>>"
MARK_END="# <<< cucoudle shell integration <<<"

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --remove-backups) REMOVE_BACKUPS=1 ;;
    --with-relay) WITH_RELAY=1 ;;
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

HOME_DIR="${HOME:?HOME must be set}"
CUCOUDLE_HOME="${CUCOUDLE_HOME:-$HOME_DIR/.cucoudle}"

CONFIGS="
$HOME_DIR/.zshrc
$HOME_DIR/.bashrc
$HOME_DIR/.bash_profile
$HOME_DIR/.profile
$HOME_DIR/.config/fish/config.fish
"

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
did()  { printf '    %s\n' "$*"; }

confirm() {
  [ "$DRY_RUN" -eq 1 ] && return 0
  [ "$ASSUME_YES" -eq 1 ] && return 0
  printf 'This will stop the daemon, delete %s and strip the PATH block from your shell configs.\nProceed? [y/N] ' "$CUCOUDLE_HOME"
  read -r ans 2>/dev/null || ans=""
  case "$ans" in y|Y|yes|YES) return 0 ;; *) say "Aborted."; exit 1 ;; esac
}

kill_pattern() {
  label="$1"; pat="$2"
  pids=$(pgrep -f "$pat" 2>/dev/null || true)
  if [ -z "$pids" ]; then
    did "$label: none running"
    return 0
  fi
  did "$label: stopping PID(s) $(echo "$pids" | tr '\n' ' ')"
  [ "$DRY_RUN" -eq 1 ] && return 0
  # shellcheck disable=SC2086
  kill -INT $pids 2>/dev/null || true
  sleep 1
  still=$(pgrep -f "$pat" 2>/dev/null || true)
  if [ -n "$still" ]; then
    # shellcheck disable=SC2086
    kill -KILL $still 2>/dev/null || true
  fi
}

strip_block() {
  f="$1"
  [ -f "$f" ] || return 0
  if grep -qF "$MARK_START" "$f" 2>/dev/null; then
    did "strip PATH block from $f"
    [ "$DRY_RUN" -eq 1 ] && return 0
    tmp="$f.cucoudle.purge.tmp"
    awk -v s="$MARK_START" -v e="$MARK_END" '
      index($0, s) { skip = 1 }
      skip != 1    { print }
      index($0, e) { skip = 0 }
    ' "$f" > "$tmp" && mv "$tmp" "$f"
  fi
}

remove_home() {
  if [ -e "$CUCOUDLE_HOME" ]; then
    did "remove $CUCOUDLE_HOME"
    [ "$DRY_RUN" -eq 1 ] && return 0
    rm -rf "$CUCOUDLE_HOME"
  else
    did "$CUCOUDLE_HOME: already absent"
  fi
}

remove_backups() {
  for f in $CONFIGS; do
    b="$f.cucoudle.bak"
    if [ -f "$b" ]; then
      did "remove backup $b"
      [ "$DRY_RUN" -eq 1 ] || rm -f "$b"
    fi
  done
}

verify() {
  if [ "$DRY_RUN" -eq 1 ]; then
    say ""
    say "Dry-run: nothing was changed. Re-run without --dry-run to purge."
    return 0
  fi
  clean=1
  for f in $CONFIGS; do
    if grep -qF "$MARK_START" "$f" 2>/dev/null; then
      did "STILL PRESENT: PATH block in $f"; clean=0
    fi
  done
  [ -e "$CUCOUDLE_HOME" ] && { did "STILL PRESENT: $CUCOUDLE_HOME"; clean=0; }
  if pgrep -f 'cucoudle_desktop daemon' >/dev/null 2>&1; then
    did "STILL RUNNING: daemon"; clean=0
  fi
  if [ "$clean" -eq 1 ]; then
    say ""
    say "CLEAN: no Cucoudle desktop artifacts remain."
  else
    say ""
    say "NOT fully clean — see items above."
  fi
  return $((1 - clean))
}

say "Cucoudle desktop purge"
say "  HOME:          $HOME_DIR"
say "  CUCOUDLE_HOME: $CUCOUDLE_HOME"
[ "$DRY_RUN" -eq 1 ] && say "  MODE:          dry-run (no changes)"

confirm

step "Stopping processes"
kill_pattern "daemon" "cucoudle_desktop daemon"
if [ "$WITH_RELAY" -eq 1 ]; then
  kill_pattern "relay" "tsx src/server.ts"
  kill_pattern "observer" "observer.py"
fi

step "Cleaning shell configs"
for f in $CONFIGS; do strip_block "$f"; done
[ "$REMOVE_BACKUPS" -eq 1 ] && { step "Removing shell-config backups"; remove_backups; }

step "Removing Cucoudle home"
remove_home

step "Verifying"
verify
