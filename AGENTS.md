# Snowball Agent Instructions

## Shared instructions

Follow the universal instructions in `../AGENTS.md` (the developer's `Programming/AGENTS.md`, one folder above this repository) together with this file. It is the single shared instruction file for all agents: Claude Code loads it from the parent folder, and Codex reaches it through a pointer in `~/.codex/AGENTS.md`.

This file adds Snowball-specific requirements and does not weaken the shared safeguards. If the shared instructions are unavailable, stop before changing project state and ask the developer to make them available.

## Snowball README Maintenance

- Review `README.md` for accuracy with every proposed change set so it stays current with each commit.
- Include necessary README edits in the proposed approval scope when changes affect features, behavior, setup, dependencies, configuration, usage, project structure, or limitations. Obtain expanded approval before adding README edits to an already-approved scope that did not include them.
- Update the affected sections to describe the actual implementation; do not present planned capabilities as existing features.
- If no README update is needed, state that in the change summary.
- This rule does not authorize automatic rewrites, Git hooks, commits, or changes outside the approved scope. Preserve all existing approval and review gates and Git restrictions.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `RahsanLewis/snowball`, managed with the `gh` CLI; every write needs prior developer approval. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created only when needed. See `docs/agents/domain.md`.
