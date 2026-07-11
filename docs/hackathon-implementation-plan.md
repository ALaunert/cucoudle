# Cucoudle: hackathon implementation plan

## Цель MVP

Собрать рабочий end-to-end flow для CLI-сессий Claude, Codex и Cursor:

1. Пользователь устанавливает desktop-приложение на macOS или Linux.
2. Desktop-приложение автоматически настраивает shell integration.
3. Пользователь запускает CLI как обычно: `claude`, `codex`, `agent` или `cursor`.
4. Сессия стартует через desktop daemon в управляемом PTY.
5. На iOS/Android приложении появляется список активных сессий.
6. Пользователь с телефона открывает сессию, видит вывод терминала и отправляет ввод.

Главный принцип MVP: пользователь не должен помнить отдельную команду-обертку. Обертки, PTY, relay и синхронизацию берет на себя desktop-приложение.

## Не входит в MVP

- Управление сессиями, запущенными внутри Claude Desktop, Cursor Desktop или IDE extension.
- GUI automation через Accessibility, Screen Recording или управление окнами.
- Полноценный semantic parser для всех TUI-состояний.
- Native Codex app-server adapter.
- Claude SDK/background adapter.
- Production-grade end-to-end encryption.
- Полноценная упаковка `.dmg`, `.deb`, App Store и Play Store.

Эти вещи можно проектировать как следующие этапы, но на хакатоне фокус только на CLI.

## Стек

### Desktop

- Python 3.12+
- `asyncio`
- `FastAPI` или `aiohttp` для локального API и WebSocket
- `pexpect` / `ptyprocess` для запуска CLI в PTY
- `pyte` для базового terminal screen parsing, если понадобится
- `libtmux` для будущего tmux adapter
- `psutil` для диагностики процессов
- `pydantic` для схем
- SQLite для локального session/event store
- `keyring` для токенов и device secrets
- `cryptography` или `PyNaCl` для pairing keys
- PySide6 для tray/settings UI

### Mobile

- Expo React Native
- TypeScript
- Expo Router
- WebSocket client
- `expo-secure-store` для device credentials
- `react-native-mmkv` для локального cache/state
- `expo-camera` для QR pairing
- `expo-notifications` позже для push
- custom UI components для sessions, terminal и timeline

### Backend / Relay

- Node.js 20+
- TypeScript
- Fastify
- `ws` или Fastify WebSocket
- `zod` для схем
- In-memory store для MVP
- Postgres/Redis позже, если понадобится persistence и presence на несколько серверов

### Shared Protocol

- TypeScript-first схемы в `packages/protocol`
- JSON events поверх WebSocket
- `zod` schemas для mobile/backend
- Pydantic модели на desktop с теми же полями
- Detailed wire contracts live in `docs/protocol-contracts.md`

## Предлагаемая структура репозитория

```text
apps/
  desktop/
    cucoudle_desktop/
      daemon/
      adapters/
      bridge/
      installer/
      tray/
    scripts/
    tests/

  mobile/
    app/
    src/
      screens/
      components/
      protocol/
      stores/

  relay/
    src/
      server.ts
      pairing.ts
      relay.ts
      protocol.ts

packages/
  protocol/
    src/
      events.ts
      commands.ts
      sessions.ts
    examples/

docs/
  hackathon-implementation-plan.md
```

## Архитектура MVP

```text
Terminal
  -> ~/.cucoudle/bin/claude shim
  -> Desktop daemon local API
  -> real claude/codex/cursor CLI inside PTY
  -> output mirrored to:
       1. original terminal
       2. desktop session store
       3. relay WebSocket
       4. mobile app

Mobile app
  -> relay WebSocket
  -> desktop daemon
  -> PTY input
  -> real CLI process
```

## Desktop integration model

Desktop app создает shims:

```text
~/.cucoudle/bin/claude
~/.cucoudle/bin/codex
~/.cucoudle/bin/agent
~/.cucoudle/bin/cursor
```

И добавляет shim directory в shell config:

```bash
export PATH="$HOME/.cucoudle/bin:$PATH"
```

Shim поведение:

1. Получить `argv`, `cwd`, `env`, terminal size.
2. Найти real binary из desktop config.
3. Если daemon доступен, попросить daemon запустить managed session.
4. Подключить текущий terminal stdin/stdout к daemon PTY bridge.
5. Если daemon недоступен, выполнить fallback: `exec real_binary "$@"`.

Важно: fallback обязателен. Установка Cucoudle не должна ломать обычный запуск CLI.

## Общий session model

```ts
export type SessionStatus =
  | "starting"
  | "running"
  | "waiting"
  | "stopped"
  | "error";

export type AgentKind =
  | "claude"
  | "codex"
  | "cursor"
  | "shell"
  | "unknown";

export type Session = {
  id: string;
  agent: AgentKind;
  title: string;
  command: string;
  argv: string[];
  cwd: string;
  status: SessionStatus;
  createdAt: string;
  lastActivityAt: string;
  exitCode?: number;
};
```

