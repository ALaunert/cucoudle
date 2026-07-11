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

## 2026-07-11 — Reconnect-тест мобилы

**Цель:** Закрепить reconnect-флоу мобилы автоматическим тестом поверх укреплённого relay.

**Сделано:** Добавлен интеграционный тест `mobile.resume` по WebSocket: re-link после обрыва сокета и повторный форвардинг `session.list`, а также отказ с `UNAUTHORIZED` при неверном токене. Тест проходит против relay с hardening без изменений в relay-коде.

**Затронутые компоненты:** `apps/relay/src/resume.test.ts`, `.gitignore`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** `npx vitest run` — 36 passed (7 файлов); `npm run typecheck` — успешно.

**Решения, ограничения и проблемы:** CI на GitHub Actions отложен: текущий токен без scope `workflow` не может публиковать `.github/workflows/*`, workflow-файл не заводим, чтобы не блокировать push. Reconnect остаётся best-effort: replay/snapshot по `seq` — ответственность десктопа.

**Следующий шаг:** Вернуться к CI после расширения scope токена; по готовности mobile-приложения прогнать канал с реальным клиентом.

## 2026-07-11 — Полный desktop → relay → mobile PTY smoke

**Цель:** Проверить не только pairing, но и фактическое двустороннее управление живой desktop PTY-сессией через relay.

**Сделано:** В изолированном `HOME` установлены реальные Cucoudle shims, при этом тестовый бинарь `claude` указывал на `/bin/cat`. Обычный запуск shim создал PTY-сессию в настоящем Python daemon. Технический WebSocket mobile-клиент через настоящий TypeScript relay выполнил pairing, `session.list`, `session.subscribe`, отправил `session.input`, получил `terminal.output`, затем отправил `session.interrupt` и получил `session.ended`.

**Затронутые компоненты:** Runtime-код не менялся; обновлены только `docs/PROGRESS.md` и `docs/FINAL_IMPLEMENTATION.md` с фактическим результатом интеграционной проверки.

**Проверки:** Mobile увидел одну running-сессию; строка `hello-from-mobile` была доставлена в PTY, появилась в relay event и в исходном локальном терминале; interrupt завершил процесс с `exitCode=-2`; desktop получил `mobile.paired` и `mobile.disconnected`. Relay и daemon после проверки штатно остановлены.

**Решения, ограничения и проблемы:** Контракт и транспорт desktop↔relay совместимы без дополнительных правок. Проверялся весь управляющий путь, но агентский бинарь был детерминированным `/bin/cat`, а mobile UI — техническим WebSocket-клиентом. Настоящие Claude/Codex/Cursor и Expo-приложение остаются следующей проверкой.

**Следующий шаг:** Повторить тот же сценарий из Expo mobile data layer, затем проверить настоящую Claude или Codex CLI-сессию.

## 2026-07-11 — Контракт полного CLI input и structured interactions

**Цель:** Зафиксировать, что мобильный клиент должен уметь не только отправлять строку, но и полноценно отвечать на approvals, confirmations, choices и любой terminal input, доступный в CLI.

**Сделано:** `docs/protocol-contracts.md` расширен четырьмя additive режимами `session.input`: `text`, `raw`, base64 `bytes` и named `keys` с modifiers. Добавлен structured interaction lifecycle: `interaction.requested`, `interaction.updated`, `interaction.respond`, `interaction.resolved`, модель options/intents для Approve/Reject/Allow once/Allow session/cancel, text responses, reconnect через `activeInteraction` и stale/unknown errors. Обновлены product spec, frontend rendering requirements, ownership, implementation tasks, demo и risk model.

**Затронутые компоненты:** Только спецификации и актуальная документация: `docs/protocol-contracts.md`, CLI MVP design, hackathon implementation plan, `docs/FINAL_IMPLEMENTATION.md`, `docs/PROGRESS.md`. Runtime-код не изменялся.

**Проверки:** Контракты сверены по направлениям mobile→relay→desktop и desktop→relay→mobile; сохранена backward compatibility существующих `text/raw` payloads; raw terminal fallback остается обязательным при отсутствии semantic detector.

**Решения, ограничения и проблемы:** Terminal parity является универсальной гарантией, structured UI — provider-specific enhancement. Relay не интерпретирует approvals. Desktop показывает semantic action только при exact local response binding и отклоняет stale interaction. Новые schemas, daemon handling, relay allowlist и mobile UI еще не реализованы и явно отмечены как implementation gap.

**Следующий шаг:** Реализовать shared schemas и relay allowlist, затем desktop key mapping/provider detector и mobile interaction controls отдельными зонами ответственности.

## 2026-07-11 — Аудит server/mobile rollout и capability negotiation

**Цель:** Проверить свежую interaction-спеку против фактических shared schemas и relay-кода и исключить включение неподдерживаемых controls на mobile.

**Сделано:** Подтверждено, что `apps/mobile` отсутствует в общем `main`, а последний interaction commit менял только Markdown. Выявлен rollout gap: текущие Zod/Pydantic schemas, relay method/event allowlists и error codes еще не поддерживают новый target contract. Добавлен capability negotiation через desktop/mobile offers, `acceptedCapabilities` при register и per-mobile `negotiatedCapabilities` при pair/resume. Зафиксирована фильтрация interaction events и requests для разных mobile connections.

**Затронутые компоненты:** Только target specs и актуальный implementation snapshot; runtime relay, desktop и mobile code не изменялись.

**Проверки:** Фактические `packages/protocol/src/methods.ts`, `events.ts`, `envelope.ts` и `apps/relay/src/handlers.ts` сопоставлены с документацией. История commit `be08446` подтверждает отсутствие изменений `apps/mobile` и runtime backend. Backward-compatible baseline определен для клиентов без capability fields.

**Решения, ограничения и проблемы:** Feature availability определяется пересечением mobile, relay и desktop, а не только общей protocol version. Negotiated set хранится per mobile connection. Текущий runtime остается baseline-only до отдельной реализации schemas, relay negotiation/allowlists, desktop mappings и mobile controls. Непубликованный mobile-код другого разработчика проверить из этой рабочей копии невозможно.

**Следующий шаг:** Сначала реализовать capability negotiation и shared schemas у backend owner, затем передать mobile owner точный generated contract и только после этого включать interaction UI.

## 2026-07-11 — Реализация схем интеракций и режимов ввода в `packages/protocol` (разработчик 3)

**Цель:** Догнать `packages/protocol` (TS/Zod) и relay-allowlist под расширенный контракт `docs/protocol-contracts.md` (structured interactions + полный `session.input`), оставаясь строго в своей зоне.

**Сделано:** В `packages/protocol` добавлены Zod-схемы: `SessionInputParams` как discriminated union `text`(+`submit?`)/`raw`/`bytes`(base64)/`keys` с `TerminalKeyStroke`/`TerminalModifier`/`TerminalKeyName`; `SessionInputResult` с `bytesWritten?`; структурные интеракции — `InteractionRequest`, `InteractionOption`, `InteractionKind`, `InteractionOptionIntent`, `InteractionResponse`, `InteractionRespondParams`, данные событий `interaction.requested/updated/resolved`; `activeInteraction?` в `SessionSubscribeResult`; error codes `INTERACTION_NOT_FOUND`/`INTERACTION_STALE`; метод `interaction.respond` добавлен в `MOBILE_METHODS` и `MOBILE_FORWARDED_METHODS`, события интеракций — в `DESKTOP_EVENTS`. Relay форвардит `interaction.respond` и фанит `interaction.*` автоматически (берёт из констант протокола) — добавлен relay-тест на это. Fake-desktop/fake-mobile расширены демонстрацией approval-промпта, чтобы поток интеракций тестировался руками без UI.

**Затронутые компоненты:** `packages/protocol/src/{envelope,methods,events}.ts`, `packages/protocol/src/interactions.test.ts`, `apps/relay/src/interactions.test.ts`, `apps/relay/scripts/fake-{desktop,mobile}.ts`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** `npx vitest run` — 52 passed (9 файлов); `npm run typecheck` — успешно. Живой прогон relay + fake-desktop + fake-mobile: `interaction.requested` дошёл до mobile, ответ `interaction.respond` (`approve_once`) проброшен на desktop, вернулся `interaction.resolved: answered`. Backward compatibility `text`/`raw` сохранена.

**Решения, ограничения и проблемы:** Реализована только протокольная (TS/Zod) сторона + relay allowlist. Pydantic-зеркало на desktop, key/bytes mapping и provider-детекторы интеракций (desktop), а также mobile UI-контролы — вне этой зоны и пока не сделаны. Relay не интерпретирует содержимое интеракций, только форвардит.

**Следующий шаг:** Синхронизировать Pydantic-модели desktop с новыми схемами (через договорённость с разработчиком 1); подготовить сквозной интеграционный harness под interaction-флоу.
## 2026-07-11 — Проектирование мобильного Action Inbox

**Цель:** Согласовать мобильную информационную архитектуру и UX, совместимые с реализованными relay и shared protocol, до начала разработки Expo-приложения.

**Сделано:** Выбран и детализирован главный экран `Action Inbox`; утверждены pairing-поток, навигация `Входящие` / `Сессии` / `Новая` / `Настройки`, единый экран живой сессии, тёмная визуальная система, reconnect/offline/error-состояния и граница мобильного MVP. `Новая` в MVP подключает один активный компьютер, а запуск сессии зарезервирован на будущее. В action-карточках заложено место под `Разрешить` / `Отклонить`: baseline использует безопасный переход в живую сессию, а structured controls включаются только при negotiated `interaction.structured`. Зафиксировано, что MVP показывает простой моноширинный terminal output, а красивый ANSI/TUI-рендеринг отложен.

**Затронутые компоненты:** `docs/superpowers/specs/2026-07-11-mobile-action-inbox-ui-design.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`; временные визуальные материалы находятся в неотслеживаемом `.superpowers/brainstorm/`.

**Проверки:** Дизайн поэтапно проверен пользователем в browser companion; требования сверены с runtime-схемами `packages/protocol` и target-контрактом `docs/protocol-contracts.md`; отдельно проверено, что baseline UI не включает controls без negotiated capability. Формальный review-loop завершён за три итерации: уточнены manual pairing, reconnect-переходы, dismissal key, обработка `session.ended`/`session.removed` и полный relay WebSocket URL; финальный reviewer status — `Approved`. При rebase учтены более новые target-спеки и runtime-реализация structured interactions/full input modes. После разрешения конфликтов: `git diff --check` — успешно; `npm test` — 52 passed в 9 test files; `npm run typecheck` — успешно; `npm audit` — 0 vulnerabilities.

