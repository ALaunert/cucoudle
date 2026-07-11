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


class _RendererInputFilter:
    """Remove terminal queries unsupported by pyte from the render-only copy.

    The original PTY bytes still go unchanged to the local terminal and relay.
    CSI sequences may be split across arbitrary PTY reads, so keep an incomplete
    suffix until its final byte arrives.
    """

    def __init__(self) -> None:
        self.pending = b""

    def process(self, data: bytes) -> bytes:
        source = self.pending + data
        self.pending = b""
        output = bytearray()
        offset = 0

        while offset < len(source):
            escape = source.find(b"\x1b", offset)
            if escape < 0:
                output.extend(source[offset:])
                break
            output.extend(source[offset:escape])
            if escape + 1 >= len(source):
                self.pending = source[escape:]
                break
            if source[escape + 1] != ord("["):
                output.append(source[escape])
                offset = escape + 1
                continue

            final = escape + 2
            while final < len(source) and not 0x40 <= source[final] <= 0x7E:
                final += 1
            if final >= len(source):
                self.pending = source[escape:]
                break

            sequence = source[escape:final + 1]
            params = source[escape + 2:final]
            final_byte = source[final]
            private_dsr = final_byte == ord("n") and params.startswith(b"?")
            kitty_keyboard = (
                final_byte == ord("u")
                and params[:1] in (b"<", b">", b"=", b"?")
            )
            if not (private_dsr or kitty_keyboard):
                output.extend(sequence)
            offset = final + 1

        return bytes(output)


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
        self._input_filter = _RendererInputFilter()

    def feed(self, data: bytes) -> None:
        filtered = self._input_filter.process(data)
        if filtered:
            self.stream.feed(filtered)

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

    def screen_rows(self) -> list[str]:
        """Plain-text rows of the current screen, laid out at their real
        positions — the source alt-screen TUI prompt detection needs, since the
        raw byte stream collapses cursor-addressed rows into one glued line."""
        return list(self.screen.display)

    def resize(self, cols: int, rows: int) -> None:
        self.screen.resize(rows, cols)
