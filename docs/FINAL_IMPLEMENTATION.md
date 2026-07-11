# Cucoudle — актуальная реализация

Этот документ отражает текущее проверенное состояние проекта и обновляется после каждого значимого инкремента разработки. Он служит основным источником фактов для итоговой презентации хакатона.

## Проблема

Разработчику, использующему Cursor, Codex или Claude, нужен мобильный способ удалённо взаимодействовать с агентскими сессиями, когда он находится не за рабочим компьютером.

## Продуктовая идея

Cucoudle — мобильное приложение для удалённого управления сессиями Cursor, Codex и Claude.

## Целевая аудитория

- разработчики, использующие AI-агентов в ежедневной работе;
- участники команд, которым важно контролировать длительные агентские задачи с телефона;
- пользователи нескольких агентских инструментов, которым нужен единый мобильный интерфейс.

## Реализовано и подтверждено

- создан репозиторий проекта;
- назначение продукта зафиксировано в README;
- спроектирован минимальный путь разработки на базе Expo с TypeScript и запуска на реальном iPhone через Expo Go;
- определён tunnel-режим как резервный способ подключения устройства к Metro;
- Codex и Claude Code получают общие командные правила через `AGENTS.md` и `CLAUDE.md`;
- создан процесс накопления хронологии разработки и актуального описания продукта для презентации;
- зафиксирован CLI-first MVP: desktop-daemon с shell-shims запускает CLI-агентов в PTY, relay передаёт сырой терминальный вывод на мобилу (без Claude/Codex SDK на этом этапе);
- реализован канал десктоп↔мобила — shared-протокол и relay-брокер (срез разработчика 3):
  - монорепо на npm workspaces с пакетами `@cucoudle/protocol` и `@cucoudle/relay`;
  - `@cucoudle/protocol` — zod-схемы versioned envelope, домена сессий, MVP-методов и событий, error codes, JSON-examples и хелперы разбора/сборки сообщений; потребляется как TS-исходники desktop-mirror'ом (Pydantic) и мобилой;
  - `@cucoudle/relay` — Fastify + WebSocket брокер: pairing по коду/QR с выдачей `mobileSessionToken` и reconnect через `mobile.resume`, presence-события, прозрачный форвардинг mobile↔desktop с корреляцией по `id` и fan-out событий desktop→mobile, health-эндпоинты;
  - relay коррелирует forwarded responses по паре desktop/request ID, отклоняет конфликтующие in-flight IDs, завершает зависшие requests по timeout и возвращает `DESKTOP_OFFLINE` при разрыве desktop connection;
  - канал покрыт unit-, интеграционными (включая reconnect через `mobile.resume`) и сквозным smoke-тестами (`npx vitest run` — 36 passed), проходит TypeScript typecheck и вручную проверен живым прогоном relay + fake-desktop + fake-mobile;
  - test toolchain обновлен до Vitest 3.2.7; `npm audit` подтверждает 0 известных vulnerabilities;
  - реальный Python desktop daemon проверен с настоящим relay, реальным shim/PTY и WebSocket mobile-клиентом: pairing, `session.list`, `session.subscribe`, `session.input`, `terminal.output`, `session.interrupt`, `session.ended` и presence-события прошли end-to-end;
  - подготовлен Docker + Nginx deployment bundle для `relay.launert.dev` с loopback binding контейнера, wildcard TLS и WebSocket proxy timeouts;
