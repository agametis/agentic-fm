## Upstream sync workflow

The repository maintenance workflow is documented in [docs/upstream-sync.md](docs/upstream-sync.md).

This repository uses two remotes:

- `upstream` = the original repository `petrowsky/agentic-fm`
- `origin` = your private repository `agametis/agentic-fm-with-duckdb-tools`

Your normal rule is:

- never push to `upstream`
- always fetch changes from `upstream`
- always publish your integrated result to `origin`

The one-time upstream-base reconciliation has already been completed in this repository. That means your `main` branch is now the normal working branch and is already based on the restored upstream history plus your custom changes.

Recommended aliases:

```bash
git config alias.lg "log --oneline --decorate --graph --all"
git config alias.upsync "!git fetch upstream && git checkout main && git rebase upstream/main"
git config alias.upcheck "!git fetch upstream && git rev-list --left-right --count main...upstream/main"
```

These are Git aliases created with `git config`. They are not stored automatically in the repository. They live in your Git configuration on the current computer.

If you set them without `--global`, they are stored only for this repository.
If you set them with `--global`, they are available in all repositories on that computer.

To recreate the same aliases on another computer, run the same commands again inside the repository:

```bash
git config alias.lg "log --oneline --decorate --graph --all"
git config alias.upsync "!git fetch upstream && git checkout main && git rebase upstream/main"
git config alias.upcheck "!git fetch upstream && git rev-list --left-right --count main...upstream/main"
```

### When the original repo has new updates

1. Fetch the newest changes from the original repository:

```bash
git fetch upstream
```

2. Switch to your maintained branch:

```bash
git checkout main
```

3. Rebase your private work on top of the newest original code:

```bash
git rebase upstream/main
```

4. If git reports conflicts:

```bash
git status
git add <resolved-files>
git rebase --continue
```

If the rebase goes wrong, stop and return to the pre-rebase state:

```bash
git rebase --abort
```

5. After the rebase succeeds, run a quick smoke check:

```bash
npm run duckdb:session:status
```

6. Push the updated integrated branch to your private repository:

```bash
git push --force-with-lease origin main
```

### Important notes

- `main` is your working branch and should always contain your version of the project.
- Stay on `main` for normal day-to-day work.
- Only create a temporary branch from `main` if you want to isolate a new feature or risky change before merging it back.
- `upstream/main` is only the source for incoming updates from the original project.
- After every successful upstream integration, `origin/main` becomes your new canonical version.
- Use `--force-with-lease` after rebasing. Do not use plain `--force`.
- If you want to inspect what changed before pushing, run `git lg` or `git diff --stat upstream/main...main`.

### Normal branch usage

For normal work, stay on `main`:

```bash
git checkout main
```

If you want to do isolated work, branch from `main` and merge or rebase it back later:

```bash
git checkout -b my-feature
# work and commit
git checkout main
git merge my-feature
git branch -d my-feature
```

### Quick upstream check

To see whether the original repository has moved ahead of your `main` branch:

```bash
git upcheck
```

Interpretation:

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