**Решения, ограничения и проблемы:** `waiting` может отсутствовать без desktop-side detection, поэтому mobile не парсит сырой терминал для определения запросов. Structured permission actions описаны target-контрактом, но останутся скрыты до end-to-end реализации capability negotiation; запуск сессии с телефона, multi-desktop, push, семантическая лента и rich terminal rendering отложены. Мобильное приложение пока не реализовано.

**Следующий шаг:** Получить финальное подтверждение записанной спецификации и перейти к подробному плану реализации Expo-приложения.

## 2026-07-11 — Zero-config production relay endpoint в desktop

**Цель:** Убрать ручную настройку адреса сервера при установке desktop-приложения.

**Сделано:** Desktop default изменен с локального `ws://localhost:8787` на production base URL `wss://relay.launert.dev`; relay client автоматически добавляет `/v1/ws/desktop`. Добавлена автоматическая миграция существующего legacy localhost-default при загрузке config. Пользовательские custom URLs сохраняются, а `CUCOUDLE_RELAY_URL` остается явным developer override и не требует изменения файлов.

**Затронутые компоненты:** `apps/desktop/cucoudle_desktop/config.py`, отдельные config tests, desktop README и актуальная документация. Параллельные изменения installer/CLI/shim другого desktop-агента не включены в этот инкремент.

**Проверки:** Desktop test suite — 47 passed, включая 4 новых config tests: production default, environment override, legacy migration и сохранение custom URL.

**Решения, ограничения и проблемы:** SSH login/password не являются runtime credentials и не помещаются в приложение. Desktop знает публичный WSS endpoint без действий пользователя. Отдельная desktop device-secret authentication пока не реализована; она должна генерироваться/получаться автоматически и храниться в Keychain/Secret Service, а не запрашиваться у пользователя. Сам endpoint станет доступен только после административного применения подготовленного deployment bundle на сервере.

**Следующий шаг:** Backend owner реализует автоматическое device enrollment/credential storage без ручного ввода, затем администратор активирует `relay.launert.dev` за Nginx TLS.

## 2026-07-11 — Portable shell integration для простой установки

**Цель:** Сохранить параллельные desktop-улучшения, уменьшающие ручную настройку shell integration на macOS/Linux.

**Сделано:** Installer теперь поддерживает POSIX shell configs и fish с корректным синтаксисом, создает отсутствующие parent directories, диагностирует login shell/interpreter и генерирует shims с portable `/usr/bin/env python3` при доступном Python. CLI install/doctor выводит конкретные следующие шаги и fallback guarantees.

**Затронутые компоненты:** `apps/desktop/cucoudle_desktop/installer.py`, `shim_template.py`, `cli.py`, installer tests и актуальная документация. Изменения были подготовлены параллельным desktop-агентом и сохранены отдельным commit от production relay endpoint.

**Проверки:** Полный desktop suite — 47 passed; installer coverage включает portable/fallback interpreter и fish install/uninstall.

**Решения, ограничения и проблемы:** URL relay и shell setup не требуют ручного редактирования файлов. Полный zero-touch install еще требует autostart daemon/login item и packaged installer; текущий CLI сообщает пользователю команду запуска daemon.

**Следующий шаг:** Добавить macOS LaunchAgent и Linux systemd user service в installer, чтобы daemon стартовал автоматически после установки и входа пользователя.

## 2026-07-11 — Кросс-язык интеграционный harness desktop↔relay↔mobile (разработчик 3)

**Цель:** Проверить на живых сокетах, что независимо написанные Python desktop-daemon и TypeScript relay совпадают по контракту (поймать рассинхрон Zod↔Pydantic), не редактируя чужие зоны.

**Сделано:** Добавлен `tests/integration/desktop-relay-smoke.ts` (запуск через `npm run test:integration`, вне `npm test`). Скрипт поднимает изолированный настоящий Python-демон (temp `CUCOUDLE_HOME`, `claude`→`/usr/bin/cat` как эхо), направляет его на уже запущенный relay, пейрит mobile WebSocket-клиент и прогоняет стадии: `desktop.register` + `pairing.create` → `mobile.pair` → `session.list` → спаун управляемой сессии по IPC HELLO → `session.subscribe` → `session.input`→`terminal.output`. Реализовано IPC-фреймингом (mirror `ipc.py`) и буферизованным ридером mobile-сообщений. README дополнен инструкцией.

**Затронутые компоненты:** `tests/integration/desktop-relay-smoke.ts`, `package.json` (скрипт `test:integration`), `README.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`. Код `apps/desktop` и `apps/relay` не изменялся — harness только запускает их.

**Проверки:** Живой прогон против relay на `ws://localhost:8787` и настоящего демона (Python 3.10 venv с pydantic+websockets): все 7 стадий зелёные — desktop зарегистрировался, mobile спейрился, `session.list` прошёл, сессия `sess_…` создана (agent=claude, running), `subscribe` mode=live, ввод `ping-<rnd>` вернулся в `terminal.output`. Кросс-язык контракт подтверждён.

**Решения, ограничения и проблемы:** Требует запущенного relay и Python с зависимостями демона; поэтому вынесено из `npm test`. `requires-python>=3.11` в pyproject, но пакет запускается и на 3.10 (3.11-only конструкций нет). Проверялся базовый demo-контракт; структурные интеракции в этом harness пока не гоняются, т.к. Pydantic-зеркало интеракций на desktop ещё не готово.

**Следующий шаг:** После синхронизации Pydantic-схем интеракций расширить harness на `interaction.requested`→`interaction.respond`→`interaction.resolved`; при желании — прогон против публичного relay через `RELAY_WS`.
## 2026-07-11 — План реализации мобильного Action Inbox

**Цель:** Превратить утверждённую UI-спецификацию в исполнимый TDD-план, допускающий безопасную параллельную работу нескольких агентов напрямую в `main`.

**Сделано:** Подготовлен план из 14 задач. После последовательного Expo scaffold идут три параллельные волны: protocol/state/UI foundations; pairing/Inbox/Sessions; Session detail/New+Settings/reconnect. После каждой волны оркестратор выполняет интеграционный checkpoint, полный test/typecheck/audit gate, обновляет документы и делает единый commit/push. Для каждого поведения предусмотрены failing test, подтверждение red, минимальная реализация и green-проверка. Физический iPhone smoke вынесен в финальную последовательную задачу.

**Затронутые компоненты:** `docs/superpowers/plans/2026-07-11-mobile-action-inbox-implementation.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** План прошёл трёхитерационный независимый review-loop; исправлены trailing newline для desktop baseline, владелец recovery UI, явный red-run AppProvider, точная runtime composition и LAN-доступный `RELAY_MOBILE_URL`; финальный reviewer status — `Approved`. `git diff --check` — успешно.

**Решения, ограничения и проблемы:** Для запуска на физическом Expo Go выбран SDK 54. Mobile component tests планируются на Jest/`jest-expo` + React Native Testing Library, а существующие protocol/relay tests остаются на Vitest. Параллельные lane-агенты не выполняют Git-операции в общей рабочей копии; commit/push делает только оркестратор на wave boundary. Реализация mobile-кода ещё не начата.

**Следующий шаг:** Выполнить Task 1 плана — scaffold `apps/mobile`, mobile test harness и первый проверенный запуск Expo Go.

## 2026-07-11 — Разделение hosted relay и клиентских lifecycle

**Цель:** Явно зафиксировать, что серверная часть является постоянно работающей инфраструктурой, а не третьим приложением для установки пользователем.

**Сделано:** README, архитектурная спека, implementation plan и deployment guide теперь разделяют production hosted relay и локальный development relay. Desktop/mobile installers только подключаются к встроенному public endpoint и никогда не устанавливают, запускают, обновляют или удаляют backend. Server administrator выполняет operator deployment и последующие обновления отдельно.

**Затронутые компоненты:** Только lifecycle/deployment документация; runtime код не менялся.

**Проверки:** Compose подтверждает always-on policy `restart: unless-stopped`; health endpoints, TLS proxy и operator commands описаны в deployment bundle. Публичная проверка по-прежнему показывает, что actual `relay.launert.dev` еще не направлен в Cucoudle relay.

**Решения, ограничения и проблемы:** Hosted lifecycle учтен в target architecture. Это не означает, что production уже работает: текущий remote virtual host возвращает Vite `403`, а in-memory state и отсутствие device authentication пока не соответствуют полноценному production режиму.

**Следующий шаг:** Администратору развернуть один shared relay service, включить Nginx WSS routing/monitoring и проверить desktop/mobile connections; пользовательские installers при этом не меняются.

## 2026-07-11 — Полный desktop uninstall и clean-slate purge

**Цель:** Сохранить завершенный параллельный desktop-инкремент и сделать циклы установки/удаления безопасно проверяемыми.

**Сделано:** `cucoudle uninstall` теперь сначала штатно останавливает daemon, очищает shell integration и поддерживает `--purge` для удаления config/logs/home. Daemon получил control request `shutdown`. Добавлен self-contained POSIX `apps/desktop/scripts/purge.sh` с dry-run, подтверждением, очисткой marked PATH blocks и optional local relay cleanup.

**Затронутые компоненты:** Desktop CLI, daemon control, installer, tests, purge script и актуальная документация. Изменения подготовлены параллельным desktop-агентом и зафиксированы отдельно от hosted relay lifecycle.

**Проверки:** Desktop suite — 49 passed; `sh -n apps/desktop/scripts/purge.sh` — успешно; help path purge script — успешно.

**Решения, ограничения и проблемы:** User-facing uninstall касается только desktop-клиента. Hosted production relay принципиально не останавливается и не удаляется этой командой; `--with-relay` в purge script предназначен только для локальной development среды.

**Следующий шаг:** Добавить автоматический daemon autostart и packaged installer, сохранив полный cleanup path.

## 2026-07-11 — Надежный выбор Python в integration harness

**Цель:** Устранить environment-dependent падение cross-language smoke после объединения desktop/relay изменений.

**Сделано:** Harness теперь автоматически использует `apps/desktop/.venv/bin/python`, если venv существует, поддерживает явный `CUCOUDLE_PY` override и до запуска daemon проверяет наличие `pydantic`/`websockets` с actionable prerequisite error.

**Затронутые компоненты:** `tests/integration/desktop-relay-smoke.ts`, root README и журнал прогресса.

**Проверки:** `npm run test:integration` успешно прошел все 7 стадий на реальном Python daemon, TS relay и mobile WebSocket client. Перед этим unit gates: desktop 49 passed, protocol/relay 52 passed, TypeScript typecheck успешно.

**Решения, ограничения и проблемы:** Harness остается отдельным test target и требует уже запущенный local relay. Production hosted relay lifecycle от этого не зависит.

**Следующий шаг:** Добавить orchestration запуска relay внутрь integration test либо отдельный CI service, сохранив возможность проверки внешнего WSS endpoint.

## 2026-07-11 — Безопасный запуск relay на `launert.dev`

**Цель:** Развернуть серверную часть на целевом хосте и не оставлять plain HTTP/WebSocket порт доступным из интернета.

**Сделано:** В standalone relay добавлен настраиваемый `HOST`; на сервере установлен Node 22 и зависимости, исходники развернуты в `/home/alexey/cucoudle`, а relay включён как user-level systemd service с `Restart=always`, production mobile URL и bind на `127.0.0.1:8787`. Добавлен проверяемый user-service fallback для окружений без Docker-доступа.

**Затронутые компоненты:** `apps/relay/src/app.ts`, `server.ts`, app tests, Compose/deployment guide, user systemd unit и актуальная документация. Параллельные desktop и Homebrew изменения не затрагивались.

**Проверки:** Relay app tests — 6 passed; TypeScript typecheck — успешно. На сервере `/healthz` вернул `ok`, `/readyz` — `ready`, socket слушает только `127.0.0.1:8787`; внешний запрос на порт `8787` отклонён. Публичный `https://relay.launert.dev/healthz` всё ещё возвращает Vite `403`, так как Nginx vhost не установлен.

