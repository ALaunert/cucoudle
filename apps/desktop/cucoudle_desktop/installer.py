"""Shell integration installer: binary discovery, shims, and PATH block.

Responsibilities (Desktop owner, per the hackathon plan):

- discover real CLI binaries before installing shims;
- generate transparent shims into ``~/.cucoudle/bin``;
- add/remove a clearly marked ``PATH`` block in the user's shell rc files,
  taking a backup first;
- ``doctor`` to report the current integration state.

Everything is reversible and idempotent. Installing Cucoudle must never leave a
shell unable to find the real CLI (the shim itself also falls back to the real
binary at runtime).
"""

from __future__ import annotations

import os
import shutil
import stat
import sys
from dataclasses import dataclass
from pathlib import Path

from .config import SUPPORTED_TOOLS, Config
from .shim_template import render_shim

BLOCK_START = "# >>> cucoudle shell integration >>>"
BLOCK_END = "# <<< cucoudle shell integration <<<"

# POSIX rc files we manage, relative to home (zsh/bash/sh share export syntax).
SHELL_RC_FILES = (".zshrc", ".bashrc", ".bash_profile", ".profile")
# fish uses different syntax and its own config location.
FISH_CONFIG_REL = ".config/fish/config.fish"


@dataclass
class DiscoveredTool:
    name: str
    path: str | None

    @property
    def available(self) -> bool:
        return self.path is not None


def discover_tools(bin_dir: Path, tools: tuple[str, ...] = SUPPORTED_TOOLS) -> list[DiscoveredTool]:
    """Find each supported tool's real binary on PATH, excluding the shim dir."""
    bin_dir_abs = str(bin_dir.resolve()) if bin_dir.exists() else str(bin_dir)
    results: list[DiscoveredTool] = []
    for tool in tools:
        results.append(DiscoveredTool(tool, _which_excluding(tool, bin_dir_abs)))
    return results


def _which_excluding(tool: str, exclude_dir: str) -> str | None:
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        if not entry:
            continue
        try:
            same = os.path.abspath(entry) == os.path.abspath(exclude_dir)
        except OSError:  # pragma: no cover - defensive
            same = False
        if same:
            continue
        candidate = os.path.join(entry, tool)
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def resolve_shim_interpreter() -> str:
    """Pick a portable shebang target for generated shims.

    Prefer ``/usr/bin/env python3`` when a ``python3`` is discoverable on PATH,
    so shims survive a moved/rebuilt virtualenv and work on other machines.
    Fall back to the current interpreter's absolute path when no ``python3`` is
    on PATH, so the shim still runs.
    """
    if shutil.which("python3"):
        return "/usr/bin/env python3"
    return sys.executable


def path_block(bin_dir: Path, kind: str = "posix") -> str:
    """The marked block we insert into a shell config, per shell family."""
    if kind == "fish":
        body = f'set -gx PATH "{bin_dir}" $PATH'
    else:
        body = f'export PATH="{bin_dir}:$PATH"'
    return f"{BLOCK_START}\n{body}\n{BLOCK_END}\n"


def render_rc_with_block(existing: str, bin_dir: Path, kind: str = "posix") -> str:
    """Return *existing* rc content with our block inserted or replaced."""
    block = path_block(bin_dir, kind)
    if BLOCK_START in existing and BLOCK_END in existing:
        pre, rest = existing.split(BLOCK_START, 1)
        _, post = rest.split(BLOCK_END, 1)
        return pre.rstrip("\n") + ("\n\n" if pre.strip() else "") + block + post.lstrip("\n")
    sep = "" if existing.endswith("\n") or not existing else "\n"
    trailer = "" if not existing else "\n"
    return existing + sep + trailer + block


def render_rc_without_block(existing: str) -> str:
    """Return *existing* rc content with our block removed, if present."""
    if BLOCK_START not in existing or BLOCK_END not in existing:
        return existing
    pre, rest = existing.split(BLOCK_START, 1)
    _, post = rest.split(BLOCK_END, 1)
    return (pre.rstrip("\n") + "\n" + post.lstrip("\n")).rstrip("\n") + ("\n" if existing.endswith("\n") else "")