## Wire events and commands

Все WebSocket-сообщения используют versioned envelope из `docs/protocol-contracts.md`: `kind: "request"`, `kind: "response"` или `kind: "event"`. В этом плане названия ниже являются method/event names, а не полной wire shape.

Для первого demo обязательны methods/events:

- `desktop.register`
- `desktop.pairing.create`
- `mobile.pair`
- `mobile.paired`
- `session.created`
- `session.list`
- `session.subscribe`
- `terminal.output`
- `session.input`
- `session.interrupt`
- `session.ended`

`mobile.resume` описан в `docs/protocol-contracts.md` для reconnect polish, но не является hard gate для первого demo.

## Pairing MVP

Pairing должен быть простым:

1. Desktop app показывает QR.
2. Desktop app запрашивает одноразовый pairing code у relay через `desktop.pairing.create`.
3. QR содержит relay mobile URL, desktop device id и одноразовый pairing code.
4. Mobile сканирует QR.
5. Mobile подключается к relay и предъявляет pairing code.
6. Relay валидирует code, связывает mobile с desktop и отправляет desktop событие `mobile.paired`.

Минимальный QR payload:

```json
{
  "relayUrl": "wss://relay.example.test/v1/ws/mobile",
  "desktopId": "desk_123",
  "pairingCode": "123456",
  "expiresAt": "2026-07-11T12:00:00Z"
}
```

Production позже:

- device public keys;
- signed pairing payload;
- per-device revocation;
- encrypted payloads end-to-end.

## Разделение на 3 разработчиков

### Разработчик 1: Desktop

Платформа: macOS primary, Linux compatibility через контракт с разработчиком 3.

Зона владения:

```text
apps/desktop/
docs/*desktop*
```

Ответственность:

- daemon process;
- local API;
- PTY launch/bridge;
- shim generator;
- shell integration installer;
- real binary detection;
- local session registry;
- fallback path, если daemon недоступен;
- desktop-side relay client.

Основные задачи:

1. Реализовать daemon skeleton.
2. Реализовать `GenericPtySession`.
3. Реализовать local WebSocket/API для запуска и управления сессией.
4. Реализовать shims для `claude`, `codex`, `agent`, `cursor`.
5. Реализовать `install-shims`, `uninstall-shims`, `doctor`.
6. Стримить `session.created`, `terminal.output`, `session.ended`.
7. Подключить desktop daemon к relay.

Готовность для MVP:

- `claude`, `codex`, `agent` запускаются привычной командой через shim;
- терминал продолжает работать как обычно;
- mobile получает live output;
- input с mobile попадает в PTY;
- Ctrl+C работает локально и с mobile.

### Разработчик 2: Mobile Frontend

Платформа: iOS primary, Android совместимость проверяется с разработчиком 3.

Зона владения:

```text
apps/mobile/
```

Ответственность:

- Expo app;
- pairing screen;
- sessions list;
- session detail;
- raw terminal view;
- composer;
- local mobile state;
- визуальные состояния сессий.

Основные задачи:

1. Создать Expo app skeleton.
2. Реализовать QR scan/manual pairing entry.
3. Реализовать WebSocket client.
4. Реализовать `SessionsScreen`.
5. Реализовать `SessionScreen`.
6. Реализовать terminal output renderer.
7. Реализовать composer и отправку `session.input`.
8. Реализовать action buttons: interrupt, reconnect, clear local buffer.

Готовность для MVP:

- iOS app подключается к relay;
- видит список сессий;
- открывает сессию;
- показывает streaming terminal output;
- отправляет ввод в desktop PTY.

### Разработчик 3: Backend / Relay / Android / Linux Integration

Платформа: Linux + Android.

Зона владения:

```text
apps/relay/
packages/protocol/
docs/*protocol*
```

Ответственность:

- relay server;
- shared protocol;
- pairing flow;
- Android smoke tests;
- Linux daemon smoke tests;
- integration scripts for demo.

Основные задачи:

1. Создать Fastify/WebSocket relay.
2. Реализовать desktop connection registration.
3. Реализовать mobile pairing connection.
4. Проксировать сообщения mobile <-> desktop.
5. Описать и экспортировать TypeScript protocol schemas.
6. Сделать examples для всех событий и команд.
7. Проверить mobile app на Android.
8. Проверить desktop daemon на Linux.
9. Подготовить demo relay config.

Готовность для MVP:

- desktop подключается к relay;
- mobile подключается к тому же desktop через pairing;
- события и команды проходят в обе стороны;
- Android видит и управляет сессией;
- Linux daemon запускает хотя бы `bash` или fake CLI через PTY.