**Решения, ограничения и проблемы:** Прямой незашифрованный порт закрыт. Учётка `alexey` не имеет sudo, доступа к Docker socket и прав записи в `/etc/nginx`; кроме того, для user service установлен `Linger=no`. Поэтому процесс работает сейчас, но публичный WSS и гарантированный autostart после reboot требуют разовой административной настройки.

**Следующий шаг:** Администратору применить `deploy/relay/nginx.conf`, выполнить `loginctl enable-linger alexey` (либо запустить Compose как system service), затем повторить HTTPS и desktop/mobile WebSocket smoke.

## 2026-07-11 — Отдельный production relay и безопасный update pipeline

**Цель:** Отделить серверную часть от lifecycle desktop/mobile и сделать повторяемые обновления без ручной сборки на production.

**Сделано:** Relay упакован в production-only Docker image и перенесён в отдельный Compose project `/home/alexey/services/cucoudle-relay`; временный user service выключен. Nginx vhost с wildcard TLS установлен и применён. Добавлен path-filtered GitHub Actions workflow: test/typecheck, immutable GHCR tag `sha-<commit>`, SSH delivery deployment bundle, deployment lock, local health/readiness gate и rollback на предыдущий image. Runtime `tsx` перенесён в зависимости relay, поэтому image устанавливает только production dependencies.

**Затронутые компоненты:** `Dockerfile.relay`, relay/package manifests, `deploy/relay/compose.yaml`, `deploy.sh`, deployment guide, `.github/workflows/relay-deploy.yml` и актуальная документация. Параллельные desktop/Homebrew файлы не затрагивались.

**Проверки:** Protocol/relay suite — 53 passed; TypeScript typecheck, ShellCheck, Bash syntax, YAML parse и Compose config — успешно. Image реально собран на Linux-сервере с `npm ci --omit=dev`; container status — healthy. Публичные `/healthz` и `/readyz` отвечают успешно, `/v1/ws/mobile` и `/v1/ws/desktop` проходят WSS upgrade и возвращают ожидаемый `INVALID_MESSAGE`; прямой внешний порт `8787` закрыт.

**Решения, ограничения и проблемы:** Relay остаётся в монорепозитории ради единого protocol contract, но является независимой deployable единицей. Nginx — одноразовая инфраструктурная настройка, обычные релизы выполняются без sudo. Workflow не содержит credentials: для активации production deploy нужно добавить dedicated SSH key в GitHub Environment и выставить `RELAY_DEPLOY_ENABLED=true`; GHCR использует short-lived workflow token. До активации текущий bootstrap container продолжает работать.

**Следующий шаг:** Заполнить GitHub Environment secrets/variable, выполнить первый workflow deployment поверх bootstrap image и затем провести desktop daemon pairing smoke через публичный WSS.

## 2026-07-11 — Активация production relay pipeline

**Цель:** Завершить одноразовую настройку CI/CD и подтвердить первый автоматический релиз на `launert.dev`.

**Сделано:** Создано GitHub Environment `relay-production`, dedicated deploy key установлен в Actions Secrets и `authorized_keys`, host key закреплён в secret, repository variable `RELAY_DEPLOY_ENABLED=true` активирована. Workflow run `29149751237` собрал и опубликовал immutable GHCR image, доставил deployment bundle и заменил bootstrap container через штатный `deploy.sh`.

**Затронутые компоненты:** Только GitHub/server configuration и актуальная документация; runtime source не менялся. Секретные значения не записывались в репозиторий и не выводились в workflow.

**Проверки:** Workflow test job и publish/deploy job завершились успешно. Production использует `ghcr.io/alaunert/cucoudle-relay:sha-20bf4c9344cf1e3bde454899e4f988ae6e9ab933`; container healthy, временный user service inactive. Публичные health/readiness и оба WSS route проверены снаружи; прямой порт `8787` недоступен. Fake desktop→relay→mobile подтвердил пересылку `terminal.output` через публичный WSS.

**Решения, ограничения и проблемы:** GHCR pull авторизуется короткоживущим `GITHUB_TOKEN` каждого workflow run, поэтому постоянный registry token на сервере не хранится. Полный Python desktop harness доходит до subscribe, но не получает финальный PTY event через удалённый relay; server-level event forwarding проверен отдельно, поэтому это зафиксировано как desktop-client follow-up, а не deployment blocker.

**Следующий шаг:** Исправить отправку PTY event в Python desktop relay-client при удалённой задержке и повторить полный семистадийный harness через production WSS.
## 2026-07-11 — Expo scaffold и mobile test harness

**Цель:** Создать физически совместимую с Expo Go основу мобильного приложения и включить её в общие тестовые и typecheck-команды монорепозитория.

**Сделано:** Создан npm workspace `@cucoudle/mobile` на Expo SDK 54 с Expo Router и TypeScript; подключены `expo-camera`, `expo-secure-store`, `expo-crypto`, Jest/`jest-expo` и React Native Testing Library. Добавлены root-команды `mobile`, `mobile:tunnel`, `mobile:doctor`, раздельные core/mobile test и typecheck gates. Root Vitest и TypeScript исключают вложенный Expo-проект. Через TDD добавлены минимальный `BrandMark`, root Stack и временный index route.

**Затронутые компоненты:** `apps/mobile/{package.json,app.json,tsconfig.json,jest.config.js,jest.setup.ts,expo-env.d.ts}`, `apps/mobile/src/app`, `apps/mobile/src/ui`, root `package.json`, `package-lock.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** `BrandMark.test.tsx` сначала завершился ожидаемым red из-за отсутствующего `BrandMark`, после минимальной реализации — green. Свежий `npm test` — 52 core tests в 9 файлах и 1 mobile test прошли; `npm run typecheck` — core и mobile прошли; `npm run mobile:doctor` — 18/18 проверок, проблем не обнаружено.

**Решения, ограничения и проблемы:** Expo scaffold является только технической основой: pairing, mobile protocol client, session state и продуктовые экраны ещё не реализованы. После установки Expo SDK 54 `npm audit --json` сообщает 14 moderate advisories в транзитивной Expo dependency chain; npm предлагает только несовместимый переход на Expo 57, поэтому Task 1 не маскирует результат как zero-vulnerability, а следующему обязательному audit gate потребуется отдельное совместимое решение. Git remote fetch/pull был заблокирован политикой выполнения среды до запуска команды; локальная ветка при старте показывала `main...origin/main` без расхождения, tracked-изменений не было, а неизвестные `.superpowers/`, session prompt и `docs/SESSION_HANDOFF.md` не изменялись и не добавлялись.

**Следующий шаг:** Параллельно реализовать Wave 1: request-correlated mobile protocol client, pure session state/selectors и approved dark UI kit, затем выполнить общий integration gate.

## 2026-07-11 — Mobile protocol, state и UI foundations (Wave 1)

**Цель:** Создать независимые проверяемые основы мобильного Action Inbox до реализации продуктовых экранов и application composition.

**Сделано:** Реализован injectable WebSocket client с versioned envelopes, response correlation, typed errors, subscriptions и безопасным disconnect/supersede lifecycle без automatic retry. Добавлены pure normalized session state/reducer, terminal buffer с лимитом 200 000 UTF-16 code units и seq-ordered replay, Inbox/session selectors, dismissal keys и activity facts. Создан dark UI kit с theme tokens, safe-area screen, accessible button variants, connection banners, status badges и empty states. Focused reviews обнаружили и через отдельные red→green циклы закрыли зависание `connect()` при close/supersede и corruption replay при несовпадении timestamp с terminal `seq`.

**Затронутые компоненты:** `apps/mobile/src/protocol`, `apps/mobile/src/state`, `apps/mobile/src/ui/{theme.ts,components}` и соответствующие Jest tests; `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** Финальный `git diff --check` — успешно. `npm test` — 52 core tests в 9 файлах и 35 mobile tests в 7 suites прошли. `npm run typecheck` — core и mobile прошли. Lane reviews: protocol PASS после двух lifecycle regressions, state PASS после seq-order regression, UI PASS. `npm audit` завершился exit 1 и сообщил 14 moderate advisories, которые сводятся к транзитивным `postcss <8.5.10` и `uuid <11.1.1` в Expo SDK 54 chain; npm предлагает только breaking upgrade на Expo 57.

**Решения, ограничения и проблемы:** Mutating requests не retry автоматически. `session.ended` с ненулевым exit code остаётся `stopped`, а не infer `error`; authoritative list/update может заменить локальный patch. UI не включает product screens и не показывает structured actions. Zero-vulnerability audit gate не достигнут: маскирующие audit-настройки не применялись, а автоматический Expo 57 upgrade отклонён как противоречащий утверждённому SDK 54/Expo Go scope. Git fetch/push всё ещё блокируются execution policy среды; изменения сохраняются локальными commit’ами в `main`.

**Следующий шаг:** Реализовать Wave 2: QR/manual pairing и SecureStore profile, Action Inbox, Sessions filters, затем application provider и four-tab routes.

## 2026-07-11 — Питч-презентация для жюри (demo-driven, черновик v2)

**Цель:** Заранее собрать презентацию для защиты Cucoudle на хакатоне — короткий demo-driven питч для жюри.