def write_shims(cfg: Config, tools: list[DiscoveredTool], python_executable: str | None = None) -> list[str]:
    """Write shim scripts for available tools; return the tool names installed."""
    python_executable = python_executable or resolve_shim_interpreter()
    cfg.bin_dir.mkdir(parents=True, exist_ok=True)
    content = render_shim(python_executable)
    installed: list[str] = []
    for tool in tools:
        if not tool.available:
            continue
        shim_path = cfg.bin_dir / tool.name
        shim_path.write_text(content, encoding="utf-8")
        shim_path.chmod(shim_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        installed.append(tool.name)
    return installed


def remove_shims(cfg: Config) -> list[str]:
    removed: list[str] = []
    if not cfg.bin_dir.exists():
        return removed
    for tool in SUPPORTED_TOOLS:
        shim_path = cfg.bin_dir / tool
        if shim_path.exists():
            shim_path.unlink()
            removed.append(tool)
    return removed


def _shell_targets() -> list[tuple[Path, str]]:
    """Config files to manage as ``(path, kind)`` pairs.

    Covers every existing POSIX rc file plus the fish config, and — when the
    user has no managed config yet — creates the one matching their login shell
    (``$SHELL``). Over-covering existing files is harmless: a prepended ``PATH``
    block is idempotent and a shell simply ignores files it does not read.
    """
    home = Path.home()
    shell = os.environ.get("SHELL", "")
    targets: list[tuple[Path, str]] = []

    for name in SHELL_RC_FILES:
        rc = home / name
        if rc.exists():
            targets.append((rc, "posix"))

    fish_cfg = home / FISH_CONFIG_REL
    if fish_cfg.exists() or shell.endswith("fish"):
        targets.append((fish_cfg, "fish"))

    if not targets:
        if shell.endswith("fish"):
            targets.append((fish_cfg, "fish"))
        elif shell.endswith("zsh"):
            targets.append((home / ".zshrc", "posix"))
        else:
            targets.append((home / ".bashrc", "posix"))
    return targets


def update_shell_config(cfg: Config) -> list[str]:
    """Insert the PATH block into managed shell configs (with a backup). Idempotent."""
    changed: list[str] = []
    for path, kind in _shell_targets():
        existing = path.read_text(encoding="utf-8") if path.exists() else ""
        updated = render_rc_with_block(existing, cfg.bin_dir, kind)
        if updated == existing:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            shutil.copy2(path, path.with_suffix(path.suffix + ".cucoudle.bak"))
        path.write_text(updated, encoding="utf-8")
        changed.append(str(path))
    return changed


def _managed_config_paths() -> list[Path]:
    home = Path.home()
    return [home / name for name in SHELL_RC_FILES] + [home / FISH_CONFIG_REL]


def clean_shell_config(cfg: Config) -> list[str]:
    changed: list[str] = []
    for path in _managed_config_paths():
        if not path.exists():
            continue
        existing = path.read_text(encoding="utf-8")
        updated = render_rc_without_block(existing)
        if updated != existing:
            shutil.copy2(path, path.with_suffix(path.suffix + ".cucoudle.bak"))
            path.write_text(updated, encoding="utf-8")
            changed.append(str(path))
    return changed


def install(cfg: Config, python_executable: str | None = None) -> dict:
    """Full install: discover, persist real paths, write shims, edit shell rc."""
    tools = discover_tools(cfg.bin_dir)
    cfg.real_binaries = {t.name: t.path for t in tools if t.available}
    cfg.save()
    installed = write_shims(cfg, tools, python_executable)
    changed_files = update_shell_config(cfg)
    return {
        "installed": installed,
        "missing": [t.name for t in tools if not t.available],
        "shellFiles": changed_files,
        "binDir": str(cfg.bin_dir),
    }


def uninstall(cfg: Config) -> dict:
    removed = remove_shims(cfg)
    changed_files = clean_shell_config(cfg)
    return {"removed": removed, "shellFiles": changed_files}


def doctor(cfg: Config) -> dict:
    """Report the current integration state without changing anything."""
    tools = discover_tools(cfg.bin_dir)
    shims = {}
    for tool in SUPPORTED_TOOLS:
        shim_path = cfg.bin_dir / tool
        shims[tool] = shim_path.exists() and os.access(shim_path, os.X_OK)
    path_entries = os.environ.get("PATH", "").split(os.pathsep)
    on_path = str(cfg.bin_dir) in [os.path.abspath(p) if p else "" for p in path_entries] or \
        str(cfg.bin_dir) in path_entries
    rc_status = {}
    for path in _managed_config_paths():
        try:
            present = path.exists() and BLOCK_START in path.read_text(encoding="utf-8")
        except OSError:  # pragma: no cover - unreadable file
            present = False
        if present:
            rc_status[str(path)] = True
    return {
        "home": str(cfg.home),
        "binDir": str(cfg.bin_dir),
        "socket": str(cfg.socket_path),
        "socketExists": cfg.socket_path.exists(),
        "binDirOnPath": on_path,
        "shimInterpreter": resolve_shim_interpreter(),
        "loginShell": os.environ.get("SHELL", "(unknown)"),
        "realBinaries": {t.name: t.path for t in tools},
        "shimsInstalled": shims,
        "shellBlocks": rc_status,
    }
