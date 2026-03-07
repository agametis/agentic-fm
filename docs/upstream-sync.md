# Upstream Sync Guide

This repository is maintained as an independent custom repo that tracks the original `petrowsky/agentic-fm` project as `upstream`.

## Repository conventions

- `origin` is your own GitHub repository.
- `upstream` is `https://github.com/petrowsky/agentic-fm.git`.
- `main` is your maintained custom branch.
- `main-legacy` preserves the pre-migration custom history that did not share ancestry with upstream.
- `upstream/main` is read-only and only used as the rebase source.

## One-time setup

If `origin` is not configured yet, add your own repository URL:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

If `upstream` is missing, add it and fetch it:

```bash
git remote add upstream https://github.com/petrowsky/agentic-fm.git
git fetch upstream
```

Verify the wiring:

```bash
git remote -v
git branch -vv
git log --oneline --decorate --graph --max-count=20 --all
```

## Regular upstream update workflow

Fetch the latest changes from the original project:

```bash
git fetch upstream
```

Rebase your maintained branch onto the latest upstream branch:

```bash
git checkout main
git rebase upstream/main
```

If conflicts occur:

```bash
git status
git add <resolved-files>
git rebase --continue
```

If the rebase becomes wrong or too noisy:

```bash
git rebase --abort
```

After a successful rebase, run a smoke check and then push with lease protection:

```bash
npm run duckdb:session:status
git push --force-with-lease origin main
```

## Conflict handling expectations

- Resolve conflicts on `main`, never on `upstream/main`.
- Keep `main-legacy` untouched as a historical reference branch.
- Prefer preserving your custom behavior on `main` unless upstream introduces a clearly better replacement.
- When a large upstream change lands, compare against `main-legacy` if you need to recover older local intent.

## Recommended aliases

```bash
git config alias.lg "log --oneline --decorate --graph --all"
git config alias.upsync "!git fetch upstream && git checkout main && git rebase upstream/main"
```

## Verification after each sync

```bash
git lg
git diff --stat upstream/main...main
git status
```

Use `git push --force-with-lease` after rebases. Do not use plain `--force`.