**Сделано:** Спроектирован и свёрстан HTML-дек из 8 слайдов, публикуемый как Artifact: титул с командой (Кирилл Богачев, Алексей Лаунерт, Сергей Александров), «о проекте» с болью, полноэкранная демо-заглушка под живой показ/видео, «почему мы» (доступность без VPN и блокировок, все агенты в одном приложении, управление откуда угодно, ничего не менять в привычке), «как работает» (терминал → компьютер → облако → телефон, двусторонняя связь), «что умеет» (живой экран агента, ответы с телефона, подтвердить/отклонить, несколько сессий, уведомления, QR-подключение), roadmap «дальше» и финал. Тёмная тема выведена из логотипа: почти чёрный фон, градиент фиолетовый→голубой, инлайн-SVG облака-спич-бабла, тэглайн «AI coding agents. One chat.». Все цвета — через CSS-переменные для быстрой перекраски. Формулировки — человеческие, без смешения русского и английского; технические детали намеренно убраны.

**Затронутые компоненты:** `docs/presentation/cucoudle-pitch.html`, `docs/superpowers/specs/2026-07-11-hackathon-pitch-deck-design.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** Рендер и навигация проверены в браузере (Playwright, локальный HTTP с UTF-8): титул, «почему мы» и «что умеет» отрисованы корректно, кириллица и градиенты в порядке; клавиатура (стрелки/пробел/Home/End), точки-индикаторы, прогресс-бар и счётчик слайдов работают. Пользователь просмотрел дек и подтвердил результат.

**Решения, ограничения и проблемы:** Дек — презентационный материал, не продуктовый код. Демо-слайд — заглушка под запись к демо-дню (мобильного приложения ещё нет). Часть перечисленных на слайде «что умеет» возможностей (подтвердить/отклонить, уведомления) — целевые и в продукте пока не реализованы; фактическое проверенное состояние продукта отражено в `docs/FINAL_IMPLEMENTATION.md`. Нарратив по просьбе пользователя — demo-driven; дизайн ещё дорабатывается.

**Следующий шаг:** После готовности мобильного приложения заменить демо-заглушку реальным видео/скриншотами; при необходимости адаптировать под финальный тайминг и брендинг.
## 2026-07-11 — Pairing, Action Inbox, Sessions и application shell (Wave 2)

**Цель:** Превратить mobile foundations в связанный filesystem-backed пользовательский flow от первого pairing до Inbox и списка сессий.

**Сделано:** Реализованы QR/manual pairing с runtime protocol validation, CameraView/permission states, SecureStore profile repository и стабильной mobile identity. Добавлены Action Inbox с status-derived cards, exact-key dismissal и generic activity, а также Sessions с фильтрами, cwd basename и раздельными empty/reconnect/offline states. `AppProvider` восстанавливает active profile, направляет в pairing либо reconnecting tab shell и публикует state/client/repository/navigation callbacks. Все четыре tab routes и target `/session/[id]` существуют в filesystem; New/Settings/Session detail используют безопасные placeholders до Wave 3. Focused integration review выявил отсутствующие route targets и navigation dependency; gaps закрыты отдельным red→green regression test.

**Затронутые компоненты:** `apps/mobile/src/pairing`, `apps/mobile/src/features/{pairing,inbox,sessions}`, `apps/mobile/src/application`, `apps/mobile/src/app`, соответствующие Jest tests, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** Lane reviews Pairing/Inbox/Sessions — PASS; application composition review — PASS после route/navigation regression. `npm test` — 53 core tests в 9 файлах и 77 mobile tests в 14 suites прошли. `npm run typecheck` — core и mobile прошли. `git diff --check` — успешно. `npm audit` по-прежнему завершился exit 1 с 14 moderate advisories в Expo SDK 54 dependency chain; доступное автоматическое исправление требует breaking upgrade на Expo 57.

**Решения, ограничения и проблемы:** Pairing transport и все mutating callbacks выполняются один раз без automatic retry. Bootstrap с сохранённым profile намеренно входит в `reconnecting`; фактический resume/list/subscribe lifecycle принадлежит Wave 3. Four-tab placeholders нужны для реальной Expo Router composition и будут заменены TDD-экранами, а не считаются готовыми New/Settings/Session detail. Zero-vulnerability audit gate остаётся открытым из-за несовместимости предлагаемого fix с утверждённым SDK 54.

**Следующий шаг:** Параллельно реализовать Wave 3 lanes: live Session detail, New/Settings и reconnect coordinator, затем capability-gated structured action zone и общий integration checkpoint.

## 2026-07-11 — Live Session, reconnect/recovery и structured actions (Wave 3)

**Цель:** Завершить основные mobile-сценарии после pairing: управлять живой сессией, безопасно восстанавливаться после разрыва и отвечать на поддержанные structured interactions.

**Сделано:** Реализованы Session detail с plain terminal, composer и interrupt, полноценные New/Settings routes, reconnect coordinator с `mobile.resume` → `session.list` → восстановлением подписки, bounded reconnect и отдельными recovery/pairing-required состояниями. `AppProvider` связал runtime callbacks для input/interrupt/interaction response, сохраняет открытый session route при обычном reconnect и использует отдельный pairing transport. Structured approval zone показывается только при `interaction.structured`, блокирует mutating actions offline и предотвращает двойной/неопределённый повтор ответа до свежей подписки. Code review дополнительно выявил и через red→green regressions закрыл transport leaks, потерю route при reconnect, гонку out-of-order subscribe и повторное открытие той же pending-сессии.

**Затронутые компоненты:** `apps/mobile/src/application`, routes `apps/mobile/src/app`, `apps/mobile/src/features/{session,new,settings,pairing,inbox}` и соответствующие Jest tests; `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** Focused reviews Session/New+Settings/reconnect — PASS; финальное integration review — PASS после regressions. `git diff --check` — успешно. `npm test` — 53 core tests в 9 файлах и 143 mobile tests в 21 suites прошли. `npm run typecheck` — core и mobile прошли. `npm audit` завершился exit 1 и сообщил прежние 14 moderate advisories в транзитивных `postcss`/`uuid` Expo SDK 54; предлагаемое исправление требует breaking upgrade на Expo 57.

**Решения, ограничения и проблемы:** Mutating requests отправляются только online и никогда не retry автоматически. Неопределённый результат `interaction.respond` остаётся заблокированным до свежего interaction object, чтобы не дублировать решение. Structured controls скрыты без negotiated capability, сохраняя raw terminal fallback. Полный Expo runtime/E2E и физический iPhone smoke относятся к Task 14; zero-vulnerability audit gate остаётся открытым из-за несовместимого автоматического upgrade.

**Следующий шаг:** Выполнить Task 14: production runtime composition, сквозной mobile flow/integration smoke, Expo doctor и проверку на физическом iPhone.

## 2026-07-11 — Privacy-safe relay audit logging

**Цель:** Сделать удалённые desktop/mobile проверки наблюдаемыми на production без записи пользовательских команд и секретов.

**Сделано:** Relay получил injectable audit logger и production JSON stdout logger. Журналируются WebSocket connection lifecycle, desktop registration/pairing creation, mobile pair/resume, forwarded request/response, desktop event fan-out, timeout и invalid envelope. Базовые поля ограничены routing metadata: role, desktop/mobile/session/request IDs, method/event, byte counts, platform/app version и result. По запросу команды текущий test deployment включает `RELAY_LOG_INPUT_TEXT=true`: для `session.input` и text response `interaction.respond` добавляется `inputText`. Pairing code и mobile token не записываются. Deployment guide дополнен командами просмотра Docker logs.

**Затронутые компоненты:** `apps/relay/src/audit.ts`, `app.ts`, `handlers.ts`, relay E2E test, `deploy/relay/README.md` и актуальная документация. Desktop и mobile runtime не менялись.

**Проверки:** Core suite — 53 passed; core TypeScript typecheck и `git diff --check` — успешно. E2E проверяет наличие metadata и `inputText` для `session.input` при включённом test flag.

**Решения, ограничения и проблемы:** Логи предназначены для тестирования маршрутизации и эксплуатации, а не для transcript storage. Input logging является явным временным режимом и должен быть выключен после тестов, поскольку terminal text может содержать чувствительные данные. Остальные params payload не журналируются.

**Следующий шаг:** Развернуть через активный relay pipeline, отправить тестовый запрос с другого компьютера и подтвердить его по production JSON log.

## 2026-07-11 — Исправление Homebrew formula: отсутствующие runtime-зависимости

**Цель:** Починить `cucoudle daemon`, падавший после `brew install` с `ModuleNotFoundError: No module named 'pydantic'`.

**Сделано:** Найдена корневая причина: Homebrew-хелпер `venv.pip_install` всегда передаёт pip флаг `--no-deps`, поэтому pydantic/websockets/qrcode никогда не попадали в virtualenv формулы, а `cucoudle --version` проходил из-за ленивого импорта daemon. Формула переведена на bootstrapped pip (`ensurepip` + прямой `pip install` с зависимостями, wheels с PyPI, Rust не нужен), добавлен `revision 1`, тест формулы усилен импортом `cucoudle_desktop.daemon`.

**Затронутые компоненты:** `HomebrewFormula/cucoudle.rb`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** `brew reinstall cucoudle` из исправленной формулы собрал `0.1.0_1` (479 файлов вместо пустого venv); импорт `cucoudle_desktop.daemon` и pydantic/websockets/qrcode в venv — успешно; `cucoudle --version` — успешно; `brew test cucoudle` — PASS.

**Решения, ограничения и проблемы:** Для third-party tap выбран прямой pip с сетевым доступом вместо resource-блоков Homebrew: sdist `pydantic-core` требует Rust/maturin, а wheels с PyPI — нет. Пользователям с уже сломанной установкой нужен `brew update && brew reinstall cucoudle` (и `brew services restart cucoudle`, если демон запущен как сервис).

**Следующий шаг:** Продолжить Task 14 (production runtime composition и mobile smoke); при следующем релизе убрать `revision` вместе с бампом версии.

## 2026-07-11 — Рабочий Homebrew daemon service без Rust

**Цель:** Запускать один desktop daemon в фоне через `brew services start cucoudle` и устранить падение чистой Homebrew-установки из-за отсутствующих Python dependencies.

**Сделано:** Подтверждено, что существующий `service do` корректно создаёт LaunchAgent с `keep_alive`; фактическое падение было вызвано тем, что `venv.pip_install` ставит локальный desktop package без dependencies. Formula теперь зависит от bottled `pydantic`, а qrcode/websockets зафиксированы Homebrew resources с SHA256 и явно устанавливаются в virtualenv. Formula test импортирует все runtime modules. Текущая локальная Cellar-установка восстановлена, service запущен.

