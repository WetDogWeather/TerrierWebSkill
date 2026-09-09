# Terrier radar skill

This is an **Agent Skill** that teaches Cursor, Claude, or any other Agent Skills–compatible client how to scaffold a Wet Dog Weather Terrier weather app. You do not run this folder yourself. You point an agent at it, then ask it to build the app.

The generated app is a full-screen CONUS MapLibre viewer with a HUD that switches **Radar**, **Temperature**, and **Wind UV**, plus a bottom time scrubber. The agent fills in Vite, React, MapLibre, WASM loading, and layer recipes without asking you for stack, toolkit, or UI details.

Official Terrier docs: [@wetdogweather/terrier](https://www.npmjs.com/package/@wetdogweather/terrier) and [TerrierWeb](https://github.com/WetDogWeather/TerrierWeb).

## What is in this folder

| File | Who reads it | Purpose |
| --- | --- | --- |
| `SKILL.md` | The agent | Defaults, file layout, and scaffold steps |
| `reference.md` | The agent | Copy-paste Vite/WASM config and layer recipes |
| `README.md` | You | How to install and invoke the skill |

Cursor, Claude Code, or other clients that follow the [Agent Skills](https://agentskills.io) standard discover a skill when they find a folder that contains `SKILL.md`.

## What the agent will build

When the skill runs in an empty project, the agent creates:

- Vite 5 + React 18 + MapLibre 5 + `@wetdogweather/terrier`
- OpenFreeMap Liberty basemap, CONUS view
- HUD tabs: Radar / Temperature / Wind UV (one layer at a time)
- Titles from the **actual** started source level (`MRMS Reflectivity`, `2 m Temperature`, `10 m Wind UV`, or whatever the stack selected)
- Play/Pause + time slider
- `.env.example` with `VITE_TERRIER_STACK=dev` and `VITE_TERRIER_API_KEY=`

If a map app already exists, the skill tells the agent to add the Terrier overlay in place instead of replacing the host map.

The agent will **not** copy API keys from TerrierWeb examples, and it will **not** prompt you for map toolkit, framework, layer, or credentials.

## Use with Cursor

This skill already lives at `.cursor/skills/terrier-radar/`, so Cursor Agent picks it up when you open this repo.

1. Open the project in Cursor.
2. Start an **Agent** chat (not Ask).
3. Invoke the skill in any of these ways:
   - Type `/terrier-radar` and send it, then ask to build the app.
   - Type `@` and attach **terrier-radar**.
   - Just say `build Terrier app` — the description is written so Agent can choose this skill on its own.
4. When Vite starts, open the URL in **Chrome or Safari**. Do not use Cursor Simple Browser; WebGL will fail there.

Optional: open **Customize → Skills** in the Cursor sidebar to confirm `terrier-radar` is listed.

To keep the skill on for a whole session, invoke it as a Custom Mode with Option+Enter (Mac) or Alt+Enter (Windows).

### Make it available in every Cursor project

Copy or symlink the folder to your user skills directory:

```bash
mkdir -p ~/.cursor/skills
cp -R .cursor/skills/terrier-radar ~/.cursor/skills/terrier-radar
```

Personal skills stay on this machine unless you turn on **Sync Skills for Cloud Agents** in Settings → Agents.

## Use with Claude Code (Claude)

Claude Code looks for project skills in `.claude/skills/`, not `.cursor/skills/`. Cursor also loads `.claude/skills/`, so that path works in Cursor, Claude, or any client that reads the Claude skills directory.

### Option A — copy or symlink next to this repo (recommended if you use more than one agent)

From the repository root:

```bash
mkdir -p .claude/skills
ln -s ../../.cursor/skills/terrier-radar .claude/skills/terrier-radar
```

Or copy instead of symlink:

```bash
mkdir -p .claude/skills
cp -R .cursor/skills/terrier-radar .claude/skills/terrier-radar
```

Then, in a terminal in this repo:

```bash
claude
```

Invoke it:

```text
/terrier-radar
```

Or ask in plain language:

```text
Build a Terrier weather app
```

### Option B — personal Claude Code skill (every project on this machine)

```bash
mkdir -p ~/.claude/skills
cp -R .cursor/skills/terrier-radar ~/.claude/skills/terrier-radar
```

Personal Claude Code skills load in local sessions. They do **not** load in Cowork or cloud sessions unless you also commit the skill to `.claude/skills/` in the repo.

### Claude.ai / Cowork

Cloud and Cowork sessions do not read `~/.claude/skills/` on your laptop. Commit the skill under the project's `.claude/skills/terrier-radar/` (or enable it in claude.ai skill settings) so those sessions can see it.

## After the app is generated

1. Copy `.env.example` to `.env`.
2. Set `VITE_TERRIER_API_KEY` to your Boxer key. Leave `VITE_TERRIER_STACK=dev` unless you have another stack name.
3. Restart the dev server (`npm run dev`). Vite only reads env vars at startup.
4. Open `http://localhost:5173/` in Chrome or Safari with hardware acceleration on.

The basemap still loads without a key. Weather pixels need a real Boxer key.

If you change `vite.config.js`, delete `node_modules/.vite` and restart Vite so MapLibre and the WASM glue load from a clean cache.

## Example prompts

These all should trigger the skill once it is discoverable:

- `build Terrier app`
- `/terrier-radar`
- `Add Terrier radar, temperature, and wind UV to this map`
- `Scaffold a MapLibre Wet Dog Weather overlay`

You do not need to specify Vite, React, MapLibre, CONUS, or layer names. The skill already chose those defaults.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Cursor never uses the skill | Confirm the folder is `.cursor/skills/terrier-radar/SKILL.md` (or `.claude/skills/…`). Type `/terrier-radar` explicitly. |
| Claude Code says the skill was not found | Copy or symlink into `.claude/skills/terrier-radar/` and restart `claude`, or type `/add-dir` for that directory. |
| HUD stuck on `Waiting for overlay…` | Open Chrome/Safari, set `VITE_TERRIER_API_KEY`, restart Vite. |
| `_glfwInit` / `addEventListener` of undefined | The agent skipped the Vite WASM plugin or `public/` copy. Re-run the skill and tell it to follow `reference.md`. |
