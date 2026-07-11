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
## 2026-07-11 — Expo scaffold и mobile test harness

**Цель:** Создать физически совместимую с Expo Go основу мобильного приложения и включить её в общие тестовые и typecheck-команды монорепозитория.

**Сделано:** Создан npm workspace `@cucoudle/mobile` на Expo SDK 54 с Expo Router и TypeScript; подключены `expo-camera`, `expo-secure-store`, `expo-crypto`, Jest/`jest-expo` и React Native Testing Library. Добавлены root-команды `mobile`, `mobile:tunnel`, `mobile:doctor`, раздельные core/mobile test и typecheck gates. Root Vitest и TypeScript исключают вложенный Expo-проект. Через TDD добавлены минимальный `BrandMark`, root Stack и временный index route.

**Затронутые компоненты:** `apps/mobile/{package.json,app.json,tsconfig.json,jest.config.js,jest.setup.ts,expo-env.d.ts}`, `apps/mobile/src/app`, `apps/mobile/src/ui`, root `package.json`, `package-lock.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`.

**Проверки:** `BrandMark.test.tsx` сначала завершился ожидаемым red из-за отсутствующего `BrandMark`, после минимальной реализации — green. Свежий `npm test` — 52 core tests в 9 файлах и 1 mobile test прошли; `npm run typecheck` — core и mobile прошли; `npm run mobile:doctor` — 18/18 проверок, проблем не обнаружено.

**Решения, ограничения и проблемы:** Expo scaffold является только технической основой: pairing, mobile protocol client, session state и продуктовые экраны ещё не реализованы. После установки Expo SDK 54 `npm audit --json` сообщает 14 moderate advisories в транзитивной Expo dependency chain; npm предлагает только несовместимый переход на Expo 57, поэтому Task 1 не маскирует результат как zero-vulnerability, а следующему обязательному audit gate потребуется отдельное совместимое решение. Git remote fetch/pull был заблокирован политикой выполнения среды до запуска команды; локальная ветка при старте показывала `main...origin/main` без расхождения, tracked-изменений не было, а неизвестные `.superpowers/`, session prompt и `docs/SESSION_HANDOFF.md` не изменялись и не добавлялись.

**Следующий шаг:** Параллельно реализовать Wave 1: request-correlated mobile protocol client, pure session state/selectors и approved dark UI kit, затем выполнить общий integration gate.
