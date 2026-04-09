## Upstream sync workflow
 
The repository maintenance workflow is also documented in [docs/upstream-sync.md](docs/upstream-sync.md).
 
This repository now uses three remotes:
 
- `origin` = your fork for PR-capable work: `https://github.com/agametis/agentic-fm.git`
- `experimental` = your private custom repo: `https://github.com/agametis/agentic-fm-with-duckdb-tools.git`
- `upstream` = the original repository: `https://github.com/petrowsky/agentic-fm.git`
 
## Core rules
 
- Never push to `upstream`.
- Treat `origin` as the base for normal development in this local clone.
- Treat `experimental` as the destination for private-only branches and integrations.
- Keep `main` clean and aligned with `origin/main`.
- Do not put private DuckDB-only work directly on `main`.
 
## Branch model
 
- `main` = clean branch that tracks `origin/main`
- `feature/...` = work that may become a PR through your fork
- `exp/...` or `duckdb/...` = private-only branches that should be pushed to `experimental`
 
This means:
 
- PR-preparation work lives on branches from `origin`
- private follow-up work can start from those same branches, but should be pushed to `experimental`
 
## Normal daily usage
 
Start from `main` when you want the clean base from your fork:
 
```bash
git checkout main
git pull --ff-only origin main
```
 
Create a branch for work that may later be proposed upstream:
 
```bash
git checkout -b feature/my-change
git push -u origin feature/my-change
```
 
Create a branch for private-only work:
 
```bash
git checkout -b exp/my-private-change
git push -u experimental exp/my-private-change
```
 
## Using branches from your fork that are not in `main`
 
This local clone can use any branch from your fork even if that branch is not merged into `main`.
 
Fetch everything first:
 
```bash
git fetch --all --prune
```
 
Check out a branch from your fork and track it locally:
 
```bash
git switch -c feature/parser-fix origin/feature/parser-fix
```
 
If you want to build private-only work on top of that branch:
 
```bash
git switch -c exp/parser-fix-duckdb
git push -u experimental exp/parser-fix-duckdb
```
 
That gives you this separation:
 
- `origin/feature/parser-fix` = PR-capable branch in your fork
- `experimental/exp/parser-fix-duckdb` = private branch extending it
 
## Syncing changes from the original repository
 
Use `upstream` only as the source of incoming original-project updates.
 
Fetch the original repository:
 
```bash
git fetch upstream
```
 
Review what changed:
 
```bash
git log --oneline --decorate --graph main upstream/main -20
git diff --stat main...upstream/main
```
 
If you want your fork's `main` to incorporate the newest upstream state, update `main` and then publish it to your fork:
 
```bash
git checkout main
git rebase upstream/main
git push --force-with-lease origin main
```
 
If conflicts happen:
 
```bash
git status
git add <resolved-files>
git rebase --continue
```
 
Abort if needed:
 
```bash
git rebase --abort
```
 
## Private integration workflow
 
If you want to combine your fork branch with private customizations, use a new private branch instead of changing `main`:
 
```bash
git checkout main
git checkout -b exp/integration-test
git merge origin/feature/branch-a
git merge origin/feature/branch-b
git push -u experimental exp/integration-test
```
 
If you only want selected commits, use `git cherry-pick`.
 
## Recommended aliases
 
```bash
git config alias.lg "log --oneline --decorate --graph --all"
git config alias.upcheck "!git fetch upstream && git rev-list --left-right --count main...upstream/main"
```
 
These aliases are local Git config, not repository files. Recreate them on each machine if needed.
 
## Immediate next steps for this clone
 
Current repo state:
 
- `main` tracks `origin/main`
- `main` is currently aligned with `origin/main`
 
No branch cleanup is needed right now.
 
If `main` ever becomes ahead of `origin/main` because private experimental commits were created directly on `main`, move them off `main` like this:
 
1. Save the current local `main` state into a private branch.
2. Push that branch to `experimental`.
3. Reset `main` to exactly `origin/main`.
 
Commands:
 
```bash
git checkout main
git branch exp/current-main
git checkout exp/current-main
git push -u experimental exp/current-main
git checkout main
git reset --hard origin/main
```
 
After that cleanup:
 
- `main` becomes your clean fork-based branch
- `exp/current-main` preserves the previous experimental state
- future private work should continue on `exp/...` branches, not on `main`
 
## Quick checks
 
Verify remote wiring:
 
```bash
git remote -v
git branch -vv
```
 
Interpret `git upcheck` like this:
 
- `2 0` = your `main` is 2 commits ahead, upstream has no newer commits
- `2 3` = your `main` is 2 commits ahead, upstream has 3 newer commits
- `0 5` = upstream has 5 newer commits and you have nothing on top
 
## Prepare the FileMaker data Python environment and download the FileMaker documentation.
 
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install requests beautifulsoup4
python agent/docs/filemaker/fetch_docs.py
```
 
## Download only parts of the FileMaker documentation
 
```bash
python agent/docs/filemaker/fetch_docs.py --steps
python agent/docs/filemaker/fetch_docs.py --functions
python agent/docs/filemaker/fetch_docs.py --errors
```
 
## MBS Shell
 
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install requests beautifulsoup4
python agent/docs/mbs/fetch_docs.py
# or
python fetch_docs.py --functions
python fetch_docs.py --force
```
