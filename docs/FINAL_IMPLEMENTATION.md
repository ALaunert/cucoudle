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
- реализован двухфазный брендированный запуск мобильного приложения: до готовности JavaScript Expo показывает нативный splash с локальным PNG на фоне `#07111E` в режиме `contain`, затем index route без искусственной задержки продолжает тем же тёмным React Native экраном с иллюстрацией, wordmark `Cucoudle`, tagline `AI CODING AGENTS · ONE CHAT` и доступным индикатором загрузки, пока bootstrap выбирает начальный маршрут; Expo public config разрешает asset и все три splash-параметра, а React-композиция покрыта component test;
- реализован mobile protocol client с injectable WebSocket adapter, versioned request envelopes, корреляцией response по id, typed protocol errors, event/connection subscriptions и гарантированным отклонением pending requests при disconnect; client не содержит automatic retry для mutating requests;
- реализовано pure mobile session state: authoritative session list, lifecycle/event reducer, active interactions, cleanup при `session.removed`, bounded terminal buffers до 200 000 UTF-16 code units, replay по terminal `seq`, status-derived Inbox selectors, deterministic dismissal keys, recent activity и фильтры sessions;
- реализован независимый dark UI kit для mobile: theme tokens, safe-area screen, accessible primary/secondary/destructive buttons с 44pt touch target, connection banners, textual status badges и empty states;
- реализован mobile pairing flow: runtime-валидация QR/manual payload, точный полный relay WebSocket URL, CameraView и manual fallback, SecureStore-backed active profile, стабильная device identity и понятные pairing error states;
- реализованы продуктовые экраны Action Inbox и Sessions: status-derived attention cards, exact-key dismissal, generic lifecycle activity, offline/reconnecting states, active/completed filters, cwd basename и доступная навигация к session detail; во «Входящих» сессия открывается тапом по всему телу attention card и по строке recent activity (кроме `removed`-событий, у которых сессии уже нет), а «Скрыть» и structured actions не вызывают навигацию;
- реализован application bootstrap/provider и reconnect coordinator: восстановление profile, `mobile.resume` → `session.list` → восстановление открытой `session.subscribe`, bounded reconnect, отдельные recovery/pairing-required состояния и запрет mutating actions вне online; повторное pairing использует изолированный transport;
- реализованы live Session detail, New и Settings: моноширинный terminal buffer, ввод текста с передачей `submit: true` и преобразованием отправки в PTY Enter (`\r`) на desktop, interrupt, connection/recovery controls, подключение другого компьютера и очистка pairing profile; экран сессии учитывает системную клавиатуру — на iOS keyboard-aware контейнер поднимает controls, на Android окно работает в режиме `resize`, а оба варианта flex-терминала могут сжиматься до доступной высоты;
- мобильный runtime собран в отдельный модуль `createMobileRuntime` (connection coordinator + pairing transport + protocol-запросы), `AppProvider` — тонкий React-слой над ним; навигация список сессий → `/session/[id]` → «назад» работает, камера пейринга на iPhone Pro принудительно выбирает обычную широкоугольную линзу, а `metro.config.js` резолвит `.js`-импорты монорепо-пакетов;
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
  - production relay пишет структурные JSON audit logs для connection lifecycle и protocol routing; тестовые флаги дополнительно сохраняют input/output text и полный inbound protocol envelope (`message.received.payload`), рекурсивно маскируя credential-like keys (`token`, `pairingCode`, `secret`, `password`, `authorization`);
