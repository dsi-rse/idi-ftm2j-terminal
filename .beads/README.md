# Beads - AI-Native Issue Tracking

Welcome to Beads! This repository uses **Beads** for issue tracking - a modern, AI-native tool designed to live directly in your codebase alongside your code.

## What is Beads?

Beads is issue tracking that lives in your repo, making it perfect for AI coding agents and developers who want their issues close to their code. No web UI required - everything works through the CLI and integrates seamlessly with git.

**Learn more:** [github.com/steveyegge/beads](https://github.com/steveyegge/beads)

## How this repo is set up

This section is specific to this repo; the rest of the file is the generic bd
README.

**There is no beads remote, on purpose.** The repo is public, and a Dolt
remote on it would make `bd dolt push` publish the issue database. Each
clone's issues live only in its local `.beads/embeddeddolt/`, so `bd dolt push`
is expected to fail with "no remote". Do not fix that by adding one.

**The workspace is bd 1.3, embedded mode.** It moved from bd 0.62 (Dolt
server mode) in November 2026; bd 1.3 will not open a 0.62 workspace. The
0.62 JSONL backup the 1.3 tracker was rebuilt from (142 issues) is kept off
the repo, on alice-duan's machine. Since there is no remote, that machine's
tracker is the only full copy of the issues.

### Setting up a clone

To get a tracker in a new clone, or in one still on bd 0.62:

1. Install bd 1.3 (`bd version`).
2. If the clone has a 0.62 tracker with issues you want to keep, export
   them with the 0.62 binary first. Then move the untracked 0.62 files
   (`.beads/dolt/`, `.beads/dolt-server.*`) out of `.beads/`.
3. Run `bd init --non-interactive`. It keeps the committed `metadata.json`.
4. **Undo the remote `bd init` adds.** It points a Dolt remote at the git
   origin, which is the public GitHub repo, and writes that URL into
   `config.yaml`:

   ```bash
   bd dolt remote remove origin
   git checkout -- .beads/config.yaml .gitignore
   bd dolt remote list   # should print "No remotes configured."
   ```

5. To get the shared issues, ask alice-duan for a fresh `bd export` and run
   `bd import <file>`. A 1.3 export imports as is. The raw 0.62 backup does
   not: 1.3 rejects its numeric `ephemeral` field.

## Quick Start

### Essential Commands

```bash
# Create new issues
bd create "Add user authentication"

# View all issues
bd list

# View issue details
bd show <issue-id>

# Update issue status
bd update <issue-id> --claim
bd update <issue-id> --status done

# Sync with Dolt remote
bd dolt push
```

### Working with Issues

Issues in Beads are:
- **Git-native**: Stored in Dolt database with version control and branching
- **AI-friendly**: CLI-first design works perfectly with AI coding agents
- **Branch-aware**: Issues can follow your branch workflow
- **Sync-ready**: Uses Dolt remotes for backup and team sharing

## Why Beads?

✨ **AI-Native Design**
- Built specifically for AI-assisted development workflows
- CLI-first interface works seamlessly with AI coding agents
- No context switching to web UIs

🚀 **Developer Focused**
- Issues live in your repo, right next to your code
- Works offline, syncs when you push
- Fast, lightweight, and stays out of your way

🔧 **Git Integration**
- Dolt-native sync via bd dolt push / bd dolt pull
- Branch-aware issue tracking
- Dolt-native three-way merge resolution

## Get Started with Beads

Try Beads in your own projects:

```bash
# Install Beads
curl -sSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash

# Initialize in your repo
bd init

# Create your first issue
bd create "Try out Beads"
```

## Learn More

- **Documentation**: [github.com/steveyegge/beads/docs](https://github.com/steveyegge/beads/tree/main/docs)
- **Quick Start Guide**: Run `bd quickstart`
- **Examples**: [github.com/steveyegge/beads/examples](https://github.com/steveyegge/beads/tree/main/examples)

---

*Beads: Issue tracking that moves at the speed of thought* ⚡
