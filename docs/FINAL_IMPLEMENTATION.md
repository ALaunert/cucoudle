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
- создан Expo SDK 54 workspace `@cucoudle/mobile` с Expo Router, TypeScript, Jest/`jest-expo`, React Native Testing Library и командами запуска/проверок из корня монорепозитория; минимальный `BrandMark` и root route покрыты первым mobile component test, а Expo doctor проходит 18/18 проверок;
- реализован mobile protocol client с injectable WebSocket adapter, versioned request envelopes, корреляцией response по id, typed protocol errors, event/connection subscriptions и гарантированным отклонением pending requests при disconnect; client не содержит automatic retry для mutating requests;
- реализовано pure mobile session state: authoritative session list, lifecycle/event reducer, active interactions, cleanup при `session.removed`, bounded terminal buffers до 200 000 UTF-16 code units, replay по terminal `seq`, status-derived Inbox selectors, deterministic dismissal keys, recent activity и фильтры sessions;
- реализован независимый dark UI kit для mobile: theme tokens, safe-area screen, accessible primary/secondary/destructive buttons с 44pt touch target, connection banners, textual status badges и empty states;
- реализован mobile pairing flow: runtime-валидация QR/manual payload, точный полный relay WebSocket URL, CameraView и manual fallback, SecureStore-backed active profile, стабильная device identity и понятные pairing error states;
- реализованы продуктовые экраны Action Inbox и Sessions: status-derived attention cards, exact-key dismissal, generic lifecycle activity, offline/reconnecting states, active/completed filters, cwd basename и доступная навигация к session detail;
- реализован application bootstrap/provider и reconnect coordinator: восстановление profile, `mobile.resume` → `session.list` → восстановление открытой `session.subscribe`, bounded reconnect, отдельные recovery/pairing-required состояния и запрет mutating actions вне online; повторное pairing использует изолированный transport;
- реализованы live Session detail, New и Settings: моноширинный terminal buffer, ввод текста, interrupt, connection/recovery controls, подключение другого компьютера и очистка pairing profile;
- structured approval controls включаются только при negotiated capability `interaction.structured`, требуют online-состояния и защищены от повторной отправки; без capability остаётся raw terminal/session fallback;
- зафиксирован CLI-first MVP: desktop-daemon с shell-shims запускает CLI-агентов в PTY, relay передаёт сырой терминальный вывод на мобилу (без Claude/Codex SDK на этом этапе);
- реализован канал десктоп↔мобила — shared-протокол и relay-брокер (срез разработчика 3):
  - монорепо на npm workspaces с пакетами `@cucoudle/protocol` и `@cucoudle/relay`;
  - `@cucoudle/protocol` — zod-схемы versioned envelope, домена сессий, MVP-методов и событий, error codes, JSON-examples и хелперы разбора/сборки сообщений; потребляется как TS-исходники desktop-mirror'ом (Pydantic) и мобилой;
  - `@cucoudle/relay` — Fastify + WebSocket брокер: pairing по коду/QR с выдачей `mobileSessionToken` и reconnect через `mobile.resume`, presence-события, прозрачный форвардинг mobile↔desktop с корреляцией по `id` и fan-out событий desktop→mobile, health-эндпоинты;
  - relay коррелирует forwarded responses по паре desktop/request ID, отклоняет конфликтующие in-flight IDs, завершает зависшие requests по timeout и возвращает `DESKTOP_OFFLINE` при разрыве desktop connection;
  - канал покрыт unit-, интеграционными (включая reconnect через `mobile.resume`) и сквозным smoke-тестами (`npx vitest run` — 36 passed), проходит TypeScript typecheck и вручную проверен живым прогоном relay + fake-desktop + fake-mobile;
  - test toolchain обновлен до Vitest 3.2.7; `npm audit` подтверждает 0 известных vulnerabilities;
  - реальный Python desktop daemon проверен с настоящим relay, реальным shim/PTY и WebSocket mobile-клиентом: pairing, `session.list`, `session.subscribe`, `session.input`, `terminal.output`, `session.interrupt`, `session.ended` и presence-события прошли end-to-end;
  - production relay развёрнут на `relay.launert.dev` как отдельный Docker Compose service: контейнер имеет automatic restart/healthcheck, публикуется только на loopback, а Nginx отдаёт HTTPS/WSS через wildcard TLS certificate;
  - добавлен независимый relay release pipeline: path-filtered GitHub Actions выполняет tests/typecheck, собирает immutable GHCR image по commit SHA, обновляет отдельный Compose project через SSH, проверяет health/readiness и автоматически откатывает неуспешный релиз;
  - production relay пишет структурные JSON audit logs для connection lifecycle и protocol routing: role, desktop/mobile/session/request IDs, method/event, byte counts и result; тестовый флаг `RELAY_LOG_INPUT_TEXT=true` дополнительно пишет текст `session.input`/`interaction.respond`, при этом pairing codes и tokens не журналируются;
