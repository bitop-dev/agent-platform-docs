---
name: github
version: 0.1.0
description: "GitHub operations via `gh` CLI: issues, PRs, CI runs, code review, API queries. Use when: checking PR status or CI, creating/commenting on issues, listing/filtering PRs or issues. NOT for: local git operations (use bash + git), non-GitHub repos (use gitlab skill), or cloning repos (use bash + git clone)."
author: platform-team
tags: [code, vcs, github]
emoji: 🐙
always: false

requires:
  bins: [gh]

install:
  - id: brew
    kind: brew
    formula: gh
    label: "Install GitHub CLI (brew)"
  - id: shell-linux
    kind: shell
    command: |
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
      sudo apt update && sudo apt install gh -y
    os: [linux]
    label: "Install GitHub CLI (apt)"
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub repositories, issues, pull requests, and CI.

## Setup

The `gh` CLI must be installed and authenticated:
```bash
gh auth login
```

## When to Use

✅ **USE this skill when:**
- Checking PR status, reviews, or merge readiness
- Viewing CI/workflow run status and logs
- Creating, closing, or commenting on issues
- Creating or reviewing pull requests
- Querying GitHub API for repository data
- Listing repos, releases, or collaborators

❌ **DON'T use this skill when:**
- Local git operations (commit, push, pull, branch) → use `bash` + `git`
- Non-GitHub repos (GitLab, Bitbucket) → use `gitlab` skill or bash
- Cloning repositories → use `bash` + `git clone`
- Reading local file contents → use `read_file`

## Common Commands

### Issues
```bash
gh issue list --repo owner/repo --state open --json number,title,assignees,labels
gh issue view 142 --repo owner/repo --json title,body,comments
gh issue create --repo owner/repo --title "Bug: ..." --body "..."
gh issue close 142 --repo owner/repo
```

### Pull Requests
```bash
gh pr list --repo owner/repo --state open --json number,title,author,reviewDecision
gh pr view 99 --repo owner/repo --json title,body,reviews,statusCheckRollup
gh pr checks 99 --repo owner/repo
gh pr create --repo owner/repo --title "feat: ..." --body "..."
gh pr merge 99 --repo owner/repo --squash
```

### CI / Actions
```bash
gh run list --repo owner/repo --limit 10 --json status,conclusion,name,headBranch
gh run view 12345 --repo owner/repo --log
```

### API (for anything not covered above)
```bash
gh api repos/owner/repo/releases --jq '.[0].tag_name'
gh api graphql -f query='{ repository(owner:"owner", name:"repo") { stargazerCount } }'
```

## Tips

1. **Always use `--json` output** — it's structured and easier to parse than the default table format
2. **Use `--jq` for filtering** — `gh issue list --json number,title --jq '.[] | select(.labels[].name == "bug")'`
3. **Specify `--repo`** — Don't rely on being in the right directory. Always pass `--repo owner/repo`
4. **Check auth first** — If `gh` commands fail, the user may need to run `gh auth login`
