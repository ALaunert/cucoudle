# Серверный рендер терминала (terminal.render)

Дата: 2026-07-11. Статус: утверждён.

## Проблема

Мобилка получает сырой PTY-поток (`terminal.output`) и показывает его как плоский текст,
вырезая ANSI. Claude Code / Codex — TUI с курсорными перерисовками, поэтому вывод на
телефоне нечитаем: цвета потеряны, перерисовки спиннеров превращаются в дублирующийся мусор.

## Решение

Эмулировать терминал на десктопе (библиотека `pyte`) и слать мобилке готовое
стилизованное состояние. Мобилка рендерит его нативно, без WebView.

## Desktop

- Зависимость `pyte` (чистый Python).
- На сессию: `pyte.HistoryScreen(cols, rows)` + `ByteStream`. Сырые байты PTY идут,
  как раньше, в шим и `terminal.output`, плюс скармливаются эмулятору.
- Модель: **history** (строки, ушедшие из viewport; append-only, неизменяемы) +
  **screen** (текущие rows строк; целиком заменяются). Перерисовки TUI схлопываются.
- Эмиссия `terminal.render` с коалесингом ~50 мс.
- History на десктопе ограничена (~1000 строк в снапшоте).

## Протокол (additive)

- Стилизованный отрезок: `{ t, fg?, bg?, b?, i?, u?, d? }` (цвет — имя ANSI или hex).
  Строка = массив отрезков.
- Событие `terminal.render`: `{ sessionId, seq, historyAppend: StyledLine[], screen: StyledLine[] }`.
- `session.subscribe` result: опциональное `terminalRender: { history, screen, lastSeq }` —
  полный снапшот; replay для рендера не делаем, при реконнекте всегда снапшот.
- `terminal.output` / `terminalBuffer` не трогаем (совместимость). Дублирование трафика
  осознанно принято на время хакатона.

## Mobile

- Состояние `renderBySessionId: { history, screen, lastSeq }`; редьюсер: append history,
  replace screen, приём снапшота из subscribe, сброс на реконнект-снапшоте.
- Компонент `StyledTerminal`: FlatList строк (history + screen), строка — `<Text>` с
  цветными спанами, monospace, тёмная тема; палитра 16 ANSI-цветов, читаемая на тёмном.
  Автоскролл с отключением при ручной прокрутке (перенос поведения из `PlainTerminal`).
- `PlainTerminal` остаётся fallback'ом, если `terminalRender` от десктопа не приходит.

## Тесты

- Desktop (pytest): SGR-цвета, схлопывание перерисовок спиннера, лимит history, снапшот.
- Protocol: zod-схемы события и снапшота.
- Mobile (jest): редьюсер render-событий и снапшота; спаны/цвета в `StyledTerminal`;
  fallback на `PlainTerminal`.

## Ограничения

- pyte покрывает не 100% xterm (для Claude Code/Codex достаточно).
- Трафик временно дублируется (raw + render).
- Точность палитры — приближение к десктопным темам, не пиксель-в-пиксель.