- реализована desktop-часть — daemon с PTY-мостом и прозрачными shell-shims (срез разработчика 1):
  - Python-пакет `apps/desktop/cucoudle_desktop`; Pydantic-модели зеркалят wire-контракт `docs/protocol-contracts.md`;
  - `GenericPtySession` запускает реальный CLI (`claude`/`codex`/`agent`/`cursor`) в PTY на stdlib, стримит вывод, принимает ввод, resize и `interrupt`; дочерний процесс получает управляющий терминал, поэтому локальный Ctrl+C доходит до процесса;
  - shim'ы — самодостаточные stdlib-программы; при недоступности демона, не-tty или вложенной управляемой сессии прозрачно `exec`'ят реальный бинарь (fallback обязателен);
  - установщик обнаруживает реальные бинари (исключая каталог shim'ов), генерирует shim'ы и идемпотентно правит shell-rc маркированным PATH-блоком с бэкапом (`install`/`uninstall`/`doctor`);
  - shell integration поддерживает zsh/bash/sh и fish, а generated shims используют portable `python3` shebang и не зависят от пути временного virtualenv;
  - desktop uninstall останавливает daemon, удаляет shims/PATH integration и опционально полностью очищает `~/.cucoudle`; self-contained purge script доступен для clean-slate тестов даже при сломанном Python environment;
  - демон — источник правды по сессиям: Unix-сокет-мост локального терминала + control-канал, единый монотонный `seq`, буфер вывода и `session.subscribe` в режимах `live`/`replay`/`snapshot`, relay-клиент с `desktop.register`/`desktop.pairing.create` и обработкой форварднутых mobile-запросов и событий;
  - production relay URL встроен в desktop как `wss://relay.launert.dev`; пользователь не вводит адрес, старый localhost-default мигрирует автоматически, а локальная разработка использует только environment override;
  - покрыто 38 тестами (`pytest`) и живым прогоном: реальный shim под PTY ↔ демон ↔ управляемый `/bin/cat`, зеркалирование ввода/вывода, live-листинг сессии и завершение по Ctrl+C; relay-клиент проверен против mock-relay.

## Архитектура и технологический стек

### Подтверждённые решения

- целевая форма продукта: мобильное приложение;
- базовый план окружения мобилы: Expo и TypeScript, запуск на iPhone через Expo Go;
- менеджер пакетов: npm (монорепо на npm workspaces);
- MVP интегрируется с CLI-агентами через desktop-daemon и shell-shims, запускающие реальный CLI в PTY; сырой терминальный вывод зеркалится на мобилу (нативные Claude/Codex SDK — вне MVP);
- транспорт мобила↔десктоп: WebSocket через relay-брокер; формат — versioned JSON-envelope (`request`/`response`/`event`);
- desktop — источник правды по сессиям; relay — тонкий брокер pairing/presence/форвардинга и transcript не хранит;
- relay является централизованной always-on инфраструктурой Cucoudle: его один раз разворачивают и обновляют операторы, он не входит в пользовательские install/uninstall lifecycle desktop и mobile;
- авторизация пары: одноразовый pairing-код (QR) + `mobileSessionToken` для reconnect.
- целевой input contract двухуровневый: универсальный terminal parity (`text`, `raw`, arbitrary `bytes`, named `keys` + modifiers) и structured interactions для approval, confirmation, choices и text prompts;
- semantic Approve/Reject UI создается только desktop provider adapter с exact PTY binding; неизвестные prompt всегда остаются доступны через raw terminal fallback.
- optional protocol features включаются только из `negotiatedCapabilities`, вычисленных как пересечение offers mobile, relay и desktop; отсутствие capability fields означает совместимый baseline text/raw.
- для мобильного UI выбрана архитектура `Action Inbox`: главный экран приоритизирует сессии в `waiting`, `error` и завершённые результаты, требующие просмотра; полный список сессий и живой терминал остаются отдельными основными сценариями;
- утверждена нижняя навигация `Входящие` / `Сессии` / `Новая` / `Настройки`; в MVP `Новая` подключает компьютер, а запуск сессии с телефона только зарезервирован до отдельного контракта;
- мобильный MVP рассчитан на один активный компьютер и простой моноширинный вывод terminal output; красивый ANSI/TUI-рендеринг отложен;
- в UI зарезервировано место под `Разрешить` / `Отклонить`; baseline без negotiated capability использует raw terminal fallback, а structured controls включаются только после реализации capability negotiation, desktop bindings и mobile controls.

### Ещё не реализовано

Expo workspace, protocol/state/UI foundations, pairing, Action Inbox, Sessions, live Session detail, New/Settings и reconnect/recovery composition уже созданы. Остались production runtime composition/smoke из Task 14 и запуск на физическом iPhone; Expo client пока проверен component/application tests с deterministic fake sockets, а полный канал — техническим WebSocket mobile-клиентом. Расширенные `session.input` modes (`bytes`, `keys`) и structured interactions реализованы в shared Zod-схемах и relay routing; mobile уже умеет capability-gated approval response, но production offers/intersection и desktop provider bindings ещё не завершены. Ещё не сделаны: Pydantic-зеркало и key/bytes mapping + provider-детекторы на desktop, полноценная сквозная capability negotiation, tray UI, SQLite persistence и production security. Production relay доступен по `https://relay.launert.dev`/`wss://relay.launert.dev`; оба WSS route проверены реальным upgrade и protocol error response. После добавления Expo SDK 54 актуальный `npm audit` сообщает 14 moderate advisories в Expo dependency chain; предлагаемое npm исправление переводит проект на несовместимый с выбранным Expo Go стеком Expo 57, поэтому zero-vulnerability gate остаётся открытым.

## Процесс разработки

- команда работает напрямую в `main`, чтобы не тратить время хакатона на обязательные ветки и pull request;
- завершённые проверенные инкременты сразу отправляются в `origin/main`;
- если удалённая ветка ушла вперёд, применяется `git pull --rebase origin main` с самостоятельным разрешением конфликтов и повторными проверками;
- force-push и переписывание опубликованной истории `main` запрещены;
- каждый значимый инкремент одновременно обновляет хронологический прогресс и этот актуальный снимок реализации.

## Презентационные материалы

Для защиты на хакатоне подготовлен demo-driven питч-дек из 8 слайдов
(`docs/presentation/cucoudle-pitch.html`, публикуется как Artifact): титул с
командой, суть продукта, демо-заглушка под живой показ, преимущества, схема
работы, возможности, roadmap и финал. Визуальная айдентика выведена из
логотипа (тёмная тема, градиент фиолетовый→голубой, тэглайн «AI coding agents.
One chat.»). Дек рассчитан на аудиторию жюри и использует человеческие
формулировки без технических деталей; проектное описание — в
`docs/superpowers/specs/2026-07-11-hackathon-pitch-deck-design.md`. Важно: дек
презентует и целевые возможности (например, подтверждение/отклонение запросов и
уведомления), которые в продукте ещё не реализованы, — фактическое проверенное
состояние остаётся в разделах выше. Демо-слайд пока остаётся заглушкой до
записи проверенного Expo runtime-сценария на устройстве.
- для Expo `Action Inbox` подготовлен подробный TDD-план из 14 задач: после последовательного scaffold предусмотрены три параллельные волны с непересекающимся владением файлами и последовательным integration checkpoint после каждой;
- параллельные mobile-исполнители не меняют Git index, а оркестратор проверяет общий результат, обновляет документы, коммитит и отправляет завершённую волну напрямую в `main`.

## Текущее проверенное состояние

Репозиторий содержит описание продукта, проектные спецификации, рабочий production relay, desktop-daemon с PTY-мостом и shell-shims, а также Expo SDK 54 workspace с проверенной Wave 3 application composition: live terminal/session controls, structured approval gating и reconnect/recovery lifecycle. Независимо разработанные desktop и relay соединены и проверены **воспроизводимым кросс-язык harness** (`npm run test:integration`, `tests/integration/desktop-relay-smoke.ts`): настоящий Python-демон против запущенного TS relay + mobile WebSocket-клиент проходят `register`/`pairing`/`session.list`/спаун сессии/`subscribe`/`session.input`→`terminal.output`. Текущий Wave 3 gate проходит 53 core tests, 143 mobile tests и оба typecheck. Сквозной runtime smoke именно через Expo-приложение и реальный запуск на iPhone пока не подтверждены, а настоящий Claude/Codex/Cursor в интеграционном прогоне заменялся контролируемым `/bin/cat` за shim `claude`.

## Ограничения

- pairing, Inbox, Sessions, live Session detail, reconnect и recovery UI готовы и покрыты component/application tests, но финальный production runtime smoke и физический iPhone smoke ещё не завершены; реальный desktop-daemon и relay пока проверены с техническим mobile-клиентом и управляемой PTY-сессией, но не с Expo-приложением и настоящим Claude/Codex/Cursor процессом;
- desktop-daemon пока без tray/GUI и без персистентности сессий в SQLite между рестартами;
- daemon autostart/login item пока не устанавливается автоматически: текущий CLI setup все еще просит один раз запустить `cucoudle daemon`;
- relay state остаётся in-memory: Compose переживает crash/reboot, но restart процесса сбрасывает pairing и mobile resume tokens;
- automated deploy активен: dedicated SSH credentials хранятся в защищённом GitHub environment, GHCR использует short-lived workflow token, а production работает на immutable image текущего commit SHA;
- desktop endpoint пока не аутентифицируется device secret; end-to-end шифрование, ключи и ревокация устройств отложены;
- запуск через Expo Go описан проектно и не подтверждён фактическим запуском на устройстве.
- актуальный `npm audit` после Expo scaffold сообщает 14 moderate advisories в транзитивной цепочке Expo SDK 54; обновление до предлагаемого Expo 57 противоречит утверждённой совместимости с Expo Go SDK 54, поэтому это открытый блокер будущего zero-vulnerability gate;
- `waiting` опционален: без desktop-side определения ожидания мобильный UI не пытается угадывать его по сырому терминальному тексту;
- mobile controls `Разрешить` / `Отклонить` и relay routing реализованы, но появляются только при полученной capability `interaction.structured`; desktop bindings и полная сквозная capability negotiation ещё нужны для production-сценария, а запуск сессии с телефона и расширенная семантическая лента действий остаются будущими расширениями;
- красивый ANSI-рендеринг, code blocks, ссылки и полноценная эмуляция TUI не входят в мобильный MVP.

## Демонстрационный сценарий

Проверяемый полный технический сценарий: обычный вызов `claude` через shim создает PTY-сессию в desktop daemon; mobile-клиент пейрится через relay, получает сессию, подписывается, отправляет текст, видит тот же вывод, что и локальный терминал, и завершает процесс через interrupt. Целевой продуктовый demo заменяет технический mobile-клиент на Expo-приложение, а `/bin/cat` за тестовым shim — на настоящий Claude/Codex/Cursor.

## Следующие шаги

1. TypeScript/Zod schemas для input modes и structured interactions и relay allowlist — сделано; осталось: capability offers/intersection (TS + relay) и Pydantic-зеркало на desktop.
2. Добавить desktop key/bytes mapping и первый provider interaction adapter с stale-response protection.
3. Завершить Task 14 mobile-плана: собрать production runtime composition, выполнить mobile flow/integration smoke, Expo doctor и запуск на физическом iPhone.
4. После реализации capability negotiation включить в том же UI terminal keyboard, Approve/Reject, choices и text response с обязательным raw fallback; повторить полный E2E.
5. Проверить настоящие Claude/Codex/Cursor prompts на macOS/Linux и iOS/Android.
6. Добавить автоматическое desktop device enrollment и хранение credential в Keychain/Secret Service без пользовательской настройки.
