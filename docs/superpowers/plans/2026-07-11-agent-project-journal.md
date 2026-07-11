# Agent Project Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Codex and Claude Code one shared instruction source and maintain two presentation-ready records of every meaningful development increment.

**Architecture:** Root-level `AGENTS.md` is the canonical team guidance and root-level `CLAUDE.md` imports it. `docs/PROGRESS.md` is an append-only chronological journal, while `docs/FINAL_IMPLEMENTATION.md` is a continuously refreshed snapshot of the verified product state.

**Tech Stack:** Markdown, Codex `AGENTS.md`, Claude Code `CLAUDE.md` imports, Git.

---

### Task 1: Shared agent instructions

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

- [x] **Step 1: Add the canonical instructions**

Create `AGENTS.md` with the hackathon context, the purpose of both project documents, their update rules, and the completion gate requiring both documents to be current before committing a meaningful increment.

- [x] **Step 2: Add the Claude adapter**

Create `CLAUDE.md` containing `@AGENTS.md`, so Claude Code loads the same instructions without duplicated rules.

- [x] **Step 3: Verify instruction wiring**

Run: `test "$(cat CLAUDE.md)" = '@AGENTS.md'`

Expected: exit code 0.

### Task 2: Presentation source documents

**Files:**
- Create: `docs/PROGRESS.md`
- Create: `docs/FINAL_IMPLEMENTATION.md`

- [x] **Step 1: Initialize the chronological progress journal**

Create `docs/PROGRESS.md` with append-only rules, a reusable increment template, and an initial entry covering the repository purpose, the existing Expo Go environment design, and creation of the shared documentation process.

- [x] **Step 2: Initialize the current implementation snapshot**

Create `docs/FINAL_IMPLEMENTATION.md` with sections for product purpose, value, users, implemented capabilities, architecture and stack, verified state, limitations, demo scenario, and next steps. Keep planned work explicitly separate from implemented work.

- [x] **Step 3: Verify document structure and formatting**

Run: `git diff --check`

Expected: exit code 0.

Run: `rg -n "PROGRESS.md|FINAL_IMPLEMENTATION.md" AGENTS.md`

Expected: both document paths appear in the completion rules.

- [x] **Step 4: Review and commit**

Review the complete diff, stage only `AGENTS.md`, `CLAUDE.md`, `docs/PROGRESS.md`, `docs/FINAL_IMPLEMENTATION.md`, and this plan, then commit with a concise message.
