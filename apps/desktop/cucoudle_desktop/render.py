"""``TerminalRenderer``: server-side terminal emulation for mobile clients.

Raw PTY bytes are fed into a pyte ``HistoryScreen``. The renderer exposes the
result as styled lines split into two zones: *history* (lines that scrolled out
of the viewport; append-only) and *screen* (the live viewport, replaced whole
on every frame). TUI redraws — spinners, status bars — collapse into the
current screen state instead of polluting the transcript.
"""

from __future__ import annotations

import pyte

HISTORY_LIMIT = 1000   # styled history lines kept for snapshots
_PYTE_HISTORY = 10_000  # pyte's own scrollback; large so we can drain increments


def _run_style(char) -> dict:
    style: dict = {}
    fg, bg = char.fg, char.bg
    if char.reverse:
        fg, bg = (bg if bg != "default" else "black"), (fg if fg != "default" else "white")
    if fg != "default":
        style["fg"] = fg
    if bg != "default":
        style["bg"] = bg
    if char.bold:
        style["b"] = True
    if char.italics:
        style["i"] = True
    if char.underscore:
        style["u"] = True
    return style


def render_line(cells: dict, width: int) -> list[dict]:
    """Convert a pyte buffer line (sparse col -> Char dict) into styled runs."""
    last = -1
    for x in range(width):
        ch = cells.get(x)
        if ch is not None and (ch.data.strip() or ch.bg != "default" or ch.reverse):
            last = x
    runs: list[dict] = []
    for x in range(last + 1):
        ch = cells.get(x)
        data = ch.data if ch is not None and ch.data else " "
        style = _run_style(ch) if ch is not None else {}
        if runs and {k: v for k, v in runs[-1].items() if k != "t"} == style:
            runs[-1]["t"] += data
        else:
            runs.append({"t": data, **style})
    return runs


class TerminalRenderer:
    def __init__(self, cols: int = 80, rows: int = 24) -> None:
        self.screen = pyte.HistoryScreen(cols, rows, history=_PYTE_HISTORY, ratio=0.5)
        self.stream = pyte.ByteStream(self.screen)
        self.history: list[list[dict]] = []
        self._consumed = 0
        self.seq = 0

    def feed(self, data: bytes) -> None:
        self.stream.feed(data)

    def _drain_history(self) -> list[list[dict]]:
        top = self.screen.history.top
        fresh = [render_line(line, self.screen.columns) for line in list(top)[self._consumed:]]
        self._consumed = len(top)
        self.history.extend(fresh)
        if len(self.history) > HISTORY_LIMIT:
            del self.history[: len(self.history) - HISTORY_LIMIT]
        return fresh

    def _screen_lines(self) -> list[list[dict]]:
        return [
            render_line(self.screen.buffer[y], self.screen.columns)
            for y in range(self.screen.lines)
        ]

    def take_frame(self, session_id: str) -> dict:
        """Consume newly scrolled-off lines and return a terminal.render payload."""
        fresh = self._drain_history()
        self.seq += 1
        return {
            "sessionId": session_id,
            "seq": self.seq,
            "historyAppend": fresh,
            "screen": self._screen_lines(),
        }

    def snapshot(self) -> dict:
        self._drain_history()
        return {
            "history": list(self.history),
            "screen": self._screen_lines(),
            "lastSeq": self.seq,
        }

    def resize(self, cols: int, rows: int) -> None:
        self.screen.resize(rows, cols)
