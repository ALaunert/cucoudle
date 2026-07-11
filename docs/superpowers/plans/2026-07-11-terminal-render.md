# Terminal Render (desktop-side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Красивый вывод сессии на мобилке: десктоп эмулирует терминал (pyte) и шлёт стилизованное состояние (`terminal.render`), мобилка рендерит его нативно с цветами.

**Architecture:** Демон скармливает сырые PTY-байты pyte-эмулятору per session; коалесцирует кадры (~50 мс) и эмитит `terminal.render` (append-only history + заменяемый screen). `session.subscribe` дополняется снапшотом `terminalRender`. Мобилка держит `renderBySessionId` в состоянии и рендерит `StyledTerminal` (FlatList цветных строк), c fallback на `PlainTerminal`.

**Tech Stack:** Python (pyte, asyncio, pytest), TypeScript (zod), React Native / Expo (jest).

Spec: `docs/superpowers/specs/2026-07-11-terminal-render-design.md`

---

### Task 1: Протокол — схемы terminal.render

**Files:**
- Create: `packages/protocol/src/terminalRender.ts`
- Modify: `packages/protocol/src/events.ts` (добавить `"terminal.render"` в `DESKTOP_EVENTS`, реэкспорт схем)
- Modify: `packages/protocol/src/methods.ts` (в `SessionSubscribeResultSchema` добавить `terminalRender`)
- Modify: `packages/protocol/src/index.ts` (экспорт)
- Test: `packages/protocol/src/terminalRender.test.ts`

- [ ] **Step 1: Схемы**

```ts
// terminalRender.ts
import { z } from "zod";

export const StyledRunSchema = z.object({
  t: z.string(),
  fg: z.string().optional(),
  bg: z.string().optional(),
  b: z.literal(true).optional(),
  i: z.literal(true).optional(),
  u: z.literal(true).optional(),
  d: z.literal(true).optional(),
});
export type StyledRun = z.infer<typeof StyledRunSchema>;

export const StyledLineSchema = z.array(StyledRunSchema);
export type StyledLine = z.infer<typeof StyledLineSchema>;

export const TerminalRenderDataSchema = z.object({
  sessionId: z.string(),
  seq: z.number(),
  historyAppend: z.array(StyledLineSchema),
  screen: z.array(StyledLineSchema),
});
export type TerminalRenderData = z.infer<typeof TerminalRenderDataSchema>;

export const TerminalRenderSnapshotSchema = z.object({
  history: z.array(StyledLineSchema),
  screen: z.array(StyledLineSchema),
  lastSeq: z.number(),
});
export type TerminalRenderSnapshot = z.infer<typeof TerminalRenderSnapshotSchema>;
```

В `events.ts`: `"terminal.render"` в `DESKTOP_EVENTS` (relay форвардит по этому списку — apps/relay/src/handlers.ts строит `DESKTOP_EVENT_SET` из него, отдельных правок relay не нужно).
В `methods.ts`: `terminalRender: TerminalRenderSnapshotSchema.optional()` в `SessionSubscribeResultSchema`.

- [ ] **Step 2: Тест** — parse валидного `TerminalRenderData`, reject без `sessionId`; `DESKTOP_EVENTS` содержит `terminal.render`.
- [ ] **Step 3: Запустить тесты protocol** (`npm test -w @cucoudle/protocol` или jest в пакете), убедиться в зелёном.
- [ ] **Step 4: Commit** `feat(protocol): terminal.render event + subscribe snapshot`

### Task 2: Desktop — TerminalRenderer (pyte)

**Files:**
- Modify: `apps/desktop/pyproject.toml` (dependency `pyte>=0.8`)
- Create: `apps/desktop/cucoudle_desktop/render.py`
- Test: `apps/desktop/tests/test_render.py`

- [ ] **Step 1: Реализация**