## Точки соприкосновения

Detailed message shapes, request/response envelopes, pairing flow, reconnect behavior, and error codes are defined in `docs/protocol-contracts.md`.

### Desktop <-> Relay

Транспорт: WebSocket.

Desktop отправляет:

- register desktop;
- session events;
- terminal output;
- command responses.

Desktop принимает:

- mobile commands;
- session input;
- interrupt;
- resize.

Владелец контракта: Backend / Relay.

### Relay <-> Mobile

Транспорт: WebSocket.

Mobile отправляет:

- pairing request;
- session list;
- subscribe;
- input;
- interrupt.

Mobile принимает:

- session list result;
- session events;
- terminal output;
- errors.

Владелец контракта: Backend / Relay.

### Desktop <-> Mobile product behavior

Важные договоренности:

- Desktop является source of truth по sessions.
- Relay не хранит transcript в MVP.
- Mobile может cache output локально, но после reconnect запрашивает session list и последние события у desktop.
- Если desktop offline, mobile показывает состояние `offline`, а не пытается реконструировать session.
- Если daemon умер, shim fallback запускает real CLI без remote control.

## План реализации

### Этап 0: фиксация контрактов

Время: первые 1-2 часа.

Результат:

- создана структура `apps/*` и `packages/protocol`;
- зафиксированы `Session`, `WireMessage`, MVP methods и MVP events;
- есть JSON examples;
- все трое используют одинаковые event names.

### Этап 1: локальный вертикальный slice

Время: 2-4 часа.

Результат:

- desktop daemon запускает `bash` или fake long-running command;
- mobile подключается через mock relay или настоящий relay;
- terminal output виден в mobile;
- mobile input возвращается в PTY.

Допустимый shortcut: direct local WebSocket без relay только для самого раннего smoke test PTY/UI. Основной MVP flow должен идти через relay.

### Этап 2: relay и pairing

Время: 4-7 часов.

Результат:

- relay принимает desktop и mobile;
- QR/manual code подключает phone к desktop;
- mobile управляет PTY через relay.

### Этап 3: shims и привычный запуск CLI

Время: 7-10 часов.

Результат:

- desktop умеет `install-shims`;
- `which claude` указывает на `~/.cucoudle/bin/claude`;
- real binary path сохранен;
- `claude`, `codex`, `agent` запускаются как обычно;
- если daemon выключен, shim делает fallback.

### Этап 4: polish demo

Время: финальные 1-2 часа.

Результат:

- README с командами запуска;
- стабильный demo script;
- понятные статусы в mobile;
- error states;
- короткая запись demo или набор скриншотов.

## Demo script

1. Запустить relay.
2. Запустить desktop daemon на macOS.
3. В desktop settings включить CLI integration.
4. На телефоне отсканировать QR.
5. В терминале выполнить:

```bash
claude
```

или для стабильного demo:

```bash
bash
```

6. Убедиться, что сессия появилась на телефоне.
7. Открыть сессию на телефоне.
8. Отправить ввод с телефона.
9. Показать, что ввод появился в локальной CLI-сессии.
10. Запустить вторую сессию `codex` или `agent`.
11. Переключиться между сессиями на телефоне.

## Риски

### PTY/TUI rendering

Некоторые CLI рисуют full-screen TUI, используют escape sequences и alternate screen. Для MVP можно показывать raw output stream. Более точный terminal renderer добавляется позже.

### Shell integration

Разные shell config файлы могут конфликтовать. MVP должен:

- делать backup перед изменением;
- добавлять marked block;
- иметь `uninstall-shims`;
- иметь `doctor`.

### macOS permissions

Если daemon запускает CLI вместо Terminal, macOS может потребовать доступ к файлам в `Documents`, `Desktop`, `Downloads`, iCloud Drive. Для MVP нужно явно описать Full Disk Access как возможный permission.

### Cursor CLI command name

У разных установок Cursor CLI команда может быть `cursor`, `agent` или другой wrapper. Installer должен показывать найденные binaries и позволять отключить неподдержанный tool.

### Relay reliability

Для MVP relay может быть in-memory. При рестарте relay pairing и active connections теряются. Это допустимо для хакатона.

## Definition of Done для MVP

- Desktop daemon запускается на macOS.
- Desktop daemon запускается на Linux хотя бы с `bash`.
- Mobile app запускается на iOS.
- Mobile app запускается на Android.
- Phone подключается к desktop через relay.
- Список сессий отображается на телефоне.
- CLI запускается обычной командой через shim.
- Terminal output стримится на телефон.
- Input с телефона попадает в CLI.
- Можно переключиться между двумя активными сессиями.
- Если daemon недоступен, shim не ломает CLI и запускает real binary напрямую.
