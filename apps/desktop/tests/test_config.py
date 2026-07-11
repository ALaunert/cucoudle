import json

from cucoudle_desktop.config import (
    DEFAULT_RELAY_URL,
    LEGACY_LOCAL_RELAY_URL,
    default_config,
    load_or_create_config,
)


def test_default_config_uses_production_relay(tmp_path, monkeypatch):
    monkeypatch.delenv("CUCOUDLE_RELAY_URL", raising=False)

    cfg = default_config(tmp_path)

    assert cfg.relay_url == "wss://relay.launert.dev"
    assert cfg.relay_url == DEFAULT_RELAY_URL


def test_environment_overrides_production_relay(tmp_path, monkeypatch):
    monkeypatch.setenv("CUCOUDLE_RELAY_URL", "ws://127.0.0.1:8787")

    cfg = default_config(tmp_path)

    assert cfg.relay_url == "ws://127.0.0.1:8787"


def test_legacy_local_default_is_migrated_and_persisted(tmp_path, monkeypatch):
    monkeypatch.delenv("CUCOUDLE_RELAY_URL", raising=False)
    tmp_path.mkdir(parents=True, exist_ok=True)
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps({
            "desktopId": "desk_legacy",
            "desktopName": "Legacy Mac",
            "platform": "macos",
            "appVersion": "0.1.0",
            "relayUrl": LEGACY_LOCAL_RELAY_URL,
            "realBinaries": {},
        }),
        encoding="utf-8",
    )

    cfg = load_or_create_config(tmp_path)

    assert cfg.relay_url == DEFAULT_RELAY_URL
    assert json.loads(config_path.read_text(encoding="utf-8"))["relayUrl"] == DEFAULT_RELAY_URL


def test_custom_persisted_relay_is_preserved(tmp_path, monkeypatch):
    monkeypatch.delenv("CUCOUDLE_RELAY_URL", raising=False)
    cfg = default_config(tmp_path)
    cfg.relay_url = "wss://relay.internal.example"
    cfg.save()

    loaded = load_or_create_config(tmp_path)

    assert loaded.relay_url == "wss://relay.internal.example"
