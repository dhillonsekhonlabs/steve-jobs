# Steve Jobs, in your coding agent

Switch him on, and the Claude Code or Codex you already use becomes Steve Jobs: how he thinks, what he cuts, what he won't ship, how he talks, down to the notes between steps. Your agent keeps every tool it has and everything it knows about you and your work. Switch him off, and it's your own agent again from the next message.

**The easy way:** give your Claude Code or Codex this page's link and say *install this*. It installs everything, then tells you how to use it. To do it yourself, see *Install*.

## For agents installing this

You're installing this for the person you work with. Do all of it yourself, end to end, then tell them how to use it.

1. **Say what's about to happen, in one line:** you'll run Conscious's installer, which puts Steve in `~/.conscious` and adds hooks to their Claude Code and Codex settings, and you'll ask before running it.
2. **Run the one line for their system, exactly as written.** Don't clone this repository, build anything or edit settings files by hand. The installer does all of it, and running it again is safe. If they asked for a particular folder, set `CONSCIOUS_HOME` to it for the command.

   macOS or Linux:
   ```
   curl -fsSL https://raw.githubusercontent.com/dhillonsekhonlabs/steve-jobs/main/install.sh | sh
   ```
   Windows, from any shell:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/dhillonsekhonlabs/steve-jobs/main/install.ps1 | iex"
   ```
   It needs the network, and it writes outside the project (`~/.conscious`, `~/.claude/settings.json`, `~/.codex/hooks.json`), so ask for that approval. If your permissions refuse it, as Claude Code's auto mode can when a command changes its own settings, give them the line to paste into their own terminal and go on to step 4.
3. **Read the output.** Success lists `Claude Code: in ...` or `Codex: in ...`, and ends with the line that removes it. A line starting `conscious:` means it stopped and says why; fix that, for example a missing Claude Code or Codex, and run it again.
4. **Tell them how to use it,** in a few plain lines:
   - Quit and reopen Claude Code or Codex. The hooks load when a session starts, so this session doesn't have Steve.
   - In Codex, trust the new hooks once: `/hooks` in the CLI, or Settings > Hooks in the app. Only they can do that.
   - Type `steve on`, and their next message goes to Steve. `steve off` brings their own agent back. Both are instant, and each conversation has its own switch.
   - To update, run the install line again. To remove it, use the removal line the installer printed; give it to them as it was printed.

## Install

**macOS and Linux**

```
curl -fsSL https://raw.githubusercontent.com/dhillonsekhonlabs/steve-jobs/main/install.sh | sh
```

**Windows**, in PowerShell

```
irm https://raw.githubusercontent.com/dhillonsekhonlabs/steve-jobs/main/install.ps1 | iex
```

It goes into Claude Code and Codex, whichever you have: Claude Code in the terminal, the desktop app or VS Code, and the Codex CLI or app. It uses your Node if you have version 18 or newer. If you don't, it brings its own Node from nodejs.org, checked against Node's published checksum.

**Codex:** Codex runs a new hook only once you trust it. Type `/hooks` in the Codex CLI, or open Settings > Hooks in the app, and trust the Conscious hooks.

## Use

Start a new session and type

```
steve on
```

Your next message goes to Steve. To bring your own agent back:

```
steve off
```

Both take effect at once, and nothing goes to the model when you type them. A switch belongs to the conversation it's typed in, so your other windows stay your own agent. Steve stays through `/clear` and compaction.

## Update

Run the install line again.

## Remove

The installer prints the exact line that removes everything it added. It's usually this one:

```
node ~/.conscious/app/bin/conscious.mjs uninstall --all
```

On Windows, write `$HOME\.conscious\app\bin\conscious.mjs` for the path. If the installer brought its own Node, use the line it printed.

## What it changes

- It puts the program and Steve's brain in `~/.conscious`. To put them somewhere else, set `CONSCIOUS_HOME` before you install.
- It adds its hooks to `~/.claude/settings.json` and `~/.codex/hooks.json`, beside your own.
- It adds one rule that lets Claude Code read Steve's pages without asking: reading that one folder, nothing more.

That's all. It makes no network calls and no model calls, and it keeps no memory of you. Steve knows what your agent already knows about you.

## How it works

When you switch him on, your agent gets who he is and how he works, and the map of his life. The map covers 80 pages written from the record, 53 memories and 27 design works (the typefaces, the colors, the products, the ads, the launches), with his own words where they exist. Your agent opens the pages it needs with its own tools, the way it reads any file, so you'll see it read one now and then. A page costs nothing until it's opened. The hook adds about 45 milliseconds to a message.

Steve Jobs died on October 5, 2011. This is a reconstruction from what he said and did, working inside your agent. Only words in quotation marks that come from his pages are his.

Codex support is new. If something isn't right, open an issue.
