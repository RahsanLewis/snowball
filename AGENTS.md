# Snowball Agent Instructions

## Shared instructions

Follow the universal instructions in `~/.codex/AGENTS.md` together with this file. Codex loads global instructions before project instructions when using the default Codex home. If `CODEX_HOME` is set, the shared file belongs in that directory instead.

This file adds Snowball-specific requirements and does not weaken the shared safeguards. If the shared instructions are unavailable, stop before changing project state and ask the developer to make them available.

## Snowball README Maintenance

- Review `README.md` for accuracy with every proposed change set so it stays current with each developer-created commit.
- Include necessary README edits in the proposed approval scope when changes affect features, behavior, setup, dependencies, configuration, usage, project structure, or limitations. Obtain expanded approval before adding README edits to an already-approved scope that did not include them.
- Update the affected sections to describe the actual implementation; do not present planned capabilities as existing features.
- If no README update is needed, state that in the change summary.
- This rule does not authorize automatic rewrites, Git hooks, commits, or changes outside the approved scope. Preserve all existing approval and review gates and Git restrictions.
