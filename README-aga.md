## Upstream sync workflow

The repository maintenance workflow is documented in [docs/upstream-sync.md](docs/upstream-sync.md).

This repository uses two remotes:

- `upstream` = the original repository `petrowsky/agentic-fm`
- `origin` = your private repository `agametis/agentic-fm-with-duckdb-tools`

Your normal rule is:

- never push to `upstream`
- always fetch changes from `upstream`
- always publish your integrated result to `origin`

Recommended aliases:

```bash
git config alias.lg "log --oneline --decorate --graph --all"
git config alias.upsync "!git fetch upstream && git checkout main && git rebase upstream/main"
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
- `upstream/main` is only the source for incoming updates from the original project.
- After every successful upstream integration, `origin/main` becomes your new canonical version.
- Use `--force-with-lease` after rebasing. Do not use plain `--force`.
- If you want to inspect what changed before pushing, run `git lg` or `git diff --stat upstream/main...main`.

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