```python
# render.py
from __future__ import annotations
import pyte

HISTORY_LIMIT = 1000          # строк истории в снапшоте/памяти рендерера
_PYTE_HISTORY = 10_000        # запас pyte, чтобы deque не переполнялся на демо

def _char_style(char) -> dict:
    run: dict = {}
    fg, bg = char.fg, char.bg
    if char.reverse:
        fg, bg = (bg if bg != "default" else "black"), (fg if fg != "default" else "white")
    if fg != "default": run["fg"] = fg
    if bg != "default": run["bg"] = bg
    if char.bold: run["b"] = True
    if char.italics: run["i"] = True
    if char.underscore: run["u"] = True
    return run

def render_line(cells: dict, width: int) -> list[dict]:
    """pyte line (dict col->Char) -> список styled runs, без хвостовых пробелов."""
    runs: list[dict] = []
    # обрезать хвостовые пустые ячейки
    last = -1
    for x in range(width):
        ch = cells.get(x)
        if ch is not None and (ch.data not in ("", " ") or ch.bg != "default" or ch.reverse):
            last = x
    for x in range(last + 1):
        ch = cells.get(x)
        data = ch.data if ch is not None and ch.data else " "
        style = _char_style(ch) if ch is not None else {}
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
        return [render_line(self.screen.buffer[y], self.screen.columns)
                for y in range(self.screen.lines)]

    def take_frame(self, session_id: str) -> dict:
        fresh = self._drain_history()
        self.seq += 1
        return {"sessionId": session_id, "seq": self.seq,
                "historyAppend": fresh, "screen": self._screen_lines()}

    def snapshot(self) -> dict:
        self._drain_history()
        return {"history": list(self.history), "screen": self._screen_lines(),
                "lastSeq": self.seq}

    def resize(self, cols: int, rows: int) -> None:
        self.screen.resize(rows, cols)
```

- [ ] **Step 2: Тесты (pytest)** — красный текст даёт run с `fg: "red"`; спиннер с `\r`-перерисовкой не плодит history и обновляет screen; 30 строк вывода при rows=24 кладут вытесненные строки в history ровно один раз; snapshot после take_frame согласован (lastSeq, history).
- [ ] **Step 3: `pip install -e apps/desktop` (или uv/pip как принято) + `pytest apps/desktop/tests/test_render.py`** — зелёный.
- [ ] **Step 4: Commit** `feat(desktop): pyte-based TerminalRenderer`

### Task 3: Desktop — интеграция в daemon/registry

**Files:**
- Modify: `apps/desktop/cucoudle_desktop/registry.py` (`SessionEntry.renderer`, снапшот в `subscribe_view`)
- Modify: `apps/desktop/cucoudle_desktop/daemon.py` (`_on_output`: feed + коалесцированный emit `terminal.render`; resize → renderer.resize)
- Test: `apps/desktop/tests/test_daemon_render.py` (или расширить существующие)

- [ ] **Step 1:** В `SessionEntry` поле `renderer: TerminalRenderer | None`; создавать при старте сессии с cols/rows сессии. В `subscribe_view` добавить `"terminalRender": entry.renderer.snapshot()` во все ветки, где есть session (live/replay/snapshot).
- [ ] **Step 2:** В `_on_output`: `entry.renderer.feed(data)` (сырые bytes, до decode), затем планирование кадра:

```python
def _schedule_render(self, sid: str) -> None:
    if sid in self._render_pending:
        return
    self._render_pending.add(sid)
    loop = asyncio.get_running_loop()
    loop.call_later(0.05, lambda: self._flush_render(sid))

def _flush_render(self, sid: str) -> None:
    self._render_pending.discard(sid)
    entry = self.registry.get(sid)
    if entry is None or entry.renderer is None:
        return
    self._emit("terminal.render", entry.renderer.take_frame(sid))
```

`terminal.resize` → `entry.renderer.resize(cols, rows)` рядом с pty resize. При завершении сессии — финальный flush.
- [ ] **Step 3: Тесты** — после `_on_output` с ANSI-данными приходит event `terminal.render` (замокать relay/emit); subscribe_view содержит `terminalRender`.
- [ ] **Step 4: Запустить весь pytest десктопа** — зелёный.
- [ ] **Step 5: Commit** `feat(desktop): emit terminal.render frames + subscribe snapshot`

### Task 4: Mobile — состояние и редьюсер

**Files:**
- Create: `apps/mobile/src/state/renderBuffer.ts`
- Modify: `apps/mobile/src/state/sessionState.ts` (`renderBySessionId`)
- Modify: `apps/mobile/src/state/sessionReducer.ts` (event `terminal.render`; снапшот из subscribe result; очистка при удалении сессии)
- Test: `apps/mobile/src/state/__tests__/renderBuffer.test.ts` + расширить `sessionReducer.test.ts`