**Затронутые компоненты:** `HomebrewFormula/cucoudle.rb`, Homebrew deployment guide и актуальная документация. Desktop daemon runtime/protocol не менялся.

**Проверки:** Выполнен clean uninstall/install `--HEAD` на реальной macOS arm64: Homebrew установил bottled `pydantic` и оба pinned resources, `brew test` и явный import `pydantic, qrcode, websockets` прошли. `brew services info cucoudle` показывает `Running: true`, daemon socket — running, а production relay получил `desktop.registered` для macOS app version `0.1.0`. Отдельный Linux desktop также зарегистрировался, отправил `session.updated` и создал pairing request.

**Решения, ограничения и проблемы:** Пользователь один раз запускает `brew services start cucoudle`; после этого daemon общий для всех терминалов, работает через LaunchAgent и не требует открытого terminal window. Bottled `pydantic` исключает локальную Rust-сборку; generic non-Homebrew Linux install всё ещё требует отдельного systemd user integration.

**Следующий шаг:** Опубликовать formula fix; пользователям установленного stable `0.1.0` потребуется `brew update && brew upgrade cucoudle`, после чего достаточно одной команды `brew services start cucoudle`.

## 2026-07-11 — Текст PTY output в тестовых relay logs

**Цель:** Искать в production test logs локальные terminal prompts и ответы агентов с macOS/Linux, а не только mobile `session.input`.

**Сделано:** При включённом `RELAY_LOG_INPUT_TEXT=true` audit entry `desktop.event.forwarded` для `terminal.output` теперь содержит `outputText`. Остальные desktop events и выключенный режим не получают payload. Deployment guide и актуальная документация синхронизированы.

**Затронутые компоненты:** Relay app/handlers/E2E test и документация; desktop/mobile runtime не менялся.

**Проверки:** Relay E2E требует точный `outputText` для PTY frame и продолжает проверять, что pairing code отсутствует во всех audit entries.

**Решения, ограничения и проблемы:** Режим намеренно тестовый: PTY output включает локальный ввод, ответы агента и потенциально чувствительные данные. После завершения диагностики `RELAY_LOG_INPUT_TEXT` должен быть выключен.

**Следующий шаг:** Развернуть relay, повторить Linux-диалог `привет`/`тест` и найти обе стороны разговора по `desktopId`/`sessionId`.

## 2026-07-11 — Одна команда для локального desktop-демо (разработчик 3)

**Цель:** Убрать ручную возню с venv/PYTHONPATH/шимами при демонстрации: одна команда поднимает desktop-сторону, готовую к паре с телефоном через прод-relay.

**Сделано:** Добавлен `scripts/dev-desktop.sh`: создаёт локальный venv и ставит зависимости демона, запускает `cucoudle_desktop daemon` (по умолчанию на встроенный `wss://relay.launert.dev`), спаунит одну управляемую сессию (по умолчанию `bash`, можно `claude`) и печатает pairing-QR. Логи демона уходят в `.dev-desktop.log`, артефакты (`.dev-venv/`, лог) добавлены в `.gitignore`. Код `apps/desktop` не изменялся — скрипт только запускает его.

**Затронутые компоненты:** `scripts/dev-desktop.sh`, `.gitignore`.

**Проверки:** Живой прогон против прод-relay: демон подключился к `wss://relay.launert.dev/v1/ws/desktop` и зарегистрировался, сессия `bash` создана, `pairing.create` вернул `qrPayload.relayUrl = wss://relay.launert.dev/v1/ws/mobile` (телефон идёт на прод, LAN не нужен). QR отрендерился.

**Решения, ограничения и проблемы:** Скрипт запускается из исходников через venv (у dev-машины Python 3.10, а pyproject требует 3.11 — venv обходит). Это dev-инструмент; в продукте роль скрипта играет packaged desktop (`brew install` + автозапуск). Мобильный Metro всё ещё локальный — приложение запускается отдельно через `expo start --tunnel`.

**Следующий шаг:** По готовности — свести и mobile-запуск в общий скрипт/README-раздел «demo за 2 команды».

## 2026-07-11 — Фикс: extensionless импорты в `@cucoudle/protocol` для Metro (разработчик 3)

**Цель:** Починить сборку мобильного приложения — Metro падал `Unable to resolve "./envelope.js" from packages/protocol/src/index.ts`.

**Сделано:** В `packages/protocol` относительные импорты переведены с `./x.js` на extensionless `./x` (`index.ts`, `methods.ts`, `events.ts`). Metro (React Native) не переписывает `.js`→`.ts`, в отличие от tsx/vitest/tsc, поэтому `.js`-расширения ломали бандлинг фронта; extensionless резолвится всеми потребителями. Тест-файлы (`./index.js`) не тронуты — Metro их не бандлит.

**Затронутые компоненты:** `packages/protocol/src/{index,methods,events}.ts`.

**Проверки:** `npx vitest run` — 53 passed; `npm run typecheck` — успешно. (Сборку Metro проверяет мобильный запуск на стороне пользователя.)

**Решения, ограничения и проблемы:** Пакет по-прежнему потребляется как TS-исходники без build-шага; extensionless — совместимый общий знаменатель для Metro, esbuild/tsx и `moduleResolution: Bundler`.

**Следующий шаг:** Пользователю пересобрать `npx expo start --tunnel`; при новых resolve-ошибках прислать stack.

## 2026-07-11 — Полные protocol payload logs для тестирования

**Цель:** Видеть в relay logs все desktop/mobile requests, responses, events и текстовые данные при сквозной отладке.

**Сделано:** Добавлен test flag `RELAY_LOG_PAYLOADS=true`. Каждый валидный inbound envelope создаёт `message.received` с role, kind, method/event, request ID, byte count и полным `payload`. Рекурсивный redactor заменяет значения ключей `token`, `pairingCode`, `secret`, `password`, `authorization` на `<redacted>`. Текущий test Compose включает режим вместе с input/output text logging.

**Затронутые компоненты:** Relay audit/app/server/handlers, Compose, E2E test и документация; desktop/mobile runtime не менялся.

**Проверки:** E2E требует полный payload для mobile `session.input` и desktop `terminal.output`, а также подтверждает отсутствие реального pairing code во всех audit entries.

**Решения, ограничения и проблемы:** Credential-поля маскируются, но произвольный terminal text может сам содержать секреты; режим предназначен только для временного тестового окружения и должен выключаться перед обычной эксплуатацией.

**Следующий шаг:** Развернуть relay и использовать `message.received.payload` для проверки полного Linux/macOS/mobile потока.

## 2026-07-11 — Production-проверка protocol payload logs

**Цель:** Подтвердить, что полное логирование работает на production relay, а credential-поля не раскрываются.

**Сделано:** Relay release `8065426` развёрнут на `relay.launert.dev`, container healthcheck прошёл, `RELAY_LOG_PAYLOADS=true` активен. Изолированный public WSS smoke-test прошёл цепочку desktop register/pairing, mobile pair/subscribe/input и desktop terminal output.

**Проверки:** Production JSON logs содержат полный `message.received.payload` с тестовым input/output text; `pairingCode` заменён на `<redacted>`, немаскированных pairing fields не найдено. GitHub Actions run `29152110482` завершён успешно.

**Следующий шаг:** Использовать production logs для проверки живых Linux/macOS CLI-сессий; после тестов отключить payload/text logging.

## 2026-07-11 — Mobile runtime composition, навигация в сессию и камера пейринга

**Цель:** Собрать мобильный runtime в отдельный composable-модуль (Task 14), сделать реальный переход список → сессия → назад и починить сканирование QR на iPhone Pro.

**Сделано:** Из `AppProvider` выделен `createMobileRuntime` — единая точка сборки connection coordinator, pairing-transport и protocol-запросов (`openSession`/`sendInput`/`interrupt`/`respondInteraction`/`retry`/`dispose`); provider стал тонким React-слоем над runtime. Клик по плитке в списке сессий теперь открывает `/session/[id]` (push в навигацию), на экране сессии добавлена кнопка «← Сессии» с fallback на `router.replace`, если стек пуст. В пейринге камера iPhone Pro открывалась виртуальной triple-камерой в 0.5x — добавлен выбор обычной широкоугольной линзы через `getAvailableLensesAsync`. Добавлен `apps/mobile/metro.config.js` с resolver-fallback для `.js`-импортов монорепы и `apps/mobile/.gitignore` (генерируемый `expo-env.d.ts`).

**Затронутые компоненты:** `apps/mobile/src/application/{createMobileRuntime.ts,AppProvider.tsx,__tests__/mobileFlow.test.tsx}`, `apps/mobile/src/app/session/[id].tsx`, `apps/mobile/src/features/session/{SessionScreen.tsx,__tests__/SessionScreen.test.tsx}`, `apps/mobile/src/features/pairing/PairingScreen.tsx`, `apps/mobile/{metro.config.js,.gitignore,expo-env.d.ts}`.

**Проверки:** `npx tsc --noEmit` — чисто; `npm test` в `apps/mobile` — 22 suites, 145 passed (включая новый application-тест `mobileFlow` и тест кнопки «назад»).

**Решения, ограничения и проблемы:** Имена линз камеры локализуются системой, поэтому широкоугольная выбирается как линза с самым коротким именем — эвристика, а не API-гарантия. Полный smoke Expo-приложения на физическом iPhone отдельной автоматической проверкой не зафиксирован.

**Следующий шаг:** Зафиксировать сквозной demo-прогон телефон ↔ прод-relay ↔ desktop с настоящим CLI-агентом и записать его для презентации.

## 2026-07-11 — Исправление отправки Enter из мобильного terminal composer

**Цель:** Исправить мобильный ввод, при котором текст появлялся в интерактивном CLI, но не подтверждался клавишей Enter.

**Сделано:** Mobile composer переведён с legacy-добавления `\n` на контрактный payload с чистым текстом и `submit: true`. Desktop daemon теперь преобразует такой submit в реальную PTY-последовательность Enter (`\r`). Для совместимости payload, уже оканчивающийся на `\r` или `\n`, повторно не завершается. Пример протокола синхронизирован с фактическим поведением.

