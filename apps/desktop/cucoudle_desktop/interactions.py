"""High-confidence CLI prompt detection.

The daemon watches a session's terminal output and, once it settles, asks
:func:`detect_prompt` whether the tail looks like a known interactive prompt it
can map deterministically to PTY input (a yes/no approval, a numbered menu, or a
free-text question). Detection is intentionally conservative: an unverified
match must never surface as a structured control on the phone, so anything
ambiguous returns ``None`` and the prompt stays terminal-only.

The returned :class:`DetectedPrompt` carries the wire-facing fields of an
``InteractionRequest`` *plus* an internal ``option_bytes`` map binding each
option id to the exact bytes to write into the PTY. That binding is never sent
on the wire — the phone only ever sees option ids and labels.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .protocol import (
    InteractionKind,
    InteractionOption,
    InteractionOptionIntent,
    InteractionRequest,
)

# CSI/OSC and other escape sequences emitted by TUIs. Stripped before matching
# so a colored "[y/N]" prompt still detects as plain text.
_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]")

# A bracketed or parenthesised yes/no marker: [y/N], [Y/n], [y/n], (yes/no),
# (y/n). The capitalised side (if any) is the default answer.
_YESNO_RE = re.compile(r"[\[(]\s*(y(?:es)?)\s*/\s*(n(?:o)?)\s*[\])]", re.IGNORECASE)

# A numbered menu entry: "1) label" or "1. label".
_MENU_RE = re.compile(r"^\s*(\d{1,3})[).]\s+(\S.*?)\s*$")

# Phrases that offer a persistent "don't ask again" choice.
_ALWAYS_RE = re.compile(r"don'?t ask again|always allow|always\b|for (?:this|the) session", re.IGNORECASE)

# Prompt characters a free-text question may end with.
_PROMPT_CHARS = ("?", ":", ">", "❯")  # ? : > ❯

# A password/secret prompt should be flagged sensitive.
_SENSITIVE_RE = re.compile(r"pass(?:word|phrase)|secret|token|api[_ -]?key", re.IGNORECASE)


def strip_ansi(text: str) -> str:
    """Remove ANSI/CSI escape sequences so raw PTY text can be pattern-matched."""
    return _ANSI_RE.sub("", text)


@dataclass
class DetectedPrompt:
    """A recognised prompt plus its internal option->PTY-bytes binding."""

    kind: str
    prompt: str
    options: list[InteractionOption] = field(default_factory=list)
    allows_text: bool = False
    details: Optional[str] = None
    sensitive: bool = False
    default: Optional[str] = None
    # Never leaves the desktop: how to answer each option on the PTY.
    option_bytes: dict[str, bytes] = field(default_factory=dict)

    def signature(self) -> tuple:
        """Stable identity used to tell a re-render apart from a new prompt."""
        return (
            self.kind,
            self.prompt,
            tuple((o.id, o.label) for o in self.options),
        )

    def to_request(
        self,
        interaction_id: str,
        session_id: str,
        created_at: str,
        terminal_seq: Optional[int] = None,
    ) -> InteractionRequest:
        return InteractionRequest(
            id=interaction_id,
            sessionId=session_id,
            kind=InteractionKind(self.kind),
            prompt=self.prompt,
            details=self.details,
            options=self.options or None,
            allowsText=self.allows_text,
            allowsTerminalInput=True,
            sensitive=self.sensitive or None,
            createdAt=created_at,
            terminalSeq=terminal_seq,
        )


def _nonempty_lines(text: str) -> list[str]:
    lines = [ln.rstrip() for ln in text.split("\n")]
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def detect_prompt(tail: str, ended_with_newline: bool) -> Optional[DetectedPrompt]:
    """Classify the tail of a session's output as a known prompt, or ``None``.

    Only fires when ``ended_with_newline`` is ``False`` — a cursor parked after
    a prompt (no trailing newline) is the signal that the CLI is blocked waiting
    for input. Tiers are tried in order of confidence: yes/no approval, numbered
    menu, then a generic text question.
    """
    if ended_with_newline:
        return None

    clean = strip_ansi(tail)
    lines = _nonempty_lines(clean)
    if not lines:
        return None
    prompt_line = lines[-1]

    approval = _detect_approval(prompt_line, clean)
    if approval is not None:
        return approval

    menu = _detect_menu(lines, prompt_line)
    if menu is not None:
        return menu

    return _detect_text(prompt_line)


def _detect_approval(prompt_line: str, full: str) -> Optional[DetectedPrompt]:
    m = _YESNO_RE.search(prompt_line)
    if m is None:
        return None
    y_raw, n_raw = m.group(1), m.group(2)
    default: Optional[str] = None
    if y_raw.isupper():
        default = "yes"
    elif n_raw.isupper():
        default = "no"

    options = [
        InteractionOption(id="approve", label="Approve", intent=InteractionOptionIntent.APPROVE, shortcut="y"),
    ]
    option_bytes: dict[str, bytes] = {"approve": b"y\n"}

    if _ALWAYS_RE.search(full):
        # The prompt offers a persistent choice; answering "yes" is still the
        # only deterministic PTY input we can send, so bind it the same way.
        options.append(
            InteractionOption(
                id="approve_session",
                label="Approve for session",
                intent=InteractionOptionIntent.APPROVE_SESSION,
            )
        )
        option_bytes["approve_session"] = b"y\n"

    options.append(
        InteractionOption(id="reject", label="Reject", intent=InteractionOptionIntent.REJECT, shortcut="n")
    )
    option_bytes["reject"] = b"n\n"

    return DetectedPrompt(
        kind=InteractionKind.APPROVAL.value,
        prompt=prompt_line.strip(),
        options=options,
        allows_text=True,
        default=default,
        option_bytes=option_bytes,
    )


def _detect_menu(lines: list[str], prompt_line: str) -> Optional[DetectedPrompt]:
    # A trailing non-numbered line is the question ("Select an option:"); the
    # numbered entries sit immediately above it. Otherwise the entries run to
    # the bottom and there is no separate question line.
    if _MENU_RE.match(prompt_line):
        body, question = lines, None
    else:
        body, question = lines[:-1], prompt_line.strip()

    entries: list[tuple[str, str]] = []
    for ln in reversed(body):
        m = _MENU_RE.match(ln)
        if m is None:
            break
        entries.append((m.group(1), m.group(2).strip()))
    entries.reverse()

    if len(entries) < 2:
        return None

    options: list[InteractionOption] = []
    option_bytes: dict[str, bytes] = {}
    for num, label in entries:
        oid = f"option_{num}"
        options.append(
            InteractionOption(id=oid, label=label, intent=InteractionOptionIntent.NEUTRAL, shortcut=num)
        )
        option_bytes[oid] = f"{num}\n".encode("utf-8")

    return DetectedPrompt(
        kind=InteractionKind.SINGLE_SELECT.value,
        prompt=question or "Select an option",
        options=options,
        allows_text=False,
        option_bytes=option_bytes,
    )


def _detect_text(prompt_line: str) -> Optional[DetectedPrompt]:
    stripped = prompt_line.strip()
    if not stripped or stripped[-1] not in _PROMPT_CHARS:
        return None
    return DetectedPrompt(
        kind=InteractionKind.TEXT.value,
        prompt=stripped,
        options=[],
        allows_text=True,
        sensitive=bool(_SENSITIVE_RE.search(stripped)),
        option_bytes={},
    )
