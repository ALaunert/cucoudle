"""Desktop configuration and on-disk paths.

All Cucoudle desktop state lives under ``~/.cucoudle``:

- ``config.json``   persisted desktop identity, relay URL and real binary paths
- ``daemon.sock``   Unix socket the shims and CLI use to talk to the daemon
- ``bin/``          generated shims (``claude``, ``codex``, ``agent``, ...)
- ``daemon.log``    daemon log file

The config is intentionally a plain JSON file so it can be inspected and edited
by hand during the hackathon.
"""

from __future__ import annotations

import json
import os
import platform
import secrets
import socket
from dataclasses import dataclass, field
from pathlib import Path

from . import APP_VERSION

DEFAULT_RELAY_URL = "ws://localhost:8787"

# Tools we know how to shim. ``agent`` is the common Cursor CLI wrapper name.
SUPPORTED_TOOLS = ("claude", "codex", "agent", "cursor")

# Environment marker set inside a managed PTY. Shims detect it to avoid
# recursively re-entering the daemon for nested invocations.
MANAGED_ENV_FLAG = "CUCOUDLE_MANAGED"
SESSION_ENV_VAR = "CUCOUDLE_SESSION_ID"


def base_dir() -> Path:
    """Return the Cucoudle home directory, honouring ``CUCOUDLE_HOME``."""
    override = os.environ.get("CUCOUDLE_HOME")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".cucoudle"


def _detect_platform() -> str:
    system = platform.system().lower()
    if system == "darwin":
        return "macos"
    if system == "linux":
        return "linux"
    return system or "unknown"


@dataclass
class Config:
    """Persisted desktop configuration."""

    desktop_id: str
    desktop_name: str
    platform: str
    app_version: str
    relay_url: str
    real_binaries: dict[str, str] = field(default_factory=dict)
    home: Path = field(default_factory=base_dir)

    # ---- derived paths -------------------------------------------------
    @property
    def config_path(self) -> Path:
        return self.home / "config.json"

    @property
    def socket_path(self) -> Path:
        return self.home / "daemon.sock"

    @property
    def bin_dir(self) -> Path:
        return self.home / "bin"

    @property
    def log_path(self) -> Path:
        return self.home / "daemon.log"

    # ---- serialization -------------------------------------------------
    def to_dict(self) -> dict:
        return {
            "desktopId": self.desktop_id,
            "desktopName": self.desktop_name,
            "platform": self.platform,
            "appVersion": self.app_version,
            "relayUrl": self.relay_url,
            "realBinaries": dict(self.real_binaries),
        }

    @classmethod
    def from_dict(cls, data: dict, home: Path) -> "Config":
        return cls(
            desktop_id=data["desktopId"],
            desktop_name=data.get("desktopName", socket.gethostname()),
            platform=data.get("platform", _detect_platform()),
            app_version=data.get("appVersion", APP_VERSION),
            relay_url=data.get("relayUrl", DEFAULT_RELAY_URL),
            real_binaries=dict(data.get("realBinaries", {})),
            home=home,
        )

    def save(self) -> None:
        self.home.mkdir(parents=True, exist_ok=True)
        tmp = self.config_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self.to_dict(), indent=2) + "\n", encoding="utf-8")
        tmp.replace(self.config_path)


def new_desktop_id() -> str:
    return "desk_" + secrets.token_hex(6)


def default_config(home: Path | None = None) -> Config:
    home = home or base_dir()
    return Config(
        desktop_id=new_desktop_id(),
        desktop_name=socket.gethostname(),
        platform=_detect_platform(),
        app_version=APP_VERSION,
        relay_url=os.environ.get("CUCOUDLE_RELAY_URL", DEFAULT_RELAY_URL),
        home=home,
    )


def load_config(home: Path | None = None) -> Config | None:
    """Load config from disk, or ``None`` if it does not exist yet."""
    home = home or base_dir()
    path = home / "config.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return Config.from_dict(data, home)


def load_or_create_config(home: Path | None = None) -> Config:
    """Load config, creating and persisting a fresh identity if absent."""
    cfg = load_config(home)
    if cfg is None:
        cfg = default_config(home)
        cfg.save()
    return cfg