**Затронутые компоненты:** `apps/mobile/src/features/session/SessionComposer.tsx` и его regression test; обработчик `session.input` и тесты daemon в `apps/desktop`; `docs/protocol-contracts.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** Mobile focused composer suite — 6/6; полный mobile Jest suite — 145/145; mobile TypeScript typecheck — успешно; desktop daemon suite — 9/9, включая новые проверки `submit: true` → `\r` и отсутствия двойного Enter для legacy newline; Python compileall и `git diff --check` — успешно.

**Решения, ограничения и проблемы:** Enter формируется на desktop, поскольку именно desktop владеет PTY и знает его управляющую последовательность. Automatic retry ввода по-прежнему запрещён, чтобы команда не выполнялась дважды. Физический iPhone/Expo runtime smoke ещё не выполнен.

**Следующий шаг:** Перезапустить desktop daemon и Expo-приложение, подтвердить отправку ответа в настоящих Codex/Claude сессиях с телефона и затем завершить общий Task 14 runtime smoke.

## 2026-07-11 — Восстановление terminal modes после разрыва daemon

**Цель:** Исключить попадание mouse-reporting последовательностей Claude/Codex TUI в shell input, если daemon перезапустился или socket аварийно закрылся.

**Сделано:** Generated shim по-прежнему восстанавливает исходный `termios`, а затем гарантированно выключает DEC mouse tracking, focus reporting, bracketed paste, восстанавливает курсор и text attributes. Cleanup защищён от уже закрытого TTY. Desktop version поднята до `0.1.3`.

**Затронутые компоненты:** Desktop shim template, installer regression test, desktop package version и проектная документация; relay/mobile runtime не менялись.

**Проверки:** Generated shim компилируется и regression test проверяет наличие cleanup для mouse tracking, SGR mouse mode и bracketed paste. Desktop pytest и compile checks выполняются перед release.

**Решения, ограничения и проблемы:** Причина воспроизведена по времени: Homebrew restart daemon в `14:23:54` оборвал активный shim. PTY-сессии пока in-memory и не переживают daemon restart; это отдельное архитектурное ограничение.

**Следующий шаг:** Выпустить Homebrew `v0.1.3`, обновить shims через `cucoudle install` и повторить daemon-restart smoke с активным TUI.

## 2026-07-11 — Серверный рендер терминала: цветной вывод сессии на мобиле

**Цель:** Заменить нечитаемый плоский текст сессии на мобиле картинкой, близкой к десктопному терминалу с Claude Code/Codex, исправив проблему на стороне десктопа.

**Сделано:** Десктоп-демон эмулирует терминал через `pyte` (`TerminalRenderer`: history-зона append-only строк + live screen, стилизованные runs c fg/bg/bold/italic/underline). Кадры `terminal.render` эмитятся с коалесингом 50 мс — перерисовки TUI-спиннеров схлопываются в актуальное состояние. Протокол дополнен additively: событие `terminal.render` в `DESKTOP_EVENTS` (relay форвардит автоматически) и снапшот `terminalRender` в результате `session.subscribe`. Мобилка хранит `renderBySessionId` (append history / replace screen / дедуп по seq / гидрация из снапшота) и рендерит `StyledTerminal` — FlatList цветных monospace-строк с ANSI-палитрой под тёмную тему; при отсутствии render-данных остаётся fallback `PlainTerminal`. Сырой `terminal.output` сохранён для совместимости.

**Затронуто:** `packages/protocol/src/{terminalRender.ts,events.ts,methods.ts,index.ts}`, `apps/desktop/{pyproject.toml,cucoudle_desktop/{render.py,registry.py,daemon.py}}`, `apps/mobile/src/state/{renderBuffer.ts,sessionState.ts,sessionReducer.ts}`, `apps/mobile/src/features/session/{ansiPalette.ts,StyledTerminal.tsx,SessionScreen.tsx}` + тесты во всех трёх пакетах.

**Проверки:** core vitest 58 passed (5 новых схемных), desktop pytest 64 passed (10 новых: SGR, схлопывание спиннера, cap history, коалесинг, снапшот в subscribe), mobile jest 156 passed (новые renderBuffer/reducer/StyledTerminal), оба typecheck чисто. Сквозная проверка: имитация TUI (баннер + 20 перерисовок спиннера + результат) через реальный `TerminalRenderer` даёт чистый кадр без мусора, валидный по zod-схеме протокола.

**Решения и ограничения:** эмуляция на десктопе выбрана вместо xterm.js-в-WebView, чтобы мобилка осталась нативной, а проблема решалась в источнике; трафик временно дублируется (raw + render); pyte покрывает не 100% xterm-фич (для Claude Code/Codex достаточно); палитра — приближение к десктопным темам. Живой прогон с настоящим Claude на телефоне отдельной проверкой не зафиксирован.

**Следующий шаг:** Прогнать демо телефон ↔ relay ↔ desktop с настоящим CLI-агентом и при необходимости докрутить палитру/типографику; затем убрать дублирование raw-потока через capability negotiation.

## 2026-07-11 — Homebrew release v0.1.3

**Цель:** Опубликовать desktop terminal-cleanup fix как обычное Homebrew-обновление.

**Сделано:** Коммит `6a6ed58` опубликован в `main`, создан и отправлен tag `v0.1.3`; formula переведена на tag tarball с SHA256 `473a55ebcda10bd71facbfecf3f089024f63bff246787412077ba1e317c19116`. Formula дополнена Sorbet sigil и class documentation для чистого Homebrew lint.

**Проверки:** Чистый Python 3.13 venv успешно собрал `cucoudle-desktop==0.1.3`; desktop pytest 55/55, compileall и diff check прошли. Homebrew tap видит upgrade `0.1.2 → 0.1.3`, `brew fetch` скачал formula и resources, `brew style` и `brew audit alaunert/cucoudle/cucoudle` проходят без замечаний.

**Решения, ограничения и проблемы:** Локальный `brew upgrade` не запущен во время активной managed Codex-сессии, поскольку service restart оборвёт её in-memory PTY. Это не блокирует публичный release.

**Следующий шаг:** После завершения активного Codex выполнить `brew upgrade cucoudle && cucoudle install`, затем повторить controlled daemon-restart smoke.

## 2026-07-11 — Integration smoke на macOS и против production relay

**Цель:** Прогнать полный кросс-язык integration smoke против production relay и починить его запуск на macOS.

**Сделано:** Найдено и исправлено: харнесс подставлял echo-бинарь `/usr/bin/cat`, которого нет на macOS, поэтому `_resolve_real` молча запускал настоящий Claude CLI (trust-prompt вместо эха) и STAGE 7 падал по таймауту. Дефолт заменён на `/bin/cat` (есть на macOS и Linux), добавлен отладочный вывод всех входящих mobile-сообщений под флагом `IT_DEBUG=1`.

**Затронутые компоненты:** `tests/integration/desktop-relay-smoke.ts`.

**Проверки:** `RELAY_WS=wss://relay.launert.dev npm run test:integration` — ALL STAGES PASSED против production relay (register/pairing/list/spawn/subscribe/input→echo). Также зелёные: `npm test` (core + 145 mobile), оба typecheck, `expo-doctor` 18/18, relay `healthz` 200.

**Решения, ограничения и проблемы:** Во время одного из прогонов production relay кратко отвечал HTTP 502 (совпало с параллельным деплоем) — харнесс это переживает переподключением демона, но flaky-прогоны при активном деплое возможны. Харнесс не поднимает relay сам: локальный запуск требует `npm run relay` или `RELAY_WS` на внешний relay.

**Следующий шаг:** Сквозной demo-прогон с Expo-приложением на физическом iPhone против production relay и настоящего CLI-агента.

## 2026-07-11 — Исправлен двойной push экрана сессии (кнопка «← Сессии»)

**Цель:** Починить возврат из сессии: первый тап по «← Сессии» снова показывал ту же сессию, и только второй возвращал к списку.

**Сделано:** Найден двойной push маршрута `/session/[id]`: его делали одновременно `runtime.openSession()` (createMobileRuntime) и `openSessionDetail` в AppProvider, поэтому в навигационном стеке оказывались две одинаковые записи и первый `router.back()` снимал дубликат. Лишний push из AppProvider удалён — навигацией владеет runtime; в `mobileFlow`-тесте зафиксирован контракт «ровно один push».

**Затронутые компоненты:** `apps/mobile/src/application/AppProvider.tsx`, `apps/mobile/src/application/__tests__/mobileFlow.test.tsx`.

**Проверки:** jest (mobileFlow + session suite) — 45 тестов зелёные; `tsc --noEmit` — чисто.

**Решения, ограничения и проблемы:** Поведение подтверждено тестом на уровне runtime; повторная проверка тапа на физическом устройстве ожидается в рамках общего Expo demo-прогона.

**Следующий шаг:** Demo-прогон на физическом iPhone, включая переход список → сессия → «← Сессии».

## 2026-07-11 — Изоляция PTY от renderer и безопасные daemon-тесты

**Цель:** Устранить самопроизвольные вылеты CLI-сессий и появление terminal reports/буквы `u` в input/render при Claude/Codex TUI.

**Сделано:** Render-only поток фильтрует private DSR и Kitty keyboard CSI с учётом split PTY chunks. Renderer теперь best-effort: любое исключение логируется и отключает styled render только для этой сессии, но raw PTY и relay output продолжают работать. Shim cleanup сбрасывает mouse/focus/paste, synchronized output, Unicode/Kitty keyboard и modifyOtherKeys modes. `AGENTS.md` запрещает агентам останавливать Homebrew service, удалять production socket и использовать broad `pkill`; daemon-тесты обязаны работать в temporary `CUCOUDLE_HOME`.

**Затронутые компоненты:** Desktop renderer/daemon/shim, renderer/daemon/installer tests, agent rules, desktop version `0.1.6` и проектная документация; mobile/relay runtime не менялись.

**Проверки:** Desktop pytest 70/70; отдельный smoke реальной Claude-последовательности (`?2031`, Kitty push/pop, modifyOtherKeys, private DSR, `?2026`) прошёл без исключений и лишнего текста; compileall и `git diff --check` прошли.

**Решения, ограничения и проблемы:** Последний вылет не был самопроизвольным: параллельный Claude-агент явно выполнил `brew services stop`, broad `pkill` и удалил `~/.cucoudle/daemon.sock`; это подтверждено process list и Claude transcript. In-memory PTY по-прежнему не переживает намеренный `SIGKILL` daemon; это архитектурное ограничение, а не ошибка renderer.

**Следующий шаг:** Выпустить Homebrew `v0.1.6`, вернуть машину с manual dev-daemon на Homebrew service и провести controlled Claude/Codex smoke без затрагивания чужих сессий.

## 2026-07-11 — Homebrew release v0.1.6

**Цель:** Доставить исправления renderer/terminal cleanup обычным desktop-обновлением.

**Сделано:** Коммит `6c55716` опубликован в `main`, тег `v0.1.6` отправлен в GitHub; Homebrew formula переведена на release tarball с SHA256 `3edac128708a6af9073b7b50e101efc94198ef1c408e43d0aa3a94977a679ca9`.

