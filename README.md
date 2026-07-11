# Cucoudle

Мобильное приложение для удалённого управления сессиями Cursor, Codex и Claude.

## Статус

Проект находится на начальном этапе проектирования.

## Документация

- [Hackathon implementation plan](docs/hackathon-implementation-plan.md) — стек, архитектура MVP, разделение на 3 разработчиков и точки интеграции desktop/mobile/relay.
- [CLI remote control MVP design](docs/superpowers/specs/2026-07-11-cli-remote-control-mvp-design.md) — superpowers-style spec для CLI-only MVP.
- [Protocol contracts](docs/protocol-contracts.md) — контракты backend/mobile, desktop/backend и desktop/mobile через relay.

## Relay (срез разработчика 3)

Требуется Node.js 20+.

```bash
npm install
npm run relay              # relay на ws://localhost:8787
npm test                   # прогон protocol + relay
```

Health: `curl localhost:8787/healthz` и `curl localhost:8787/readyz`.

### Сквозной smoke без реальных приложений

Три терминала:

```bash
npm run relay                                              # терминал 1
npm run fake:desktop -w @cucoudle/relay                    # терминал 2 — печатает PAIRING CODE
PAIRING_CODE=<code> npm run fake:mobile -w @cucoudle/relay  # терминал 3
```

Fake-mobile пейрится, получает список сессий, стримит вывод терминала и отправляет ввод обратно в fake-desktop.
