# Steve Jobs, for Claude Code and Codex

**Retired on 8 November 2026.** This version didn't work the way we wanted, so it's no longer offered. Steve is being rethought from scratch.

## If you installed it

The installer printed the line that removes it. If you don't have that line, these are the usual ones.

macOS and Linux:

```sh
node ~/.conscious/app/bin/conscious.mjs uninstall --all
```

If there's no `node` on the machine, the installer brought its own:

```sh
~/.conscious/node/bin/node ~/.conscious/app/bin/conscious.mjs uninstall --all
```

Windows, in PowerShell:

```powershell
node "$env:USERPROFILE\.conscious\app\bin\conscious.mjs" uninstall --all
```

If there's no `node` on the machine, the installer brought its own:

```powershell
& "$env:USERPROFILE\.conscious\node\node.exe" "$env:USERPROFILE\.conscious\app\bin\conscious.mjs" uninstall; Remove-Item -LiteralPath "$env:USERPROFILE\.conscious" -Recurse -Force
```

It takes the hooks out of Claude Code and Codex, puts back Claude Code's own style and Codex's own instructions, and deletes the `.conscious` folder. Then quit and reopen your agent and start a new chat. If you installed it somewhere else with `CONSCIOUS_HOME`, use that folder in place of `.conscious`.

The retired version is kept at the tag `v1-retired`.
