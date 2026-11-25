# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Code Comments in English

**All code comments MUST be written in English.**

- Applies to inline comments, block comments, JSDoc/TSDoc, and TODO/FIXME notes.
- Never write comments in Vietnamese or any other language, even if the conversation is in Vietnamese.
- User-facing strings (UI text, i18n content) are not comments and keep their original language.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# DreamWay LMS

## Document API

The API specification lives in `docs/features/api/`. Before starting a phase:

1. Read `docs/features/api/conventions.md` (authentication, authorization, errors, pagination, `Idempotency-Key`).
2. Read the file for the phase being worked on, e.g. `docs/features/api/phase-0-nen-tang.md`.
3. Look up endpoints quickly in `docs/features/api/endpoints.md`.

Implementation rules:

- Only implement endpoints of the assigned phase; do not build endpoints from later phases ahead of time.
- Every `code` in the "Quy tắc nghiệp vụ và mã lỗi" (business rules and error codes) table must have a test.
- Every item under "Xong phase khi" (phase is done when) must have an automated test or a manual test scenario documented in the PR.
- Items marked _(đề xuất)_ (proposed) or "chờ business chốt" (awaiting business confirmation): ask before coding, do not decide on your own.
- After finishing a phase, stop for review; do not move on to the next phase by yourself.
