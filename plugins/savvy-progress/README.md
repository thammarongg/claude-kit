# savvy-progress

A Claude Code mod: a progress bar above the prompt and a live panel of subagents. Made for the [savvy-flow](../savvy-flow) skill, and useful with any subagents.

- **Progress bar**: the flow's title, phase, accepted tasks out of planned, and a button with the crew size that opens the panel. It appears once something reports progress (savvy-flow does) or a `savvy-*` worker starts.
- **Agents panel** (`/agents-info` toggles it): running, finished and planned subagents with model, effort, task progress, context, estimated cost and time. Working crabs walk, and each savvy tier animates its prop: the astronaut floats, the detective sweeps the magnifier, the engineer turns the wrench, the chef tosses the omelette, the racer runs with a fluttering flag, the poet (sonnet) waves a quill and the sprout (haiku) scurries. `prefers-reduced-motion` stops them.

## Tools it adds

- `mcp__savvy-progress__progress`: the orchestrator reports the plan, phase and accepted tasks. Only the main session can: a call from a subagent is ignored, so a worker cannot rename, finish or reset the flow.
- `mcp__savvy-progress__step`: a worker reports its own steps (`done`, `total`, `note`). A worker that does not report shows the tool it last asked for in that place (`Read register.tsx`, `Bash Run the unit tests`, `Grep costOf +2`), and its context fill in grey as the bar. Only a tool's name and one telling argument are shown: a file's name without its path, a command's description or else its program, a URL's host.

Cost is a rough estimate from token counts and a built-in per-model price table (`PRICES` in `hooks/register.tsx`, list prices as of 2026-10-10), not a bill. Cache writes are priced at the 1-hour rate, which is what Claude Code writes on a subscription; a session that writes 5-minute entries is overestimated there.

## Settings

`language`: `auto` (default), `en`, `th` or `ru`. `auto` follows Claude Code's `language` setting, then the system locale, and falls back to English. Set it in `/config`, or, for a mod loaded by hand, in `~/.claude/settings.json`:

```json
{ "pluginConfigs": { "savvy-progress": { "options": { "language": "ru" } } } }
```

`theme`: `auto` (default), `light` or `dark`. The panel and the bar are drawn as images, which cannot ask the page how it looks: `auto` follows Claude Code's own `theme` setting and repaints when you change it, and falls back to the system's light or dark preference when that setting names neither. Set `light` or `dark` here if the drawings ever disagree with the app.

`notify`: `toast` (default), `native` or `off`. When a flow finishes, and when a subagent ends in an error or a refusal, the mod says so in a toast: `Ship the thing: Done · 3/3 · ≈$0.42 · 5:10`. `native` also sends it through your own notification channel (Claude Code's `preferredNotifChannel`), for when the window is not in front; `off` stays quiet. A subagent you interrupt yourself is not announced.

Install instructions are in the [repository README](../../README.md).
