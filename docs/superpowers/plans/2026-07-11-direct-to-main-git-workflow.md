# Direct-to-Main Git Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define a fast, non-destructive direct-to-main Git workflow for hackathon development.

**Architecture:** `AGENTS.md` owns the executable repository workflow. `docs/PROGRESS.md` records the decision chronologically, and `docs/FINAL_IMPLEMENTATION.md` keeps the current development process available for the presentation.

**Tech Stack:** Markdown and Git.

---

### Task 1: Repository workflow rules

**Files:**
- Modify: `AGENTS.md`

- [x] **Step 1: Add direct-to-main policy**

Document that normal work happens directly on `main`, completed increments are pushed to `origin/main`, and branches or PRs are used only when explicitly requested.

- [x] **Step 2: Add rejected-push recovery**

Document `git pull --rebase origin main`, autonomous conflict resolution, `git rebase --continue`, repeated verification, and normal push retry.

- [x] **Step 3: Add safety boundaries**

Explicitly prohibit force-push, protect unknown local changes, and allow escalation only for genuinely ambiguous conflicts or material data-loss risk.

### Task 2: Presentation documentation

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `docs/FINAL_IMPLEMENTATION.md`

- [x] **Step 1: Append the workflow increment**

Add a dated append-only entry describing the direct-to-main decision, its recovery process, safety boundaries, and next step.

- [x] **Step 2: Refresh the implementation snapshot**

Add the confirmed Git workflow to the current development process without describing it as a product feature.

- [x] **Step 3: Verify the rules**

Run: `git diff --check`

Expected: exit code 0.

Run: `rg -n "direct-to-main|git pull --rebase origin main|force-push|git rebase --continue" AGENTS.md docs/PROGRESS.md docs/FINAL_IMPLEMENTATION.md`

Expected: the policy, recovery command, conflict continuation, and force-push prohibition are present.

- [x] **Step 4: Commit and push**

Stage only the plan and three modified files, commit to `main`, and push without force.