- реализована desktop-часть — daemon с PTY-мостом и прозрачными shell-shims (срез разработчика 1):
  - Python-пакет `apps/desktop/cucoudle_desktop`; Pydantic-модели зеркалят wire-контракт `docs/protocol-contracts.md`;
  - `GenericPtySession` запускает реальный CLI (`claude`/`codex`/`agent`/`cursor`) в PTY на stdlib, стримит вывод, принимает ввод, resize и `interrupt`; дочерний процесс получает управляющий терминал, поэтому локальный Ctrl+C доходит до процесса;
  - shim'ы — самодостаточные stdlib-программы; при недоступности демона, не-tty или вложенной управляемой сессии прозрачно `exec`'ят реальный бинарь (fallback обязателен);
  - установщик обнаруживает реальные бинари (исключая каталог shim'ов), генерирует shim'ы и идемпотентно правит shell-rc маркированным PATH-блоком с бэкапом (`install`/`uninstall`/`doctor`);
  - демон — источник правды по сессиям: Unix-сокет-мост локального терминала + control-канал, единый монотонный `seq`, буфер вывода и `session.subscribe` в режимах `live`/`replay`/`snapshot`, relay-клиент с `desktop.register`/`desktop.pairing.create` и обработкой форварднутых mobile-запросов и событий;
  - покрыто 38 тестами (`pytest`) и живым прогоном: реальный shim под PTY ↔ демон ↔ управляемый `/bin/cat`, зеркалирование ввода/вывода, live-листинг сессии и завершение по Ctrl+C; relay-клиент проверен против mock-relay.

## Архитектура и технологический стек

### Подтверждённые решения

- целевая форма продукта: мобильное приложение;
- базовый план окружения мобилы: Expo и TypeScript, запуск на iPhone через Expo Go;
- менеджер пакетов: npm (монорепо на npm workspaces);
- MVP интегрируется с CLI-агентами через desktop-daemon и shell-shims, запускающие реальный CLI в PTY; сырой терминальный вывод зеркалится на мобилу (нативные Claude/Codex SDK — вне MVP);
- транспорт мобила↔десктоп: WebSocket через relay-брокер; формат — versioned JSON-envelope (`request`/`response`/`event`);
- desktop — источник правды по сессиям; relay — тонкий брокер pairing/presence/форвардинга и transcript не хранит;
- авторизация пары: одноразовый pairing-код (QR) + `mobileSessionToken` для reconnect.
- целевой input contract двухуровневый: универсальный terminal parity (`text`, `raw`, arbitrary `bytes`, named `keys` + modifiers) и structured interactions для approval, confirmation, choices и text prompts;
- semantic Approve/Reject UI создается только desktop provider adapter с exact PTY binding; неизвестные prompt всегда остаются доступны через raw terminal fallback.
- optional protocol features включаются только из `negotiatedCapabilities`, вычисленных как пересечение offers mobile, relay и desktop; отсутствие capability fields означает совместимый baseline text/raw.
- для мобильного UI выбрана архитектура `Action Inbox`: главный экран приоритизирует сессии в `waiting`, `error` и завершённые результаты, требующие просмотра; полный список сессий и живой терминал остаются отдельными основными сценариями;
- утверждена нижняя навигация `Входящие` / `Сессии` / `Новая` / `Настройки`; в MVP `Новая` подключает компьютер, а запуск сессии с телефона только зарезервирован до отдельного контракта;
- мобильный MVP рассчитан на один активный компьютер и простой моноширинный вывод terminal output; красивый ANSI/TUI-рендеринг отложен;
- в UI зарезервировано место под `Разрешить` / `Отклонить`; baseline без negotiated capability использует raw terminal fallback, а structured controls включаются только после реализации capability negotiation, desktop bindings и mobile controls.

### Ещё не реализовано

Мобильное Expo-приложение (`apps/mobile`) пока отсутствует, поэтому канал пока проверен через технический WebSocket mobile-клиент. Для mobile согласован подробный UI-дизайн `Action Inbox`, но код экранов, WebSocket-клиент и запуск на iPhone ещё не реализованы. Расширенные `session.input` modes (`bytes`, `keys`) и structured interactions реализованы на уровне протокола: shared Zod-схемы в `@cucoudle/protocol` и relay-allowlist готовы и покрыты тестами (relay форвардит `interaction.respond` и фанит `interaction.*`). Capability negotiation (offers/`negotiatedCapabilities`) пока только специфицирована и не реализована. Ещё не сделаны: Pydantic-зеркало и key/bytes mapping + provider-детекторы на desktop, mobile offer/controls, capability negotiation в relay/desktop/mobile, tray/settings UI, SQLite persistence и production security. Deployment bundle подготовлен, но не активирован: доступная SSH-учетка не имеет административных прав на Docker и Nginx.

## Процесс разработки

- команда работает напрямую в `main`, чтобы не тратить время хакатона на обязательные ветки и pull request;
- завершённые проверенные инкременты сразу отправляются в `origin/main`;
- если удалённая ветка ушла вперёд, применяется `git pull --rebase origin main` с самостоятельным разрешением конфликтов и повторными проверками;
- force-push и переписывание опубликованной истории `main` запрещены;
- каждый значимый инкремент одновременно обновляет хронологический прогресс и этот актуальный снимок реализации.

## Текущее проверенное состояние

Репозиторий содержит описание продукта, проектные спецификации, рабочий relay и desktop-daemon с PTY-мостом и shell-shims. Независимо разработанные desktop и relay соединены и проверены полным локальным сквозным прогоном через технический mobile WebSocket-клиент. Мобильный Expo UI пока не создан, а настоящий Claude/Codex/Cursor в этом интеграционном прогоне заменялся контролируемым `/bin/cat` за shim `claude`.

## Ограничения

- мобильного UI пока нет; реальный desktop-daemon и relay проверены с техническим mobile-клиентом и управляемой PTY-сессией, но не с Expo-приложением и настоящим Claude/Codex/Cursor процессом;
- desktop-daemon пока без tray/GUI и без персистентности сессий в SQLite между рестартами;
- relay in-memory: при рестарте pairing и `mobileSessionToken` теряются;
- конфигурация удаленного TLS endpoint подготовлена, но не применена на сервере из-за отсутствия административных прав у SSH-учетки;
- desktop endpoint пока не аутентифицируется device secret; end-to-end шифрование, ключи и ревокация устройств отложены;
- запуск через Expo Go описан проектно и не подтверждён фактическим запуском на устройстве.
- `waiting` опционален: без desktop-side определения ожидания мобильный UI не пытается угадывать его по сырому терминальному тексту;
- прямые действия `Разрешить` / `Отклонить` уже описаны target-контрактом и реализованы в TS/Zod + relay routing, но ещё требуют desktop bindings, capability negotiation и mobile controls; запуск сессии с телефона и семантическая лента действий всё ещё требуют будущих расширений;
- красивый ANSI-рендеринг, code blocks, ссылки и полноценная эмуляция TUI не входят в мобильный MVP.

## Демонстрационный сценарий

Проверяемый полный технический сценарий: обычный вызов `claude` через shim создает PTY-сессию в desktop daemon; mobile-клиент пейрится через relay, получает сессию, подписывается, отправляет текст, видит тот же вывод, что и локальный терминал, и завершает процесс через interrupt. Целевой продуктовый demo заменяет технический mobile-клиент на Expo-приложение, а `/bin/cat` за тестовым shim — на настоящий Claude/Codex/Cursor.

## Следующие шаги

1. TypeScript/Zod schemas для input modes и structured interactions и relay allowlist — сделано; осталось: capability offers/intersection (TS + relay) и Pydantic-зеркало на desktop.
2. Добавить desktop key/bytes mapping и первый provider interaction adapter с stale-response protection.
3. Составить план и реализовать утверждённый Expo UI `Action Inbox`: pairing, четыре вкладки, status-derived inbox, список сессий, детальный экран с простым терминальным выводом, composer, interrupt и reconnect поверх baseline `@cucoudle/protocol`.
4. После реализации capability negotiation включить в том же UI terminal keyboard, Approve/Reject, choices и text response с обязательным raw fallback; повторить полный E2E.
5. Проверить настоящие Claude/Codex/Cursor prompts на macOS/Linux и iOS/Android.
