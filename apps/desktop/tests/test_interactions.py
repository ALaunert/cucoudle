from cucoudle_desktop.interactions import detect_prompt, detect_screen_prompt


def _opt_bytes(detected, oid):
    return detected.option_bytes[oid]


def test_screen_menu_maps_options_to_arrow_navigation():
    rows = [
        "Какую систему контроля версий использовать?",
        "❯ 1. git",
        "     Работать через git.",
        "  2. hg (Mercurial)",
        "  3. Type something.",
        "",
        "Enter to select · ↑/↓ to navigate · Esc to cancel",
    ]
    d = detect_screen_prompt(rows)
    assert d is not None
    assert d.kind == "singleSelect"
    assert d.prompt == "Какую систему контроля версий использовать?"
    assert [o.id for o in d.options] == ["option_1", "option_2", "option_3"]
    # selection sits on option 1, so navigate down N steps then Enter
    assert d.option_bytes["option_1"] == b"\r"
    assert d.option_bytes["option_2"] == b"\x1b[B\r"
    assert d.option_bytes["option_3"] == b"\x1b[B\x1b[B\r"


def test_screen_menu_requires_navigation_footer():
    # A plain numbered list without the select-footer must not be a menu.
    rows = ["Steps:", "1. build the thing", "2. ship the thing", "done"]
    assert detect_screen_prompt(rows) is None


def test_yes_no_default_no():
    d = detect_prompt("Allow Claude to run npm test? [y/N] ", ended_with_newline=False)
    assert d is not None
    assert d.kind == "approval"
    assert d.default == "no"
    ids = [o.id for o in d.options]
    assert ids == ["approve", "reject"]
    assert _opt_bytes(d, "approve") == b"y\n"
    assert _opt_bytes(d, "reject") == b"n\n"


def test_yes_no_default_yes_capital_y():
    d = detect_prompt("Overwrite existing file? [Y/n] ", ended_with_newline=False)
    assert d is not None and d.kind == "approval"
    assert d.default == "yes"


def test_yes_no_words_and_parens():
    d = detect_prompt("Proceed with deploy? (yes/no) ", ended_with_newline=False)
    assert d is not None and d.kind == "approval"
    assert d.default is None  # neither side capitalised


def test_yes_no_with_always_adds_session_option():
    d = detect_prompt(
        "Run this command and don't ask again? [y/N] ",
        ended_with_newline=False,
    )
    assert d is not None
    ids = [o.id for o in d.options]
    assert ids == ["approve", "approve_session", "reject"]
    assert _opt_bytes(d, "approve_session") == b"y\n"


def test_numbered_menu_single_select():
    tail = (
        "How would you like to proceed?\n"
        "1) Yes\n"
        "2) Yes, and don't ask again\n"
        "3) No, tell me what to do\n"
        "> "
    )
    d = detect_prompt(tail, ended_with_newline=False)
    assert d is not None
    assert d.kind == "singleSelect"
    assert [o.id for o in d.options] == ["option_1", "option_2", "option_3"]
    assert _opt_bytes(d, "option_2") == b"2\n"


def test_generic_text_question():
    d = detect_prompt("What is your name? ", ended_with_newline=False)
    assert d is not None
    assert d.kind == "text"
    assert d.allows_text is True
    assert d.options == []


def test_ended_with_newline_returns_none():
    # A trailing newline means the CLI is not parked waiting for input.
    assert detect_prompt("Allow this? [y/N]\n", ended_with_newline=True) is None


def test_plain_output_is_not_a_prompt():
    assert detect_prompt("Compiling project...\ndone", ended_with_newline=False) is None
