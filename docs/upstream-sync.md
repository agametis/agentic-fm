# Upstream Sync Guide

This repository is maintained with three remotes so it can follow the original project, your PR-capable fork, and your private experimental repo at the same time.

## Repository conventions

- `origin` is your PR-capable fork: `https://github.com/agametis/agentic-fm.git`.
- `experimental` is your private repo: `https://github.com/agametis/agentic-fm-with-duckdb-tools.git`.
- `upstream` is `https://github.com/petrowsky/agentic-fm.git`.
- `main` should stay clean and track `origin/main`.
- `feature/...` branches are for work that may become pull requests.
- `exp/...` or `duckdb/...` branches are for private-only work and should be pushed to `experimental`.

## One-time setup

If the remotes are not configured yet, use this layout:

```bash
git remote add origin https://github.com/agametis/agentic-fm.git
git remote add experimental https://github.com/agametis/agentic-fm-with-duckdb-tools.git
git remote add upstream https://github.com/petrowsky/agentic-fm.git
git fetch origin
git fetch experimental
git fetch upstream
git branch --set-upstream-to=origin/main main
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

After a successful rebase, push the updated `main` to your fork:

```bash
git push --force-with-lease origin main
```

## Conflict handling expectations

- Resolve conflicts on `main`, never on `upstream/main`.
- Never push to `upstream`.
- Keep PR-capable work on `feature/...` branches that push to `origin`.
- Keep private-only work on `exp/...` branches that push to `experimental`.
- Do not leave experimental-only commits on `main`.

## Recommended aliases

```bash
git config alias.lg "log --oneline --decorate --graph --all"
git config alias.upcheck "!git fetch upstream && git rev-list --left-right --count main...upstream/main"
```

## Using a branch from your fork that is not in `main`

This local clone can use any branch from `origin`, even if that branch is not merged into `main`.

```bash
git fetch --all --prune
git switch --track origin/feature/my-branch
```

If you want to extend that branch privately without affecting the PR branch:

```bash
git switch -c exp/my-branch-private
git push -u experimental exp/my-branch-private
```

## Recommended immediate cleanup for this clone

Current repo state:
- `main` tracks `origin/main`
- `main` is currently aligned with `origin/main`

No branch cleanup is needed right now.

If `main` ever becomes ahead of `origin/main` because private experimental commits were created directly on `main`, use this cleanup:

```bash
git checkout main
git branch exp/current-main
git checkout exp/current-main
git push -u experimental exp/current-main
git checkout main
git reset --hard origin/main
```

## Verification after each sync

```bash
git lg
git diff --stat upstream/main...main
git status
```

Use `git push --force-with-lease` after rebases. Do not use plain `--force`.
