# Прогресс разработки Cucoudle

Этот файл — хронологический append-only журнал значимых инкрементов разработки. Новые записи добавляются в конец; существующие записи не переписываются.

## Шаблон записи

```markdown
## YYYY-MM-DD — Название инкремента

**Цель:**

**Сделано:**

**Затронутые компоненты:**

**Проверки:**

**Решения, ограничения и проблемы:**

**Следующий шаг:**
```

---

## 2026-07-11 — Инициализация репозитория

**Цель:** Зафиксировать назначение проекта и создать основу для дальнейшей разработки.

**Сделано:** Создан репозиторий Cucoudle и README с описанием мобильного приложения для удалённого управления сессиями Cursor, Codex и Claude.

**Затронутые компоненты:** `README.md`, спецификация первоначальной структуры репозитория.

**Проверки:** Проверено наличие README и согласованность описания назначения проекта.

**Решения, ограничения и проблемы:** На этом этапе технологический стек и продуктовые функции намеренно не фиксировались.

**Следующий шаг:** Подготовить окружение мобильной разработки и уточнить первый демонстрационный сценарий.

## 2026-07-11 — Проектирование окружения Expo Go

**Цель:** Определить минимальный путь локальной разработки и запуска приложения на реальном iPhone.

**Сделано:** Зафиксирован дизайн окружения на базе Expo с TypeScript, запуском через Expo Go по QR-коду и tunnel-режимом как резервным вариантом подключения.

**Затронутые компоненты:** `docs/superpowers/specs/2026-07-11-expo-go-environment-design.md`.

**Проверки:** Спецификация проверена на наличие требований к установке зависимостей, диагностике Expo, TypeScript-проверке и запуску Metro.

**Решения, ограничения и проблемы:** В репозитории пока зафиксирован дизайн окружения, но само Expo-приложение ещё не создано. Собственная нативная сборка и EAS не входят в текущий этап.

**Следующий шаг:** Создать минимальный Expo-проект и проверить запуск на реальном iPhone.

## 2026-07-11 — Единые инструкции и документы для презентации

**Цель:** Дать Codex и Claude Code одинаковые правила и начать системно собирать материал для итоговой презентации хакатона.

**Сделано:** Создан основной `AGENTS.md`, добавлен импорт из `CLAUDE.md`, заведены хронологический журнал разработки и актуальное описание реализации.

**Затронутые компоненты:** `AGENTS.md`, `CLAUDE.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md` и связанная спецификация.

**Проверки:** Проверены импорт `@AGENTS.md`, наличие обязательных правил обновления обоих документов и формат Markdown.

**Решения, ограничения и проблемы:** Прогресс ведётся append-only, а описание реализации обновляется как цельный снимок. В документы разрешено записывать только подтверждённые факты.

**Следующий шаг:** При создании Expo-приложения обновить оба документа в том же коммите.

## 2026-07-11 — Direct-to-main Git-процесс

**Цель:** Ускорить интеграцию изменений во время хакатона без потери чужих коммитов.

**Сделано:** В общих инструкциях закреплена работа напрямую в `main` без обязательных веток и pull request. Для отклонённого push установлен процесс `git pull --rebase origin main`, самостоятельного разрешения конфликтов, повторной проверки и обычного push.

**Затронутые компоненты:** `AGENTS.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md` и связанная спецификация процесса.

**Проверки:** Проверено наличие direct-to-main правила, команды rebase, самостоятельного разрешения конфликтов, повторных проверок и явного запрета force-push.

**Решения, ограничения и проблемы:** Переписывание опубликованной истории `main` запрещено. Агент обращается к пользователю только при неоднозначном конфликте или существенном риске потери данных.

**Следующий шаг:** Применять процесс ко всем следующим инкрементам и обновлять презентационные документы в тех же коммитах.

## 2026-07-11 — Relay и shared protocol (разработчик 3)

**Цель:** Реализовать канал десктоп↔мобила: shared-схемы протокола и WebSocket relay-брокер.

**Сделано:** Создан монорепо на npm workspaces (ESM, запуск через `tsx`, тесты на vitest). Пакет `@cucoudle/protocol`: zod-схемы versioned envelope (request/response/event), домена сессий (`Session`, `AgentKind`, `SessionStatus`, `MobileDevice`, `TerminalOutput`), схемы MVP-методов и событий, error codes, JSON-examples и хелперы `parseWireMessage`/`makeResponse`/`makeError`/`makeEvent`. Сервис `@cucoudle/relay` (Fastify + `@fastify/websocket`): маршруты `/v1/ws/desktop`, `/v1/ws/mobile`, health `/healthz` и `/readyz`; pairing по коду/QR через `desktop.pairing.create` + `mobile.pair`, выдача `mobileSessionToken` и `mobile.resume`; presence-события `mobile.paired`/`mobile.disconnected`; прозрачный форвардинг mobile→desktop с корреляцией ответов по `id` и fan-out событий desktop→mobile. Добавлены fake-desktop/fake-mobile скрипты и сквозной smoke-тест минимального demo-контракта.

