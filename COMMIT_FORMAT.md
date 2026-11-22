# Commits and branches

## Commit message format

```
<type>(<scope>): <summary>

<body: what changed and why>

<footer: Closes #12>
```

- **summary**: imperative mood ("add", not "added"), at most 72 characters, no trailing period.
- **scope**: optional. One of `server`, `client`, `shared`, or a mode id such as `inbetween`.
- **body**: optional for trivial changes. Explain what and why, not how. Wrap at 72 characters.
- **footer**: optional. `Closes #N` closes the issue when the change reaches `main`.

## Types

| Type | Use for |
|---|---|
| `feat` | New behaviour players or developers can see |
| `fix` | A bug fix |
| `content` | Daily puzzles under `content/` |
| `docs` | Documentation only |
| `test` | Adding or fixing tests only |
| `refactor` | Code change with no behaviour change |
| `perf` | Faster or lighter, same behaviour |
| `chore` | Tooling, dependencies, config |

## Examples

Good:

```
feat(inbetween): count up the value as the marker slides
fix(server): ignore a second answer for the same prompt
content: add week 2 of daily themes
chore: bump vite to 8.4
```

Bad:

```
updated stuff             (no type, says nothing)
feat: Added new feature.  (past tense, vague, trailing period)
fix bug in reveal         (no colon after the type)
```

## Branches

One branch per change, off `main`:

```
<type>/<short-kebab-description>
```

Examples: `feat/leaderboard`, `fix/timer-drift`, `content/week-2`, `docs/deploy-guide`.

1. `git switch main && git pull`
2. `git switch -c feat/leaderboard`
3. Commit, push, open a pull request into `main`. The PR title uses the commit format.
4. Merge with **Squash and merge**, so each change is one commit on `main`. Delete the branch.
