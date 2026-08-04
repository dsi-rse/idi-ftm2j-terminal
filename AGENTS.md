# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Web app architecture — read before editing `web/`

`web/src/` has codified architectural conventions in
[.claude/ARCHITECTURE.md](.claude/ARCHITECTURE.md). **Read it before writing,
moving, or adding any file under `web/src/`, and follow it.**

Note the path: it lives in `.claude/`, not the repo root. Do not conclude the
project has no conventions just because there is no top-level
`ARCHITECTURE.md` — that mistake has already been made.

The doc is normative, not descriptive. In its own words: *"When a rule and the
code disagree, the rule is the target — bring the code back rather than the
doc."* So a violation you find in existing code is a bug to be fixed or filed,
not a precedent to copy.

Read it in full before adding a folder, a hook, or your first component. The
rules that break most often all follow from imports flowing strictly downward:

- A file in `components/` must not import from another file in `components/`.
- A file in `blocks/` must not import from another file in `blocks/`.
- A file in `domains/a/` must not import from `domains/b/`.

When two peers need the same logic, it moves **down** a layer (`lib/`, `hooks/`,
`types/`) — never sideways. A hook or helper starts inside its domain and is
promoted to top level only once a caller from another layer actually exists.

Also load-bearing, and easy to violate without noticing: every class string goes
through `cn()`, colors come from semantic tokens rather than hex, exports are
named (no `export default` outside the files Next requires), and the site is
fully static — there is no server runtime and no request-time fetching.

The doc's **Verification** section has grep commands that confirm the codebase
still complies. Run them after any structural change.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