- реализована desktop-часть — daemon с PTY-мостом и прозрачными shell-shims (срез разработчика 1):
  - Python-пакет `apps/desktop/cucoudle_desktop`; Pydantic-модели зеркалят wire-контракт `docs/protocol-contracts.md`;
  - `GenericPtySession` запускает реальный CLI (`claude`/`codex`/`agent`/`cursor`) в PTY на stdlib, стримит вывод, принимает ввод, resize и `interrupt`; дочерний процесс получает управляющий терминал, поэтому локальный Ctrl+C доходит до процесса;
  - shim'ы — самодостаточные stdlib-программы; при недоступности демона, не-tty или вложенной управляемой сессии прозрачно `exec`'ят реальный бинарь (fallback обязателен);
  - установщик обнаруживает реальные бинари (исключая каталог shim'ов), генерирует shim'ы и идемпотентно правит shell-rc маркированным PATH-блоком с бэкапом (`install`/`uninstall`/`doctor`);
  - shell integration поддерживает zsh/bash/sh и fish, а generated shims используют portable `python3` shebang и не зависят от пути временного virtualenv;
  - при разрыве shim↔daemon shim восстанавливает `termios` и явно выключает mouse/focus/bracketed-paste, synchronized-output, Unicode/Kitty keyboard и modifyOtherKeys modes, чтобы аварийный выход из Claude/Codex TUI не превращал terminal reports в shell input;
  - desktop uninstall останавливает daemon, удаляет shims/PATH integration и опционально полностью очищает `~/.cucoudle`; self-contained purge script доступен для clean-slate тестов даже при сломанном Python environment;
  - Homebrew formula устанавливает CLI в isolated virtualenv, включает `service do` для одного LaunchAgent daemon через `brew services`, использует bottled `pydantic` и pinned qrcode/websockets resources без пользовательского Rust toolchain;
  - демон — источник правды по сессиям: Unix-сокет-мост локального терминала + control-канал, единый монотонный `seq`, буфер вывода и `session.subscribe` в режимах `live`/`replay`/`snapshot`, relay-клиент с `desktop.register`/`desktop.pairing.create` и обработкой форварднутых mobile-запросов и событий;
  - серверный рендер терминала: демон прогоняет копию PTY-байтов через эмулятор pyte (`TerminalRenderer`) и шлёт мобиле коалесцированные (50 мс) кадры `terminal.render`; private DSR и Kitty keyboard queries фильтруются только в render-копии, а любая ошибка renderer отключает styled render для сессии, но не может прервать raw PTY I/O; `session.subscribe` отдаёт `terminalRender`-снапшот, а мобила рендерит его `StyledTerminal` с fallback на `PlainTerminal`;
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
- structured controls (`Разрешить` / `Отклонить`, выбор опций, текстовый ответ) включаются по negotiated capability `interaction.structured`; baseline без capability и любые нераспознанные детектором промпты остаются в raw terminal fallback.

### Ещё не реализовано

Expo workspace, protocol/state/UI foundations, pairing, Action Inbox, Sessions, live Session detail, New/Settings и reconnect/recovery composition уже созданы. Остались production runtime composition/smoke из Task 14 и запуск на физическом iPhone; Expo client пока проверен component/application tests с deterministic fake sockets, а полный канал — техническим WebSocket mobile-клиентом. Structured interactions теперь работают сквозным путём: capability negotiation (`offeredCapabilities`/`negotiatedCapabilities`, пересечение mobile ∩ relay ∩ desktop) реализована в протоколе и relay; desktop детектит line-oriented промпты (yes/no → approval, нумерованное меню → singleSelect, общий текстовый вопрос → text), эмитит `interaction.requested`, маппит ответ в точный ввод PTY с exactly-once и stale-защитой; mobile рендерит Approve/Reject, выбор опций и текстовый ответ по `kind`. Ещё не сделаны: расширенные `session.input` modes (`bytes`, `keys`) на desktop, alt-screen/TUI provider-адаптеры (напр. родной permission-промпт Claude Code), tray UI, SQLite persistence и production security. Production relay доступен по `https://relay.launert.dev`/`wss://relay.launert.dev`; оба WSS route проверены реальным upgrade и protocol error response. После добавления Expo SDK 54 актуальный `npm audit` сообщает 14 moderate advisories в Expo dependency chain; предлагаемое npm исправление переводит проект на несовместимый с выбранным Expo Go стеком Expo 57, поэтому zero-vulnerability gate остаётся открытым.

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

Репозиторий содержит описание продукта, проектные спецификации, рабочий production relay, desktop-daemon с PTY-мостом и shell-shims, а также Expo SDK 54 workspace с проверенной Wave 3 application composition: live terminal/session controls, structured approval gating и reconnect/recovery lifecycle. Запуск мобилы теперь состоит из согласованных нативной Expo и React Native фаз на фоне `#07111E`: локальный PNG показывается до готовности JavaScript, после чего index route отображает бренд, tagline и индикатор только на время фактического bootstrap без таймера или анимации. Мобильный composer отправляет чистый текст с `submit: true`, а desktop добавляет PTY Enter (`\r`), поэтому ответ не только вставляется, но и подтверждается в интерактивном CLI; legacy newline payload остаётся совместимым. Экран открытой сессии теперь обёрнут в полноэкранный `KeyboardAvoidingView`: iOS использует padding-avoidance, Android — системный window resize, поэтому шапка и controls сохраняют естественную высоту, а `PlainTerminal` и `StyledTerminal` больше не удерживают прежний минимум 180 px и сжимаются в доступное пространство. Независимо разработанные desktop и relay соединены и проверены **воспроизводимым кросс-язык harness** (`npm run test:integration`, `tests/integration/desktop-relay-smoke.ts`): настоящий Python-демон против запущенного TS relay + mobile WebSocket-клиент проходят `register`/`pairing`/`session.list`/спаун сессии/`subscribe`/`session.input`→`terminal.output`. Тот же smoke проходит и против production relay (`RELAY_WS=wss://relay.launert.dev`), в том числе на macOS. До появления параллельных незавершённых Inbox-изменений splash-инкремент прошёл полный gate: 26/26 mobile suites и 162/162 tests, mobile typecheck и разрешение Expo public config с нативным splash; ранее подтверждены Expo Doctor 18/18, 58 core tests и 64 desktop pytest. Inbox-инкремент с тапом по attention card/activity row завершён, и последний общий Jest-прогон рабочего дерева снова зелёный: 26/26 suites, 166/166 tests. Mobile runtime composition из Task 14 собран (`createMobileRuntime` + application-тест `mobileFlow`). Визуальный переход splash на release-сборке и физическом iPhone/Android ещё не подтверждён; точная анимация и inset системной клавиатуры также не проверены на устройствах, как и полный сквозной runtime smoke именно через Expo-приложение; настоящий Claude/Codex/Cursor в интеграционном прогоне заменялся контролируемым `/bin/cat` за shim `claude`.

## Ограничения

- pairing, Inbox, Sessions, live Session detail, reconnect и recovery UI готовы и покрыты component/application tests, но финальный production runtime smoke и физический iPhone smoke ещё не завершены; реальный desktop-daemon и relay пока проверены с техническим mobile-клиентом и управляемой PTY-сессией, но не с Expo-приложением и настоящим Claude/Codex/Cursor процессом;
- desktop-daemon пока без tray/GUI и без персистентности сессий в SQLite между рестартами;
- обновление/перезапуск daemon завершает хранящиеся в его памяти PTY-сессии; shim теперь гарантированно восстанавливает локальный terminal, но process persistence остаётся будущей задачей;
- Homebrew install поддерживает background daemon/autostart после разовой команды `brew services start cucoudle`; generic pip/CLI install пока не устанавливает systemd user service или LaunchAgent автоматически;
- relay state остаётся in-memory: Compose переживает crash/reboot, но restart процесса сбрасывает pairing и mobile resume tokens;
- automated deploy активен: dedicated SSH credentials хранятся в защищённом GitHub environment, GHCR использует short-lived workflow token, а production работает на immutable image текущего commit SHA;
- desktop endpoint пока не аутентифицируется device secret; end-to-end шифрование, ключи и ревокация устройств отложены;
- нативная и React-фазы splash настроены и проверены тестами/config resolution, но визуальный startup smoke release-сборки на физическом iPhone/Android ещё не выполнен; запуск через Expo Go также не подтверждён фактическим прогоном на устройстве.
- актуальный `npm audit` после Expo scaffold сообщает 14 moderate advisories в транзитивной цепочке Expo SDK 54; обновление до предлагаемого Expo 57 противоречит утверждённой совместимости с Expo Go SDK 54, поэтому это открытый блокер будущего zero-vulnerability gate;
- `waiting` опционален: без desktop-side определения ожидания мобильный UI не пытается угадывать его по сырому терминальному тексту;
- structured interactions реализованы сквозным путём (protocol capability negotiation, relay-инъекция `negotiatedCapabilities`, desktop line-oriented детектор + маппинг ответа в PTY с exactly-once/stale-защитой, mobile-рендер по `kind`); controls появляются только при negotiated `interaction.structured`. Детектор покрывает line-oriented промпты (yes/no, нумерованное меню, общий текстовый вопрос); alt-screen/TUI provider-адаптеры (напр. родной permission-промпт Claude Code), запуск сессии с телефона и расширенная семантическая лента действий остаются будущими расширениями; проверка именно через Expo-приложение с настоящим CLI-агентом ещё не выполнялась;
- терминальный рендеринг ограничен server-side эмуляцией pyte (не 100% xterm-фич), палитра ANSI-цветов — приближение к десктопным темам; markdown/code blocks/ссылки как семантические блоки не входят в мобильный MVP; сырой `terminal.output` временно дублирует `terminal.render` в трафике до внедрения capability negotiation.

## Демонстрационный сценарий

Проверяемый полный технический сценарий: обычный вызов `claude` через shim создает PTY-сессию в desktop daemon; mobile-клиент пейрится через relay, получает сессию, подписывается, отправляет текст, видит тот же вывод, что и локальный терминал, и завершает процесс через interrupt. Целевой продуктовый demo заменяет технический mobile-клиент на Expo-приложение, а `/bin/cat` за тестовым shim — на настоящий Claude/Codex/Cursor.

## Следующие шаги

1. TypeScript/Zod schemas для input modes и structured interactions и relay allowlist — сделано; осталось: capability offers/intersection (TS + relay) и Pydantic-зеркало на desktop.
2. Добавить desktop key/bytes mapping и первый provider interaction adapter с stale-response protection.
3. Завершить Task 14 mobile-плана: production runtime composition и mobile flow test собраны; остались integration smoke, Expo doctor и подтверждённый запуск на физическом iPhone.
4. После реализации capability negotiation включить в том же UI terminal keyboard, Approve/Reject, choices и text response с обязательным raw fallback; повторить полный E2E.
5. Проверить настоящие Claude/Codex/Cursor prompts на macOS/Linux и iOS/Android.
6. Добавить автоматическое desktop device enrollment и хранение credential в Keychain/Secret Service без пользовательской настройки.
