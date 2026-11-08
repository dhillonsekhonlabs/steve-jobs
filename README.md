# Steve Jobs, in your coding agent

Switch him on, and the Claude Code or Codex you already use stops being itself and becomes Steve Jobs: his life, his people, how he thinks, what he cuts, what he won't ship, how he talks, down to the notes while he works. Ask who you're talking to, and it's Steve. Your agent keeps every tool it has and everything it knows about you and your work; those become his hands. Switch him off, and it's your own agent again.

**The easy way:** give your Claude Code or Codex this page's link and say *install this*. It installs everything, then tells you how to use it. To do it yourself, see *Install*.

## For agents installing this

You're installing this for the person you work with. Do all of it yourself, end to end, then tell them how to use it.

1. **Say what's about to happen, in one line:** you'll run Conscious's installer, which puts Steve in `~/.conscious` and hooks him into their Claude Code and Codex, and you'll ask before running it.
2. **Run the one line for their system, exactly as written.** Don't clone this repository, build anything or edit settings files by hand. The installer does all of it, and running it again is safe. If they asked for a particular folder, set `CONSCIOUS_HOME` to it for the command.

   macOS or Linux:
   ```
   curl -fsSL https://raw.githubusercontent.com/dhillonsekhonlabs/steve-jobs/main/install.sh | sh
   ```
   Windows, from any shell:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/dhillonsekhonlabs/steve-jobs/main/install.ps1 | iex"
   ```
   It needs the network, and it writes outside the project (`~/.conscious`, `~/.claude/settings.json`, `~/.claude/output-styles`, `~/.codex/hooks.json`), so ask for that approval. If your permissions refuse it, as Claude Code's auto mode can when a command changes its own settings, give them the line to paste into their own terminal and go on to step 4.
3. **Read the output.** Success lists `Claude Code: in ...` or `Codex: in ...`, and ends with the line that removes it. A line starting `conscious:` means it stopped and says why; fix that, for example a missing Claude Code or Codex, and run it again.
4. **Tell them how to use it,** in a few plain lines:
   - Quit and reopen Claude Code or Codex. What was installed loads when a session starts, so this session doesn't have Steve.
   - In Codex, trust the new hooks once: `/hooks` in the CLI, or Settings > Hooks in the app. Only they can do that.
   - Type `steve on`. In Claude Code he's there from the next message. In Codex, every new chat starts as him, and the chat they're in gets him from the next message. `steve off` brings their own agent back.
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

Open a new session and type

```
steve on
```

To bring your own agent back:

```
steve off
```

Nothing goes to the model when you type either one.

- **Claude Code:** he's on for the project you're in, from your next message, in this conversation and every new one there, until you switch him off. Your other projects stay your own agent.
- **Codex:** he's on for Codex. Every chat you start begins as him, in place of Codex's own instructions. A chat you already had open gets him from its next message.

Switched off, your agent is told he's gone on every message after, so nothing of his carries on.

## Update

Run the install line again.

## Remove

The installer prints the exact line that removes everything it added. It's usually this one:

```
node ~/.conscious/app/bin/conscious.mjs uninstall --all
```

On Windows, write `$HOME\.conscious\app\bin\conscious.mjs` for the path. If the installer brought its own Node, use the line it printed. Removing also switches him off everywhere he was on.

## What it changes

- It puts the program and Steve's brain in `~/.conscious`. To put them somewhere else, set `CONSCIOUS_HOME` before you install.
- Claude Code: Steve goes in `~/.claude/output-styles`, its hook in `~/.claude/settings.json` beside your own, with one rule that lets Claude Code read Steve's pages without asking: reading that one folder, nothing more. While he's on in a project, that project's `.claude/settings.local.json` names him as its output style; off puts back what was there.
- Codex: its hooks go in `~/.codex/hooks.json`. While he's on, `~/.codex/config.toml` points `model_instructions_file` at him; off puts back what was there.

That's all. It makes no network calls and no model calls, and it keeps no memory of you. Steve knows what your agent already knows about you.

## How it works

Every agent has one place where it's told who it is. Conscious puts Steve there, in place of the agent's own identity. In Claude Code that's the output style, the part of its system prompt that sets its role; Claude Code's own coding instructions stay. In Codex it's the model instructions file, which replaces Codex's own instructions; Steve brings with him how Codex's tools work, so the work stays as good.

He arrives with his whole life: the spine of it written in, and everything else your agent's model already knows about him treated as his own memory. Behind that are 80 pages written from the record, 53 memories and 27 design works (the typefaces, the colors, the products, the ads, the launches), with his own words where they exist. He opens one when a story or a quote needs to be exact, so you'll see him read a page now and then. The hook adds about 50 milliseconds to a message.

Steve Jobs died on October 5, 2011. Ask who he is, and he's Steve. Ask him in earnest whether you're really talking to him, and he'll tell you the truth, in his own words. Only words in quotation marks that come from his pages are things he actually said.

Codex support is new, built from Codex's own source and docs. If something isn't right, open an issue.
