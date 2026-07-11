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

# rc files we manage, relative to home.
SHELL_RC_FILES = (".zshrc", ".bashrc", ".bash_profile", ".profile")


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


def path_block(bin_dir: Path) -> str:
    """The marked block we insert into shell rc files."""
    return (
        f"{BLOCK_START}\n"
        f'export PATH="{bin_dir}:$PATH"\n'
        f"{BLOCK_END}\n"
    )


def render_rc_with_block(existing: str, bin_dir: Path) -> str:
    """Return *existing* rc content with our block inserted or replaced."""
    block = path_block(bin_dir)
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
    python_executable = python_executable or sys.executable
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


def _target_rc_files() -> list[Path]:
    """Existing rc files we should manage, always including the shell default."""
    home = Path.home()
    files = [home / name for name in SHELL_RC_FILES if (home / name).exists()]
    if not files:
        # Nothing exists yet: create the one matching the login shell.
        shell = os.environ.get("SHELL", "")
        default = ".zshrc" if shell.endswith("zsh") else ".bashrc"
        files = [home / default]
    return files


def update_shell_config(cfg: Config) -> list[str]:
    """Insert the PATH block into managed rc files (with a backup). Idempotent."""
    changed: list[str] = []
    for rc in _target_rc_files():
        existing = rc.read_text(encoding="utf-8") if rc.exists() else ""
        updated = render_rc_with_block(existing, cfg.bin_dir)
        if updated == existing:
            continue
        if rc.exists():
            shutil.copy2(rc, rc.with_suffix(rc.suffix + ".cucoudle.bak"))
        rc.write_text(updated, encoding="utf-8")
        changed.append(str(rc))
    return changed


def clean_shell_config(cfg: Config) -> list[str]:
    changed: list[str] = []
    home = Path.home()
    for name in SHELL_RC_FILES:
        rc = home / name
        if not rc.exists():
            continue
        existing = rc.read_text(encoding="utf-8")
        updated = render_rc_without_block(existing)
        if updated != existing:
            shutil.copy2(rc, rc.with_suffix(rc.suffix + ".cucoudle.bak"))
            rc.write_text(updated, encoding="utf-8")
            changed.append(str(rc))
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
    for name in SHELL_RC_FILES:
        rc = Path.home() / name
        rc_status[name] = rc.exists() and BLOCK_START in rc.read_text(encoding="utf-8")
    return {
        "home": str(cfg.home),
        "binDir": str(cfg.bin_dir),
        "socket": str(cfg.socket_path),
        "socketExists": cfg.socket_path.exists(),
        "binDirOnPath": on_path,
        "realBinaries": {t.name: t.path for t in tools},
        "shimsInstalled": shims,
        "shellBlocks": rc_status,
    }
