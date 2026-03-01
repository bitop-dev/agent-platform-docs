---
name: gitlab
version: 0.1.0
description: "GitLab operations via `glab` CLI: issues, merge requests, pipelines, code review. Use when: checking MR status or pipelines, creating/commenting on issues, listing/filtering MRs. NOT for: local git operations (use bash + git), GitHub repos (use github skill), or cloning repos (use bash + git clone)."
author: platform-team
tags: [code, vcs, gitlab]
emoji: 🦊
always: false

requires:
  bins: [glab]

install:
  - id: brew
    kind: brew
    formula: glab
    label: "Install GitLab CLI (brew)"
  - id: shell-linux
    kind: shell
    command: "curl -s https://raw.githubusercontent.com/profclems/glab/trunk/scripts/install.sh | sudo sh"
    os: [linux]
    label: "Install GitLab CLI (script)"
---

# GitLab Skill

Use the `glab` CLI to interact with GitLab repositories, issues, merge requests, and pipelines.

## Setup

The `glab` CLI must be installed and authenticated:
```bash
glab auth login
```

## When to Use

✅ **USE this skill when:**
- Checking merge request status, reviews, or approvals
- Viewing pipeline status and job logs
- Creating, closing, or commenting on issues
- Creating or reviewing merge requests
- Querying GitLab API for project data

❌ **DON'T use this skill when:**
- Local git operations (commit, push, pull, branch) → use `bash` + `git`
- GitHub repos → use `github` skill
- Cloning repositories → use `bash` + `git clone`
- Reading local file contents → use `read_file`

## Common Commands

### Issues
```bash
glab issue list --repo owner/repo --state opened
glab issue view 42 --repo owner/repo
glab issue create --repo owner/repo --title "Bug: ..." --description "..."
glab issue close 42 --repo owner/repo
```

### Merge Requests
```bash
glab mr list --repo owner/repo --state opened
glab mr view 15 --repo owner/repo
glab mr create --repo owner/repo --title "feat: ..." --description "..."
glab mr approve 15 --repo owner/repo
glab mr merge 15 --repo owner/repo --squash
```

### Pipelines
```bash
glab pipeline list --repo owner/repo
glab pipeline view 789 --repo owner/repo
glab ci view --repo owner/repo
```

### API (for anything not covered above)
```bash
glab api projects/:id/releases --paginate
```

## Tips

1. **Use `--output json`** — Structured output is easier to parse
2. **Specify `--repo`** — Always pass the project path explicitly
3. **Check auth first** — If `glab` commands fail, run `glab auth login`
4. **GitLab vs GitHub terminology** — Merge Requests (not Pull Requests), Pipelines (not Actions)