**Проверки:** Desktop suite 70/70, focused regressions 28/28, Claude control-sequence smoke, compileall и diff check прошли до тега; formula проходит Homebrew style/audit/fetch перед локальной установкой.

**Решения, ограничения и проблемы:** Релиз не обещает persistence при `SIGKILL` daemon; он исключает влияние renderer на PTY и гарантирует полный terminal-mode cleanup при разрыве.

**Следующий шаг:** Обновить локальную установку, перегенерировать shims, вернуть Homebrew service и провести controlled live smoke.
## 2026-07-11 — Структурные интеракции end-to-end (Approve/Reject + общие вопросы)

**Цель:** Довести capability-gated структурные интеракции до реально работающего сквозного пути: desktop детектит промпт → mobile показывает Approve/Reject и общие вопросы → ответ маппится в точный ввод PTY, с raw-terminal fallback для всего нераспознанного.

**Что фактически сделано:**
- Протокол: новый `capabilities.ts` (`INTERACTION_STRUCTURED`); `offeredCapabilities` в `desktop.register`/`mobile.pair`/`mobile.resume`; `negotiatedCapabilities` в результатах pair/resume/list/subscribe.
- Relay: хранит offered-наборы desktop и mobile, считает пересечение `mobile ∩ relay ∩ desktop` и кладёт `negotiatedCapabilities` в pair/resume (напрямую) и в форварднутые list/subscribe (инжект по методу из pending-записи).
- Desktop: `interactions.py` — ярусный `detect_prompt` (yes/no → approval, нумерованное меню → singleSelect, общий текстовый вопрос → text) с гейтом «вывод затих + нет финального `\n`» и debounce 200 мс на asyncio-таймере; регистрация активной интеракции, статус `waiting`, событие `interaction.requested`; обработчик `interaction.respond` с маппингом option→байты PTY, exactly-once, кодами `INTERACTION_STALE`/`INTERACTION_NOT_FOUND`, supersede и `sessionEnded`; `activeInteraction` в `session.subscribe`; `offeredCapabilities` в register.
- Mobile: `StructuredActionZone` рендерит по `kind` (approval/confirmation → Разрешить/Отклонить/Всегда, singleSelect → кнопки опций, text → поле ввода + Отправить; multiSelect → raw fallback); шлёт `offeredCapabilities` в pair/resume.

**Затронуто:** `packages/protocol/src/{capabilities.ts,index.ts,methods.ts}`; `apps/relay/src/{state.ts,handlers.ts,capabilities.test.ts}`; `apps/desktop/cucoudle_desktop/{interactions.py,protocol.py,registry.py,daemon.py,relay_client.py}` + `apps/desktop/tests/test_interactions.py`; `apps/mobile/src/features/session/StructuredActionZone.tsx` (+ тест) и `apps/mobile/src/application/{connectionCoordinator.ts,createMobileRuntime.ts}` (+ тест).

**Проверки:** core vitest 62 passed, desktop pytest 74 passed, mobile jest 158 passed; typecheck core+mobile — без ошибок; `npm run test:integration` (реальный демон↔relay↔mobile) — ALL STAGES PASSED (регрессия канала с новым кодом); детектор проверен против реального PTY-вывода `bash read -p`: yes/no → approval (`y\n`/`n\n`), вопрос → text, меню → singleSelect (`1\n`/`2\n`).

