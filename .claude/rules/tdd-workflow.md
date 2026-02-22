---
description: Enforces test-driven development — tests must be written before implementation
globs: "**/*.ts"
---

# TDD Workflow Rule

Every new feature or bug fix MUST follow Red-Green-Refactor:

## 1. Red — Write Failing Tests First
- Write test cases that describe the expected behavior BEFORE writing implementation
- Tests must fail initially (proving they test something real)
- Cover happy path, error cases, and edge cases

## 2. Green — Write Minimal Implementation
- Write just enough code to make the tests pass
- Do not add functionality that isn't covered by a test
- Run `bun test` after every change to confirm green

## 3. Refactor — Clean Up
- Improve code structure while keeping tests green
- Extract shared logic, improve naming, reduce duplication
- Run `bun test` again to confirm nothing broke

## Checklist (enforce on every change)
- [ ] Tests written first (or simultaneously for trivial changes)
- [ ] All tests passing (`bun test`)
- [ ] No untested code paths added
- [ ] Type check passes (`bun run typecheck`)

## Test file locations
- Server: `src/__tests__/` and `src/**/__tests__/`
- Client: `client/__tests__/`
- Test files: `*.test.ts` in `__tests__/` directories adjacent to source
