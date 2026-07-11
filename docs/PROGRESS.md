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