**Ключевые решения/ограничения:** (A) детект по затиханию вывода (debounce 200 мс), (B) статус `waiting` на время активного промпта, (C) `cancel` = снять интеракцию без ввода, (D) `multiSelect` заложен типом, детектор отложен. Детектор рассчитан на line-oriented промпты; полный alt-screen/TUI-парсинг (напр. родной permission-промпт Claude Code) вне границ — такие состояния остаются в raw-terminal fallback. Сквозной прогон именно через Expo-приложение с настоящим CLI-агентом ещё не выполнялся (проверено техническим клиентом, юнитами и harness'ом).

**Следующий шаг:** Проверить фичу через Expo-приложение на устройстве против настоящего Claude/Codex промпта; при наличии времени — Claude Code alt-screen adapter поверх ярусного детектора.

## 2026-07-11 — Интерфейс сессии поднимается над системной клавиатурой

**Цель:** Не допускать перекрытия terminal composer системной клавиатурой в открытой мобильной сессии, сохранив видимой шапку сессии.

**Сделано:** Экран `SessionScreen` обёрнут в полноэкранный `KeyboardAvoidingView`. На iOS применяется padding-avoidance, на Android через Expo-конфигурацию включён `softwareKeyboardLayoutMode: resize`; жёсткая высота клавиатуры и device-specific offsets не используются. У `PlainTerminal` и `StyledTerminal` снят прежний минимум 180 px, поэтому при уменьшении доступной высоты терминал действительно сжимается, а action area, interrupt и composer остаются над клавиатурой даже на небольших экранах. Добавлены regression tests platform mapping, вложенности composer в keyboard-aware frame и shrinkable terminal styles.

**Затронутые компоненты:** `apps/mobile/src/features/session/{SessionScreen.tsx,PlainTerminal.tsx,StyledTerminal.tsx,__tests__/SessionScreen.test.tsx,__tests__/StyledTerminal.test.tsx}`, `apps/mobile/app.json`, проектная спецификация и план, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** test-first цикл подтверждён: новые тесты сначала падали из-за отсутствующих `sessionKeyboardBehavior` и `session-keyboard-frame`, затем focused session suite прошёл 22/22; отдельные shrinkability assertions сначала увидели прежний `minHeight: 180`, после исправления две terminal suites прошли 26/26. Полный mobile Jest-прогон — 26 suites, 162/162; mobile TypeScript typecheck — успешно; Expo Doctor — 18/18; `git diff --check` — успешно.

**Решения, ограничения и проблемы:** Keyboard avoidance локализован на экране сессии и не меняет остальные экраны. На Android не добавляется второй ручной offset поверх системного resize. Автотесты подтверждают структуру и platform mapping, но не измеряют фактический keyboard inset или анимацию на устройстве; физический iPhone/Android smoke пока не выполнен. В общем рабочем дереве параллельно находятся пользовательские splash/dependency-изменения — они не входят в этот инкремент.

**Следующий шаг:** На физическом iPhone открыть живую сессию, сфокусировать «Введите команду», проверить видимость шапки и composer, сжатие терминала и восстановление высоты после закрытия клавиатуры; затем повторить на Android.

## 2026-07-11 — Двухфазный брендированный splash мобильного приложения

**Цель:** Сделать запуск Cucoudle визуально цельным с первого нативного кадра до завершения React bootstrap, используя утверждённую композицию и локальный production asset.

**Сделано:** В Expo настроена нативная splash-фаза: фон `#07111E`, локальный `assets/splash-icon.png`, масштабирование `contain`. Index route теперь продолжает запуск отдельным React Native `SplashScreen`: показывает ту же иллюстрацию, wordmark `Cucoudle`, tagline `AI CODING AGENTS · ONE CHAT` и доступный progress indicator, пока `AppProvider` восстанавливает состояние и выбирает начальный маршрут. Производственный asset скопирован в репозиторий и подтверждён как валидный PNG размером 1254×1254; добавлен component test композиции и accessibility-контракта. Дизайн и пошаговый план синхронизированы с фактической реализацией.

**Затронутые компоненты:** `apps/mobile/app.json`, `apps/mobile/assets/splash-icon.png`, `apps/mobile/src/app/index.tsx`, `apps/mobile/src/ui/SplashScreen.tsx`, `apps/mobile/src/ui/__tests__/SplashScreen.test.tsx`, `docs/superpowers/specs/2026-07-11-mobile-splash-screen-design.md`, `docs/superpowers/plans/2026-07-11-mobile-splash-screen.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** До появления параллельных незавершённых Inbox-изменений полный mobile Jest прошёл: 26/26 suites, 162/162 tests, 0 snapshots, exit 0. После документации повторный общий прогон на изменившемся рабочем дереве завершился с 25/26 suites и 162/166 tests: четыре assertion failures находятся в параллельно изменяемом `AttentionCard.test.tsx` и вызваны дублированием accessible-кнопок; splash suite остаётся зелёным. `npm run typecheck` (`tsc --noEmit`) — exit 0; `npx expo config --type public --json` — exit 0 и разрешает `splash.backgroundColor = #07111E`, `splash.image = ./assets/splash-icon.png`, `splash.resizeMode = contain`; `file` и `sips` подтверждают RGB PNG 1254×1254; `git diff --check` — успешно.

**Решения, ограничения и проблемы:** Искусственная минимальная задержка и анимация намеренно не добавлены: React splash живёт только до фактического завершения bootstrap. Нативная платформа ограничивает splash одним изображением, поэтому идентичность двух фаз проверена на уровне конфигурации и composition contract, но визуальный startup smoke release-сборки на физическом iPhone/Android ещё не выполнен. В Jest остаются два известных предупреждения Expo Router о лишних mock routes `new` и `settings` в `sessionNavigation.test.tsx`. Незавершённые параллельные Inbox-изменения не входят в этот инкремент и намеренно не исправлялись и не индексировались здесь.

**Следующий шаг:** Собрать release/dev build и на физических iPhone и Android проверить первый кадр, масштаб/отступы изображения, отсутствие светлой вспышки и плавность перехода native splash → React splash → начальный маршрут.

## 2026-07-11 — Тап по карточке и строке активности во «Входящих» открывает сессию

**Цель:** Починить переход в сессию с вкладки «Входящие»: тап по телу карточки «Требуют внимания» и по строке «Последняя активность» ничего не открывал — навигация срабатывала только при точном попадании в кнопку внутри карточки.

**Сделано:** Корневой контейнер `AttentionCard` заменён с `View` на `Pressable`, тап по телу карточки вызывает то же основное действие, что и кнопка (открыть сессию при `waiting`, просмотр в остальных статусах); вложенные кнопки «Скрыть» и structured actions продолжают перехватывать свои тапы. `ActivityRow` получил опциональный `onPress` и рендерится как доступная кнопка; `InboxScreen` пробрасывает `onViewSession(sessionId)` во все строки активности, кроме событий `removed`, где сессии уже нет — такие строки остаются некликабельными. `accessibilityRole="button"` на корне карточки намеренно не ставится, чтобы не создавать «кнопку в кнопке» и не ломать accessible-запросы к вложенным кнопкам.

**Затронутые компоненты:** `apps/mobile/src/features/inbox/{AttentionCard.tsx,ActivityRow.tsx,InboxScreen.tsx,__tests__/AttentionCard.test.tsx,__tests__/InboxScreen.test.tsx}`.

**Проверки:** Focused inbox suites — 13/13; полный mobile Jest — 26 suites, 166/166 (включая 4 новых теста: тап по телу waiting/error карточки, тап по строке активности, некликабельность `removed`); `tsc --noEmit` — exit 0. Регресс «Скрыть» покрыт assertion, что dismissal не вызывает навигацию.

**Решения, ограничения и проблемы:** Промежуточный вариант с `accessibilityRole="button"` на корне карточки давал дублирование accessible-кнопок (те самые четыре падения `AttentionCard.test.tsx`, зафиксированные в предыдущей записи как параллельные) — роль убрана, полный прогон снова зелёный. Тап на физическом устройстве ещё не проверялся.

**Следующий шаг:** В общем device smoke проверить с вкладки «Входящие» переходы: тап по карточке waiting → открытая сессия, тап по строке активности → сессия, «Скрыть» не открывает сессию.

## 2026-07-11 — Цельный composer без отдельной кнопки «Прервать»

**Цель:** Упростить нижнюю часть открытой сессии после device-снимка: убрать конкурирующую destructive-кнопку и превратить поле ввода с отправкой в один визуальный элемент.

**Сделано:** По выбранному HTML-макету A `SessionComposer` переделан в единый rounded-контейнер: multiline `TextInput` занимает всю ширину, а 44pt кнопка со стрелкой `↑` встроена справа снизу. Empty/offline/stopped состояния показывают приглушённую стрелку внутри поля вместо отдельного серого блока; pending-состояние показывает spinner, при этом прежняя защита от повторной отправки и сохранение draft при ошибке не изменены. `InterruptButton` удалён из session UI, его prop убран из `SessionScreen` и route; backend-метод interrupt оставлен в runtime/protocol вне UI. Сравнительный HTML-макет сохранён в `docs/session-composer-mockups.html`.

**Затронутые компоненты:** `apps/mobile/src/features/session/{SessionComposer.tsx,SessionScreen.tsx,InterruptButton.tsx,__tests__/SessionComposer.test.tsx,__tests__/SessionScreen.test.tsx}`, `apps/mobile/src/app/session/[id].tsx`, `docs/session-composer-mockups.html`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** Новые regression tests сначала зафиксировали старую композицию (отдельные input/send и видимый «Прервать»), затем focused composer/session suites прошли 30/30. После rebase поверх structured-interactions полный mobile Jest — 26 suites, 170/170; mobile TypeScript typecheck — успешно; Expo Doctor — 18/18; `git diff --check` — успешно.

**Решения, ограничения и проблемы:** Interrupt удалён только из пользовательского экрана, поэтому wire-контракт и runtime API остаются совместимыми и действие можно вернуть в более подходящем overflow/menu сценарии. Фактическая композиция с длинным multiline-текстом и системной клавиатурой ещё не проверена на физическом устройстве после этой правки.

**Следующий шаг:** На iPhone проверить empty/typing/pending/error состояния composer, рост до нескольких строк и видимость стрелки над клавиатурой; при необходимости отдельно спроектировать редкое interrupt-действие в overflow-меню.

## 2026-07-11 — Уточнение документации splash-фаз

**Цель:** Исправить границу доказанного для двухфазного мобильного splash и сохранить хронологию предыдущего инкремента без переписывания.

**Сделано:** Документация уточняет фактическое различие фаз: native splash показывает только локальный PNG на тёмном фоне, а React-фаза использует тот же PNG и отдельно добавляет wordmark `Cucoudle`, tagline `AI CODING AGENTS · ONE CHAT` и progress indicator. Технически подтверждены только разрешение native-конфигурации Expo и component contract React-фазы; визуальная идентичность или плавность перехода не заявляется.

**Затронутые компоненты:** `docs/superpowers/specs/2026-07-11-mobile-splash-screen-design.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** Свежий полный mobile Jest — 26/26 suites, 170/170 tests, 0 snapshots, exit 0; `npm run typecheck` (`tsc --noEmit`) — exit 0; `npx expo config --type public --json` — exit 0 и разрешает точные значения `splash.backgroundColor = #07111E`, `splash.image = ./assets/splash-icon.png`, `splash.resizeMode = contain`; `git diff --check` — успешно.

**Решения, ограничения и проблемы:** Визуальный переход native → React, фактический масштаб изображения и отсутствие светлой вспышки в release-сборке на физическом iPhone/Android по-прежнему не проверены.

**Следующий шаг:** Выполнить startup smoke release-сборки на физических iPhone и Android и зафиксировать первый кадр, масштаб изображения и переход между splash-фазами.

## 2026-07-11 — Ожидающие ответа сессии закреплены вверху списка

**Цель:** Не позволять сессиям, ожидающим пользовательского ввода, теряться среди более свежих активных или завершённых сессий и сделать требуемое действие очевидным.

**Сделано:** Селектор экрана «Сессии» теперь сначала группирует статус `waiting`, сохраняя сортировку по последней активности внутри ожидающей и обычной групп. Это действует для общего и активного фильтров; завершённый фильтр не меняется. Строка ожидающей сессии получила attention-фон и рамку, контрастный статус «Ждёт вашего ответа» и эквивалентную accessibility-метку вместо технического `waiting`.

**Затронутые компоненты:** `apps/mobile/src/state/inboxSelectors.ts`, `apps/mobile/src/state/__tests__/inboxSelectors.test.ts`, `apps/mobile/src/features/sessions/SessionRow.tsx`, `apps/mobile/src/features/sessions/__tests__/SessionsScreen.test.tsx`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** Новый focused regression suite сначала подтвердил оба прежних дефекта (ожидающая строка оставалась третьей и не имела явного текста), затем прошёл 9/9; полный mobile Jest — 26/26 suites, 171/171 tests; TypeScript typecheck и `git diff --check` — успешно. Сохраняются два известных предупреждения Expo Router о лишних mock routes `new` и `settings` в навигационном тесте.

**Решения, ограничения и проблемы:** Приоритет основан на authoritative desktop-статусе `waiting`, а не на эвристике мобильного клиента. Если desktop не распознал промпт (в частности, неподдержанный alt-screen/TUI), мобильный список не сможет поднять такую сессию. Визуальное состояние ещё не проверено на физическом устройстве.

**Следующий шаг:** На устройстве проверить обновление и перемещение живой сессии при переходах `running → waiting → running`, читаемость длинного статуса и поведение с несколькими ожидающими сессиями.

## 2026-07-11 — Текстовый ответ на interaction-карточку доставляется как paste + отдельный Enter

**Цель:** Устранить «проглатывание» сообщения, отправленного с телефона: текст попадал в composer TUI (codex/claude), но не сабмитился и не появлялся в терминале.

**Сделано:** Диагностика показала, что фикс дискретного Enter (911375a) закрыл только путь `session.input`, а путь `interaction.respond` с `type: "text"` по-прежнему писал `text + "\n"` в PTY одним куском — TUI распознавал burst как paste и «съедал» Enter, поэтому ответ на карточку «Ждёт вашего ответа» не сабмитился. Логика доставки вынесена в общий helper `Daemon._deliver_text` (bracketed-paste обёртка при включённом режиме + отдельный Enter через 60 мс) и используется обоими путями; добавлено debug-логирование доставки. PTY-репродукция с реальным codex подтвердила, что доставка через paste + отложенный Enter сабмитит сообщение и оно появляется в `terminal.render` кадрах.

**Затронутые компоненты:** `apps/desktop/cucoudle_desktop/daemon.py`, `apps/desktop/tests/test_daemon_text_input.py`; попутно зафиксирована dev-зависимость `@expo/ngrok` в `apps/mobile/package.json` (нужна для `expo start --tunnel` при демо с телефона).

**Проверки:** Новый suite `test_daemon_text_input.py` (3 теста: paste+delayed Enter для `session.input`, тот же контракт для `interaction.respond` text, plain-доставка без bracketed paste); полный desktop pytest — 81/81. Живая PTY-репродукция codex 80×24: сообщение и ответ видны в итоговых кадрах рендера.

**Решения, ограничения и проблемы:** Наблюдаемое пользователем «проглатывание» имело две причины: (1) тестирование шло против dev-daemon, запущенного до фикса 911375a; (2) новый путь ответа на interaction-карточку содержал ту же ошибку. Homebrew 0.1.5 (запущен 15:43) уже содержит фикс `session.input`, но не содержит фикс `interaction.respond` — для него нужен новый релиз или запуск daemon из исходников.

**Следующий шаг:** Перепроверить с телефона против текущего daemon оба пути ввода (composer сессии и текстовый ответ на карточку) и при подтверждении выпустить обновление Homebrew.

## 2026-07-11 — Readable и exact-режимы mobile terminal

**Цель:** Сделать сырой TUI-вывод Claude/Codex читаемым на узком экране, не теряя точную terminal grid и ANSI-стили.

**Сделано:** Добавлен mobile presentation parser для styled lines. Режим `Читать` удаляет invisible/control chars, нормализует NBSP/tabs, компактирует большие positional gaps, сливает соседние runs с одинаковым стилем, схлопывает blank rows и рендерит длинные TUI-разделители как линии. Сегмент `1:1` возвращает исходные runs/пробелы в единой горизонтально скроллируемой grid. При ручной прокрутке вверх появляется компактная кнопка `↓` для возврата к live tail; при follow-mode новые кадры по-прежнему прокручиваются автоматически.

**Затронутые компоненты:** `apps/mobile/src/features/session/{StyledTerminal.tsx,terminalPresentation.ts,__tests__/StyledTerminal.test.tsx,__tests__/terminalPresentation.test.ts}`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`; desktop, relay и wire-контракт не менялись.

**Проверки:** Mobile TypeScript typecheck — успешно; focused terminal suites — 11/11; полный mobile Jest — 27 suites, 178/178 tests; `git diff --check` — успешно. Известные Expo Router warnings о лишних mock routes `new`/`settings` остались, на результат не влияют.

**Решения, ограничения и проблемы:** Readable mode намеренно может менять большие пробельные отступы для рефлоу; поэтому `1:1` всегда доступен как lossless-представление. Оба режима сохраняют text selection и ANSI цвет/bold/italic/underline. Физический iOS/Android smoke и тюнинг ширины/типографики ещё нужны.

**Следующий шаг:** Прогнать на iPhone живые Claude/Codex сессии, сравнить `Читать` и `1:1` на code blocks, tables, approval prompts и spinner redraw, затем докрутить spacing/palette по device-снимкам.