- [ ] **Step 1:**

```ts
// renderBuffer.ts
import type { StyledLine, TerminalRenderData, TerminalRenderSnapshot } from "@cucoudle/protocol";

export const MAX_RENDER_HISTORY = 1000;

export interface RenderBuffer {
  history: StyledLine[];
  screen: StyledLine[];
  lastSeq: number;
}

export function createRenderBuffer(): RenderBuffer {
  return { history: [], screen: [], lastSeq: 0 };
}

export function applyRenderFrame(buffer: RenderBuffer, frame: TerminalRenderData): RenderBuffer {
  if (frame.seq <= buffer.lastSeq) return buffer;
  const history = [...buffer.history, ...frame.historyAppend].slice(-MAX_RENDER_HISTORY);
  return { history, screen: frame.screen, lastSeq: frame.seq };
}

export function replaceRenderSnapshot(snapshot: TerminalRenderSnapshot): RenderBuffer {
  return {
    history: snapshot.history.slice(-MAX_RENDER_HISTORY),
    screen: snapshot.screen,
    lastSeq: snapshot.lastSeq,
  };
}
```

Редьюсер: по образцу `terminalBySessionId` (см. `sessionReducer.ts:125-136` для событий, `:241-246` для снапшота из subscribe, `:194` для удаления).
- [ ] **Step 2: Тесты** — дедуп по seq; обрезка history; снапшот заменяет буфер; subscribe result с `terminalRender` наполняет state; `session.removed` чистит.
- [ ] **Step 3: `npm test` в apps/mobile** (затронутые сьюты) — зелёный.
- [ ] **Step 4: Commit** `feat(mobile): render buffer state for terminal.render`

### Task 5: Mobile — StyledTerminal + интеграция

**Files:**
- Create: `apps/mobile/src/features/session/ansiPalette.ts`
- Create: `apps/mobile/src/features/session/StyledTerminal.tsx`
- Modify: `apps/mobile/src/features/session/SessionScreen.tsx` (render buffer есть → `StyledTerminal`, иначе `PlainTerminal`)
- Test: `apps/mobile/src/features/session/__tests__/StyledTerminal.test.tsx`

- [ ] **Step 1: Палитра** — map имён pyte-цветов на hex (тёмная тема): default→`#e6edf3`, black→`#0d1117`, red→`#f47067`, green→`#57ab5a`, yellow→`#c69026`, blue→`#539bf5`, magenta→`#b083f0`, cyan→`#39c5cf`, white→`#d0d7de`, bright*→светлее; неизвестное значение — трактовать как hex (`#${value}`).
- [ ] **Step 2: StyledTerminal** — FlatList, data = `[...history, ...screen]` (key: `h{index}`/`s{index}`), renderItem: `<Text>` c вложенными `<Text>`-спанами (color/fontWeight/fontStyle/textDecorationLine, dim → opacity 0.6), monospace, фон `#030912` как в PlainTerminal. Автоскролл: `onContentSizeChange` → `scrollToEnd` пока пользователь у низа (реюз `isNearTerminalEnd`).
- [ ] **Step 3: SessionScreen** — `const render = state.renderBySessionId[sessionId]`; если есть и непустой — `<StyledTerminal buffer={render} />`, иначе текущий `<PlainTerminal .../>`.
- [ ] **Step 4: Тесты** — красный run рендерится с цветом палитры; пустой буфер → fallback PlainTerminal в SessionScreen; порядок строк history+screen.
- [ ] **Step 5: Полный `npm test` + `npm run typecheck` в apps/mobile** — зелёный.
- [ ] **Step 6: Commit** `feat(mobile): styled terminal rendering`

### Task 6: Сквозная проверка + документация

- [ ] **Step 1:** Локальный e2e: `scripts/dev-desktop.sh`, запустить сессию с цветным TUI (claude), убедиться через fake-mobile/тест relay или реальный телефон, что `terminal.render` приходит и выглядит корректно. Минимум: юнит-тесты всех трёх пакетов зелёные + ручная проверка кадра из демона.
- [ ] **Step 2:** Обновить `docs/PROGRESS.md` (новая запись) и `docs/FINAL_IMPLEMENTATION.md` (реализовано/ограничения: дублирование raw+render, pyte не 100% xterm, палитра приближённая).
- [ ] **Step 3:** Commit + push в `origin/main`.