**Затронутые компоненты:** `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `packages/protocol/*`, `apps/relay/*`, `README.md`.

**Проверки:** `npx vitest run` — 29 passed (6 файлов: protocol envelope/methods, relay pairing/app/handlers/e2e). Живой smoke `npm run relay` + fake-desktop + fake-mobile: pairing, `session.list`, `session.subscribe`, стрим `terminal.output`, доставка `session.input` в fake-desktop подтверждены вручную.

**Решения, ограничения и проблемы:** Relay in-memory — при рестарте pairing и токены теряются (допустимо для MVP). Relay не хранит transcript и не присваивает `seq`. `session.subscribe` replay/snapshot — ответственность десктопа; relay только форвардит. Пакеты потребляются как TS-исходники без build-шага (relay через tsx/vitest, mobile через Metro). QR `relayUrl` берётся из `RELAY_MOBILE_URL` (по умолчанию localhost) — для удалённого demo подставляется публичный адрес.

**Следующий шаг:** Подключить настоящий desktop-daemon (разработчик 1) и mobile-app (разработчик 2) к relay; проверить Android/Linux; при необходимости поднять tunnel/публичный адрес relay для удалённого demo.

## 2026-07-11 — Hardening relay-контрактов

**Цель:** Исключить ошибочную маршрутизацию ответов и зависшие mobile requests перед подключением реального desktop daemon.

**Сделано:** Pending requests теперь адресуются парой `desktopId` + исходный request `id`; конфликтующий in-flight ID отклоняется с `INVALID_MESSAGE`. Добавлены configurable timeout desktop response, ответ `DESKTOP_OFFLINE` всем pending requests при disconnect, безопасная замена повторного desktop connection и сохранение исходного ID в protocol errors. Новый pairing code инвалидирует предыдущий код того же desktop. В опубликованную relay-структуру аккуратно интегрированы изменения после параллельного обновления `origin/main`.

**Затронутые компоненты:** `packages/protocol/src/envelope.ts`, relay state/handlers/runtime config, protocol и relay tests, lockfile, README и protocol contracts. Параллельные файлы `apps/desktop` не изменялись серверным инкрементом.

**Проверки:** `npm test` — 34 passed (6 файлов); `npm run typecheck` — успешно; `npm audit` — 0 vulnerabilities. Vitest обновлен с уязвимой 2.1.9 до 3.2.7.

**Решения, ограничения и проблемы:** Wire request ID не переписывается, поэтому relay разрешает только один одинаковый in-flight ID в рамках desktop. Timeout возвращает `INTERNAL_ERROR`, так как отдельного protocol error code для timeout пока нет. Pairing, resume tokens и routing state остаются in-memory; desktop device-secret authentication еще не реализована.

**Следующий шаг:** Проверить реальный Python desktop client против relay, затем развернуть relay за TLS на выделенном сервере с process supervisor и закрытым firewall.

## 2026-07-11 — Desktop daemon: PTY-мост, shim'ы и relay-клиент (разработчик 1)

**Цель:** Реализовать desktop-часть MVP: прозрачный запуск CLI-агентов в управляемом PTY, локальный мост терминала, установщик shell-интеграции и клиент relay — строго по контрактам `docs/protocol-contracts.md`.

**Сделано:**

- Создан Python-пакет `apps/desktop/cucoudle_desktop` (Python 3.11+, зависимости `pydantic`, `websockets`, `qrcode`).
- `protocol.py` — Pydantic-модели, зеркалящие wire-контракт: версионированный конверт request/response/event, `Session`, `ErrorCode`, хелперы сборки/парсинга.
- `session.py` — `GenericPtySession` на stdlib: запуск реального бинаря в PTY, стриминг вывода через `asyncio`, ввод, resize, `interrupt` (SIGINT по группе), захват кода выхода; дочерний процесс получает управляющий терминал (`setsid` + `TIOCSCTTY`), поэтому локальный Ctrl+C доходит до процесса.
- `registry.py` — реестр сессий: единый монотонный `seq` на демон, ограниченный буфер вывода, ответ `session.subscribe` в режимах `live`/`replay`/`snapshot`.
- `ipc.py` — length-prefixed фреймы поверх Unix-сокета для канала shim/CLI ↔ демон (сырые байты терминала + управляющие JSON-фреймы).
- `shim_template.py` — самодостаточные stdlib-shim'ы; при недоступности демона, не-tty или уже управляемой сессии — прозрачный `exec` реального бинаря.
- `installer.py` — обнаружение реальных бинарей (исключая каталог shim'ов), генерация shim'ов, идемпотентная правка shell-rc с маркированным блоком и бэкапом, `install`/`uninstall`/`doctor`.
- `daemon.py` — Unix-сокет-сервер (мост терминала + control-канал) и связка реестра с relay-клиентом: фан-аут вывода PTY в локальный терминал, буфер и relay; обработка форварднутых mobile-запросов (`session.list`/`subscribe`/`input`/`interrupt`/`terminal.resize`) и событий (`session.created`/`updated`/`ended`, `terminal.output`).
- `relay_client.py` — подключение с backoff, `desktop.register`, `desktop.pairing.create`, корреляция request/response, диспетчеризация форварднутых mobile-запросов, обработка `mobile.paired`/`mobile.disconnected`.
- `cli.py` — команды `daemon`, `install`, `uninstall`, `doctor`, `pair` (QR в терминале), `status`, `sessions`.
- README десктопа и Python-игноры в `.gitignore`.

**Затронутые компоненты:** новый каталог `apps/desktop/` (пакет `cucoudle_desktop`, тесты, `pyproject.toml`, `README.md`), `.gitignore`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:**

- `pytest` — 38 тестов зелёные (протокол, IPC-фреймы, установщик, реестр replay/snapshot, PTY-сессия, e2e-мост shim↔демон↔PTY, relay-клиент против mock-relay).
- Живой прогон: реальный сгенерированный shim под настоящим PTY против запущенного демона — ввод «hello-from-terminal» зеркалится к управляемому `/bin/cat` и возвращается; `cucoudle sessions`/`status` показывают живую сессию; Ctrl+C (`\x03`) завершает сессию (exit=-2); обрыв relay не роняет демон.
- `cucoudle doctor` на изолированном `HOME` находит реальные `claude`/`codex`; `cucoudle pair` без демона выдаёт понятную ошибку.

**Решения, ограничения и проблемы:**

- Локальный канал shim↔демон — Unix-сокет с собственным фреймингом (не WebSocket): быстрый старт shim'а и чистый байтовый мост терминала.
- PTY реализован на stdlib (`os.openpty` + `subprocess` + `fcntl`/`termios`) — без нативных зависимостей.
- Демон владеет master-стороной PTY: отключение shim'а (закрытие терминала) не убивает сессию — ею можно управлять с телефона.
- Relay проверен через mock-relay; совместный прогон с настоящим relay Разработчика 3 ещё впереди.
- Пока не сделано: tray/GUI (PySide6), персистентность сессий в SQLite между рестартами, полноценные `mobile.resume` и точный `terminal.resize`.

**Следующий шаг:** Интеграция с настоящим relay Разработчика 3 — сквозной pairing и управление сессией с fake-mobile, затем с реальным приложением; далее tray/settings UI и персистентность сессий в SQLite.

## 2026-07-11 — Реальный desktop/relay smoke и deployment bundle

**Цель:** Проверить совместимость независимо разработанных desktop и relay и подготовить воспроизводимое удаленное развертывание.

**Сделано:** Локально запущены настоящий TypeScript relay и настоящий Python desktop daemon. Desktop зарегистрировался, запросил pairing code, технический mobile WebSocket-клиент выполнил `mobile.pair` и `session.list`; desktop получил presence-события подключения и отключения. Добавлены `Dockerfile.relay`, hardened compose service и Nginx virtual host для `relay.launert.dev` с существующим wildcard certificate.

**Затронутые компоненты:** `.dockerignore`, `Dockerfile.relay`, `deploy/relay/*`, README и актуальное описание реализации. Desktop source code не менялся.

**Проверки:** Реальный desktop→relay→mobile smoke — успешно; `docker compose config` — успешно; `npm test` — 34 passed; `npm run typecheck` — успешно; `npm audit` — 0 vulnerabilities. Локальная Docker image не собрана, потому что Docker daemon на development Mac не запущен.

**Решения, ограничения и проблемы:** Контейнер публикует relay только на `127.0.0.1:8787`, наружу WebSocket отдает Nginx по TLS. На целевом сервере Node отсутствует, Docker и Nginx доступны только администратору, а выданная SSH-учетка не состоит в sudoers и не имеет доступа к Docker socket. Поэтому deployment не активирован и требует административного запуска описанных команд.

**Следующий шаг:** Администратору применить `deploy/relay/README.md`, после чего проверить `https://relay.launert.dev/healthz` и провести тот же pairing smoke через `wss://relay.launert.dev`.
