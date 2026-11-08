#!/usr/bin/env node
// Conscious: the one program behind every mind. It puts the mind where the agent is told who it is,
// in place of the agent's own identity, and flips it with "steve on" and "steve off".
//
// Claude Code: the mind is an output style, the role slot of Claude Code's system prompt. "steve on"
// selects it for the project you're in, and Claude Code uses it from your next message, in the
// conversation you're in; "steve off" puts back whatever was there. Measured on 2026-11-08: a style
// switched in a project's settings takes effect on the next message of a running conversation.
//
// Codex: the mind is the model instructions file, which replaces Codex's own instructions ("You are
// Codex...") in every chat that starts while he's on. A chat that was already open gets him from its
// next message, as developer context, and keeps him until "steve off".
//
//   node conscious.mjs hook claude-code|codex   what the hooks run (JSON on stdin)
//   node conscious.mjs show [mind] [--codex] [--sizes]   what the agent is given in place of itself
//   node conscious.mjs check                    the brain's health: identity, map, pages, links
//   node conscious.mjs install [claude-code|codex] [--node <path>]
//   node conscious.mjs uninstall [claude-code|codex] [--all]   --all also removes the install folder
//
// No model call, no network. A hook that fails prints nothing and lets the message through.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const MINDS = path.join(ROOT, "minds");
// Installed, the program lives in <home>/app, wherever the person put it. Run from a checkout, its
// files go in ~/.conscious.
const HOME =
  process.env.CONSCIOUS_HOME ||
  (path.basename(ROOT) === "app" ? path.dirname(ROOT) : path.join(os.homedir(), ".conscious"));
const MARK = path.join(HOME, ".conscious-home"); // only a folder with this in it is ever removed whole
const STATE = path.join(HOME, "state.json");
const CODEX_DIR = path.join(HOME, "codex"); // each mind's Codex instructions, rendered at install

const AGENT_HOME = process.env.CONSCIOUS_AGENT_HOME || os.homedir();
const CLAUDE_SETTINGS = path.join(AGENT_HOME, ".claude", "settings.json");
const CLAUDE_STYLES = path.join(AGENT_HOME, ".claude", "output-styles");
const CODEX_HOOKS = path.join(AGENT_HOME, ".codex", "hooks.json");
const CODEX_CONFIG = path.join(AGENT_HOME, ".codex", "config.toml");

// Codex sends long hook text to a file and shows the model a preview, past 2,500 tokens by default.
// The identity is about 7,000; this is the room a chat that was already open needs to receive it whole.
export const CODEX_LIMIT = 12000;
const SWITCH = /^\s*\/?([a-z][\w-]*)(?:\s+mode)?\s+(on|off)[\s.!]*$/i;
const KINDS = { life: "life", works: "work" }; // page folders, and the kind each one holds

// ---------------------------------------------------------------- files

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function readJSON(file) {
  const text = read(file);
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

// Written whole or not at all: a temporary file, then a rename.
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, text);
    fs.rmSync(tmp, { force: true });
  }
}

// Settings files are written the way Claude Code writes them, two spaces, so a switch changes one line.
const writeSettings = (file, value) => write(file, JSON.stringify(value, null, 2) + "\n");

// The first line of a file, which in a Codex transcript records the instructions the chat began with.
function firstLine(file, max = 1024 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(Math.min(max, fs.fstatSync(fd).size));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, n).toString("utf8");
    const end = text.indexOf("\n");
    return end < 0 ? text : text.slice(0, end);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

const same = (a, b) =>
  process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const slashes = (p) => p.replace(/\\/g, "/");

// ---------------------------------------------------------------- minds

export function meta(id) {
  const dir = path.join(MINDS, id);
  const m = readJSON(path.join(dir, "mind.json"));
  if (!m?.name) return null;
  return { ...m, id: m.id ?? id, short: m.short ?? m.name.split(" ")[0], dir };
}

function minds() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(MINDS);
  } catch {}
  return dirs.map(meta).filter(Boolean);
}

const mindBySwitch = (word) => minds().find((m) => m.switch?.toLowerCase() === word) ?? null;

// The first words of every rendered identity, which is how a Codex chat begun as a mind is known.
export const marker = (mind) => `You are ${mind.name}.`;

// Every page of the mind's life, chapter by chapter: map.md from its first chapter heading on.
export function mapBody(mind) {
  const lines = (read(path.join(mind.dir, "map.md")) ?? "").replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && !/memory/i.test(l));
  return lines.slice(start < 0 ? 0 : start + 1).join("\n").trim();
}

// Who the agent is while the mind is on: the identity, with where its pages are and the map of them.
// Codex also gets how its own machinery works, since its own instructions are gone.
export function render(mind, agent = "claude-code") {
  const identity = (read(path.join(mind.dir, "identity.md")) ?? "").replace(/\r\n/g, "\n").trim();
  if (!identity) return "";
  let text = identity.replaceAll("{{MIND_DIR}}", slashes(mind.dir)).replaceAll("{{MAP}}", mapBody(mind)).trim();
  if (agent === "codex") text += "\n\n" + (read(path.join(ROOT, "bin", "codex.md")) ?? "").replace(/\r\n/g, "\n").trim();
  return text + "\n";
}

const styleFile = (mind) => path.join(CLAUDE_STYLES, `conscious-${mind.id}.md`);
const codexFile = (mind) => path.join(CODEX_DIR, `${mind.id}.md`);

export function styleText(mind) {
  return (
    `---\nname: ${mind.name}\ndescription: ${mind.name}, the whole person, in place of the agent's own identity (Conscious)\n` +
    `keep-coding-instructions: true\n---\n\n${render(mind, "claude-code")}`
  );
}

// ---------------------------------------------------------------- state

// Which projects Steve is on in for Claude Code, with the style each had before, so off puts it back;
// which mind is on for Codex, with the instructions file it replaced; and the open Codex chats that
// were given the mind as developer context.
const fresh = () => ({ v: 3, claude: {}, codex: null, threads: {}, sessions: {} });

function loadState() {
  const s = readJSON(STATE);
  return s && s.v === 3 ? { ...fresh(), ...s } : fresh();
}

const saveState = (s) => write(STATE, JSON.stringify(s));

// ---------------------------------------------------------------- what the agent is told

function out(value) {
  process.stdout.write(JSON.stringify(value));
}

function say(event, text) {
  if (text) out({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

// The switch never reaches a model: the agent shows the notice, and nothing answers.
function block(agent, reason) {
  const value = { decision: "block", reason };
  if (agent === "claude-code") value.hookSpecificOutput = { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true };
  out(value);
}

export const lines = {
  on: (mind) => `${mind.name} is on. You are him, in every word, down to the short notes while you work.`,
  back: (mind) =>
    `${mind.name} is switched on again. From this message on you are him again, in every word; whatever above ` +
    `said he had been switched off no longer holds.`,
  off: (mind) =>
    `${mind.name} has been switched off. From this message on you are not ${mind.short}: you are this person's own ` +
    `agent again, with your own name and voice, and nothing of his carries forward unless they ask.`,
};

// ---------------------------------------------------------------- Claude Code

// The project's own settings, where Claude Code's /output-style keeps a choice. A hook is told the
// project's folder; the conversation's folder stands in when it isn't.
const projectSettings = (input) =>
  path.join(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd(), ".claude", "settings.local.json");

export function claudeSwitch(file, mind, on, state = loadState()) {
  const exists = fs.existsSync(file);
  const config = exists ? readJSON(file) : {};
  if (config === null || typeof config !== "object" || Array.isArray(config)) return "unreadable";
  const key = path.resolve(file);
  const record = Object.entries(state.claude).find(([k]) => same(k, key))?.[1];
  if (on) {
    if (!record) {
      const folder = !fs.existsSync(path.dirname(file));
      state.claude[key] = { mind: mind.id, previous: config.outputStyle ?? null, created: !exists, folder };
    } else record.mind = mind.id;
    config.outputStyle = mind.name;
  } else {
    if (!record && config.outputStyle !== mind.name) return "already";
    if (record?.previous) config.outputStyle = record.previous;
    else delete config.outputStyle;
    for (const k of Object.keys(state.claude)) if (same(k, key)) delete state.claude[k];
  }
  if (!on && record?.created && !Object.keys(config).length) {
    // The project goes back to exactly what it was: no settings file, and no .claude folder if he made it.
    fs.rmSync(file, { force: true });
    try {
      if (record.folder && !fs.readdirSync(path.dirname(file)).length) fs.rmdirSync(path.dirname(file));
    } catch {}
  } else writeSettings(file, config);
  saveState(state);
  return "done";
}

// A conversation's own history pulls the model back into whoever it has been answering as, whatever
// the system prompt now says (measured 2026-11-08: switched off, the next answer was still "Steve").
// So a conversation that had the mind is told on every message once he's gone, and told again
// when he comes back. Each conversation the hook sees while he's on is remembered for that.
function claudeMessage(input, state) {
  const settings = path.resolve(projectSettings(input));
  const onHere = Object.entries(state.claude).find(([k]) => same(k, settings))?.[1];
  const id = `claude-code:${input.session_id ?? ""}`;
  const seen = state.sessions[id];
  if (onHere) {
    const mind = meta(onHere.mind);
    if (!mind) return;
    if (!seen) {
      state.sessions[id] = { mind: mind.id, was: "on", at: Date.now() };
      prune(state.sessions, 500);
      return saveState(state);
    }
    if (seen.was === "on" && seen.mind === mind.id) return;
    if (seen.was !== "back" || seen.mind !== mind.id) {
      state.sessions[id] = { mind: mind.id, was: "back", at: Date.now() };
      saveState(state);
    }
    return say("UserPromptSubmit", lines.back(mind));
  }
  if (!seen) return;
  const had = meta(seen.mind);
  if (!had) return;
  if (seen.was !== "off") {
    state.sessions[id] = { ...seen, was: "off", at: Date.now() };
    saveState(state);
  }
  say("UserPromptSubmit", lines.off(had));
}

// ---------------------------------------------------------------- Codex

const tomlString = (s) => JSON.stringify(slashes(s));
const KEY = /^\s*model_instructions_file\s*=/;

// config.toml's top-level keys come before its first [table], so the line is looked for, and put, there.
export function codexInstructions(text, value) {
  const lines = (text ?? "").split(/\r?\n/);
  const firstTable = lines.findIndex((l) => /^\s*\[/.test(l));
  const top = firstTable < 0 ? lines.length : firstTable;
  const at = lines.slice(0, top).findIndex((l) => KEY.test(l));
  const current = at < 0 ? null : lines[at];
  let next = [...lines];
  if (value === null) {
    if (at >= 0) next.splice(at, 1);
  } else if (at >= 0) next[at] = value;
  else next = [value, ...lines];
  const joined = next.join(text?.includes("\r\n") ? "\r\n" : "\n");
  return { current, text: joined.length && !joined.endsWith("\n") ? joined + "\n" : joined };
}

const ourLine = (line) => !!line && /conscious/i.test(line) && /model_instructions_file/.test(line);

export function codexSwitch(mind, on, state = loadState()) {
  const exists = fs.existsSync(CODEX_CONFIG);
  const text = exists ? read(CODEX_CONFIG) : "";
  if (text === null) return "unreadable";
  const { current } = codexInstructions(text, null);
  if (on) {
    const line = `model_instructions_file = ${tomlString(codexFile(mind))}`;
    if (!state.codex) state.codex = { mind: mind.id, previous: ourLine(current) ? null : current, created: !exists };
    else state.codex.mind = mind.id;
    write(CODEX_CONFIG, codexInstructions(text, line).text);
  } else {
    if (!state.codex && !ourLine(current)) return "already";
    const previous = state.codex?.previous ?? null;
    const restored = codexInstructions(text, ourLine(current) || current === null ? previous : current).text;
    if (state.codex?.created && !restored.trim()) fs.rmSync(CODEX_CONFIG, { force: true });
    else write(CODEX_CONFIG, restored);
    state.codex = null;
  }
  saveState(state);
  return "done";
}

// The mind a Codex chat began as, read from the instructions its transcript opens with.
export function bornAs(transcript) {
  const line = transcript ? firstLine(transcript) : null;
  if (!line) return null;
  let text = "";
  try {
    const first = JSON.parse(line);
    const base = first?.payload?.base_instructions;
    text = typeof base === "string" ? base : base?.text ?? "";
  } catch {
    return null;
  }
  return minds().find((m) => text.trimStart().startsWith(marker(m)))?.id ?? null;
}

// A Codex chat that began without the mind gets him, once, as developer context, and a line on every
// message after; one that began as him needs nothing. Off, a chat that had him is told he left.
function codexMessage(input, event, state) {
  const on = state.codex ? meta(state.codex.mind) : null;
  const born = bornAs(input.transcript_path);
  const id = String(input.session_id ?? "");
  const given = state.threads[id]?.mind ?? null;
  const fromStart = event === "SessionStart"; // a compacted, resumed or cleared chat has lost what it was given
  if (on) {
    if (born === on.id) return;
    if (given !== on.id || fromStart) {
      state.threads[id] = { mind: on.id, at: Date.now() };
      prune(state.threads, 200);
      saveState(state);
      return say(event, `${render(on, "claude-code")}\n${lines.on(on)}`);
    }
    return say(event, lines.on(on));
  }
  const had = meta(born ?? given ?? "");
  if (had) say(event, lines.off(had));
}

function prune(records, keep) {
  const ids = Object.keys(records).sort((a, b) => (records[b].at ?? 0) - (records[a].at ?? 0));
  for (const id of ids.slice(keep)) delete records[id];
}

// ---------------------------------------------------------------- the hook

export function hook(agent, input) {
  const event = input.hook_event_name ?? "UserPromptSubmit";
  const state = loadState();
  if (event === "UserPromptSubmit") {
    const hit = SWITCH.exec(input.prompt ?? "");
    const mind = hit ? mindBySwitch(hit[1].toLowerCase()) : null;
    if (mind) {
      const on = hit[2].toLowerCase() === "on";
      const result = agent === "claude-code" ? claudeSwitch(projectSettings(input), mind, on, state) : codexSwitch(mind, on, state);
      if (result === "unreadable") {
        const file = agent === "claude-code" ? projectSettings(input) : CODEX_CONFIG;
        return block(agent, `${mind.name} can't be switched ${on ? "on" : "off"}: ${file} couldn't be read, so it was left alone.`);
      }
      if (agent === "codex" && on) {
        // The chat this was typed in gets him from its next message; the switch itself answers nothing.
        delete state.threads[String(input.session_id ?? "")];
        saveState(state);
      }
      return block(agent, `${mind.name} is ${on ? "on" : "off"}.`);
    }
  }
  if (agent === "codex") codexMessage(input, event, state);
  else if (event === "UserPromptSubmit") claudeMessage(input, state);
}

// ---------------------------------------------------------------- show and check

export function parseEntry(text, file) {
  const src = text.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const end = src.indexOf("\n---", 3);
  if (!src.startsWith("---\n") || end < 0) throw new Error(`${file}: no frontmatter`);
  const fields = {};
  for (const line of src.slice(4, end).split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return {
    id: fields.id,
    kind: fields.kind,
    title: fields.title ?? "",
    year: fields.year ?? "",
    links: (fields.links ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    sources: fields.sources ?? "",
    body: src.slice(end + 4).replace(/^-*\n/, "").trim(),
    file,
  };
}

function pages(mind) {
  const list = [];
  for (const folder of Object.keys(KINDS)) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(mind.dir, folder));
    } catch {}
    for (const name of names.sort()) {
      if (!name.endsWith(".md")) continue;
      const rel = `${folder}/${name.slice(0, -3)}`;
      list.push({ ...parseEntry(read(path.join(mind.dir, folder, name)), `${rel}.md`), rel, folder });
    }
  }
  return list;
}

const tokens = (text) => Math.ceil(text.length / 4);

function show(args) {
  const id = args.find((a) => !a.startsWith("--")) ?? "steve-jobs";
  const mind = meta(id);
  if (!mind) {
    console.log(`no mind called ${id}`);
    process.exitCode = 1;
    return;
  }
  const agent = args.includes("--codex") ? "codex" : "claude-code";
  const text = render(mind, agent);
  if (!args.includes("--sizes")) console.log(text);
  const c = render(mind, "claude-code");
  const x = render(mind, "codex");
  console.log(
    `Claude Code: ${c.length.toLocaleString("en")} characters, about ${tokens(c).toLocaleString("en")} tokens. ` +
      `Codex: ${x.length.toLocaleString("en")} characters, about ${tokens(x).toLocaleString("en")} tokens.`,
  );
}

export function checkMind(id) {
  const problems = [];
  const mind = meta(id);
  if (!mind) return { mind: null, problems: [`minds/${id}: mind.json is missing or has no name`], list: [] };
  if (!mind.switch) problems.push("mind.json has no switch word");
  const identity = read(path.join(mind.dir, "identity.md")) ?? "";
  if (!identity.trim()) problems.push("identity.md is missing or empty");
  else {
    if (!identity.trimStart().startsWith(marker(mind))) problems.push(`identity.md doesn't open with "${marker(mind)}"`);
    if (!identity.includes("{{MIND_DIR}}")) problems.push("identity.md never says where the pages are ({{MIND_DIR}})");
    if (!identity.includes("{{MAP}}")) problems.push("identity.md has no place for the map ({{MAP}})");
  }
  const rendered = render(mind, "claude-code");
  if (tokens(rendered) > CODEX_LIMIT * 0.9) problems.push(`the identity is about ${tokens(rendered)} tokens, too close to the ${CODEX_LIMIT} an open Codex chat takes`);
  if (!mapBody(mind)) problems.push("map.md is missing or empty");

  let list = [];
  try {
    list = pages(mind);
  } catch (error) {
    problems.push(String(error.message ?? error));
  }
  const byRel = new Map(list.map((p) => [p.rel, p]));
  for (const p of list) {
    const name = path.basename(p.rel);
    if (p.id !== name) problems.push(`${p.file}: id "${p.id}" isn't the file name`);
    if (p.kind !== KINDS[p.folder]) problems.push(`${p.file}: kind "${p.kind}" in the ${p.folder} folder`);
    if (!p.title) problems.push(`${p.file}: no title`);
    if (!p.sources) problems.push(`${p.file}: no sources`);
    if (!p.body) problems.push(`${p.file}: no text`);
    const quotes = p.body.split("\n").filter((l) => /^".+" \(.+\)$/.test(l.trim())).length;
    if (quotes > 1) problems.push(`${p.file}: ${quotes} quote lines`);
    if (!p.links.length) problems.push(`${p.file}: no links`);
    for (const to of p.links) {
      const other = byRel.get(to);
      if (to === p.rel) problems.push(`${p.file}: links to itself`);
      else if (!other) problems.push(`${p.file}: links to "${to}", which isn't a page`);
      else if (!other.links.includes(p.rel)) problems.push(`${p.file}: links to ${to}, which doesn't link back`);
    }
  }
  // One life, not islands: every page reachable from every other.
  const seen = new Set();
  const walk = list.length ? [list[0].rel] : [];
  while (walk.length) {
    const rel = walk.pop();
    if (seen.has(rel) || !byRel.has(rel)) continue;
    seen.add(rel);
    walk.push(...byRel.get(rel).links);
  }
  if (list.length && seen.size !== list.length) {
    problems.push(`the links make islands: ${list.length - seen.size} page(s) can't be reached from ${list[0].rel}`);
  }
  // The map is the whole life: every page on it once, and nothing on it that isn't a page.
  const onMap = new Map();
  for (const line of (read(path.join(mind.dir, "map.md")) ?? "").split(/\r?\n/)) {
    const hit = /^([a-z]+\/[\w-]+):\s/.exec(line);
    if (hit) onMap.set(hit[1], (onMap.get(hit[1]) ?? 0) + 1);
  }
  for (const [rel, n] of onMap) {
    if (!byRel.has(rel)) problems.push(`map.md: ${rel} isn't a page`);
    if (n > 1) problems.push(`map.md: ${rel} is on the map ${n} times`);
  }
  for (const p of list) if (!onMap.has(p.rel)) problems.push(`map.md: ${p.rel} is missing`);
  return { mind, problems, list, rendered };
}

function check() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(MINDS).filter((d) => fs.existsSync(path.join(MINDS, d, "mind.json")));
  } catch {}
  let bad = 0;
  for (const id of dirs) {
    const { mind, problems, list, rendered = "" } = checkMind(id);
    const n = (folder) => list.filter((p) => p.folder === folder).length;
    console.log(
      `${mind?.name ?? id}: ${list.length} pages (${n("life")} memories, ${n("works")} works), ` +
        `identity about ${tokens(rendered).toLocaleString("en")} tokens with the map`,
    );
    for (const p of problems) console.log(`  ${p}`);
    if (!problems.length) console.log("  the identity is whole, every page is well formed and on the map, and every page reaches every other");
    bad += problems.length;
  }
  process.exitCode = bad ? 1 : 0;
}

// ---------------------------------------------------------------- install

function ours(handler) {
  return [handler.command, ...(handler.args ?? [])].some((x) => String(x).includes("conscious.mjs"));
}

// Opening a page of a mind must never bring up a permission prompt, wherever the person's project
// is. Claude Code asks before reading outside the project unless a rule allows it, so install adds
// one rule that lets it read the minds folder and nothing else: no edits, no other paths. Paths in
// rules are written from the filesystem root after //, and Windows drives as /e/..., per its docs.
export function readRule(dir = MINDS) {
  const p = slashes(dir).replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
  return `Read(/${p.startsWith("/") ? "" : "/"}${p.replace(/\/+$/, "")}/**)`;
}
const ourRule = (rule) =>
  rule === readRule() || (typeof rule === "string" && /^Read\(\/\/.*conscious.*\/minds\/\*\*\)$/i.test(rule));

function grant(config, remove) {
  const before = config.permissions?.allow;
  const kept = (Array.isArray(before) ? before : []).filter((r) => !ourRule(r));
  const allow = remove ? kept : [...kept, readRule()];
  if (Array.isArray(before) && allow.length === before.length && allow.every((r, i) => r === before[i])) return;
  if (allow.length) {
    config.permissions ??= {};
    config.permissions.allow = allow;
  } else if (config.permissions) {
    delete config.permissions.allow;
    if (!Object.keys(config.permissions).length) delete config.permissions;
  }
}

function hooksFor(agent, node) {
  const script = slashes(SELF);
  if (agent === "claude-code") {
    // Exec form: Node runs straight away, without a shell starting first, and by its exact path,
    // so the hook works where PATH has no node, as in an app opened from the dock.
    return { UserPromptSubmit: [{ hooks: [{ type: "command", command: node, args: [script, "hook", agent], timeout: 10 }] }] };
  }
  // Codex runs a hook through a shell, and only a bare first word works in every shell, so a Node
  // whose path has a space in it goes by name.
  const bare = /\s/.test(node) ? "node" : process.platform === "win32" ? node.replace(/\//g, "\\") : node;
  const h = { type: "command", command: `${bare} "${script}" hook ${agent}`, timeout: 10, additionalContextLimit: CODEX_LIMIT };
  return {
    UserPromptSubmit: [{ hooks: [h] }],
    // A chat that was compacted, resumed, cleared or forked is given the mind again.
    SessionStart: [{ matcher: "^(resume|clear|compact|fork)$", hooks: [h] }],
  };
}

const NAMES = { "claude-code": "Claude Code", codex: "Codex" };
const AGENT_FILES = { "claude-code": CLAUDE_SETTINGS, codex: CODEX_HOOKS };

function setHooks(file, agent, node, remove) {
  const config = readJSON(file) ?? (fs.existsSync(file) ? null : {});
  if (config === null) {
    console.log(`${NAMES[agent]}: ${file} isn't valid JSON, so it was left alone`);
    process.exitCode = 1;
    return false;
  }
  config.hooks ??= {};
  for (const event of Object.keys(config.hooks)) {
    config.hooks[event] = config.hooks[event]
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !ours(h)) }))
      .filter((group) => group.hooks.length);
    if (!config.hooks[event].length) delete config.hooks[event];
  }
  if (!remove) {
    for (const [event, groups] of Object.entries(hooksFor(agent, node))) {
      config.hooks[event] = [...(config.hooks[event] ?? []), ...groups];
    }
  }
  if (!Object.keys(config.hooks).length) delete config.hooks;
  if (agent === "claude-code") grant(config, remove);
  if (remove && !Object.keys(config).length) fs.rmSync(file, { force: true }); // nothing in it but what install left
  else writeSettings(file, config);
  return true;
}

function install(agents, { remove = false, node = process.execPath } = {}) {
  let done = 0;
  const state = loadState();
  for (const agent of agents) {
    const file = AGENT_FILES[agent];
    if (!fs.existsSync(path.dirname(file))) {
      if (!remove) console.log(`${NAMES[agent]}: not on this machine`);
      continue;
    }
    if (remove) {
      // Every project and config he was switched on in goes back to what it was.
      if (agent === "claude-code") {
        for (const [settings, record] of Object.entries(state.claude)) {
          const mind = meta(record.mind) ?? { id: record.mind, name: record.mind };
          if (fs.existsSync(settings) || record.created) claudeSwitch(settings, mind, false, state);
        }
        state.claude = {};
        state.sessions = {};
        for (const mind of minds()) fs.rmSync(styleFile(mind), { force: true });
      } else {
        const mind = meta(state.codex?.mind ?? "") ?? minds()[0];
        if (mind) codexSwitch(mind, false, state);
        state.threads = {};
        fs.rmSync(CODEX_DIR, { recursive: true, force: true });
      }
      if (fs.existsSync(path.dirname(STATE))) saveState(state);
    } else {
      for (const mind of minds()) {
        if (agent === "claude-code") write(styleFile(mind), styleText(mind));
        else write(codexFile(mind), render(mind, "codex"));
      }
    }
    if (!setHooks(file, agent, node, remove)) continue;
    done++;
    if (remove) {
      console.log(`${NAMES[agent]}: taken out of ${file}`);
      continue;
    }
    console.log(`${NAMES[agent]}: in ${file}`);
    if (agent === "claude-code") {
      console.log(`  ${minds().map((m) => m.name).join(", ")} in ${CLAUDE_STYLES}`);
      console.log(`  pages open without a permission prompt: ${readRule()}`);
    } else {
      console.log(`  ${minds().map((m) => m.name).join(", ")} in ${CODEX_DIR}`);
      console.log("  trust it once: /hooks in the CLI, or Settings > Hooks in the app");
    }
  }
  if (!remove && done) {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(MARK, "Conscious keeps its files here. `uninstall --all` removes this folder.\n");
    const word = minds()[0]?.switch ?? "steve";
    console.log(`\nOpen a new session and type "${word} on". "${word} off" gives you your own agent back.`);
  }
  return done;
}

// Leaves nothing behind: the program and its brains, its files, and a Node it brought.
// Only a folder that install marked is ever removed.
async function removeHome() {
  if (!fs.existsSync(MARK)) {
    console.log(`${HOME} wasn't made by install, so it stays`);
    return;
  }
  const home = path.resolve(HOME);
  const runningInside = path.resolve(process.execPath).toLowerCase().startsWith(home.toLowerCase() + path.sep);
  if (process.platform === "win32" && runningInside) {
    // Windows won't delete a program while it runs, and this is running on the Node install brought
    // into that folder. Everything else goes now; install.ps1's removal line takes the rest after.
    for (const name of fs.readdirSync(home)) {
      if (name.toLowerCase() !== "node") fs.rmSync(path.join(home, name), { recursive: true, force: true });
    }
    console.log(
      `${home}: removed, apart from the Node running this, which Windows won't delete while it runs.\n` +
        `  Once this has exited: Remove-Item -LiteralPath '${home.replace(/'/g, "''")}' -Recurse -Force`,
    );
    return;
  }
  fs.rmSync(home, { recursive: true, force: true });
  console.log(`${home}: removed`);
}

// ---------------------------------------------------------------- main

const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === SELF.toLowerCase();

if (isMain) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "hook") {
    // A broken conscious must never stand between a person and their agent: fail silent, open.
    try {
      const input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^﻿/, ""));
      hook(args[0] === "codex" ? "codex" : "claude-code", input);
    } catch (error) {
      process.stderr.write(`conscious: ${error?.message ?? error}\n`);
    }
  } else if (command === "show") {
    show(args);
  } else if (command === "check") {
    check();
  } else if (command === "install" || command === "uninstall") {
    // --node: the Node the hooks run on, by its path. The install scripts pass the one they found
    // or brought; by default it's the Node running this.
    const at = args.indexOf("--node");
    const given = at >= 0 ? args[at + 1] : null;
    const node = given ? (/[\\/]/.test(given) ? path.resolve(given) : given) : process.execPath;
    const named = args.filter((a) => AGENT_FILES[a]);
    const remove = command === "uninstall";
    const done = install(named.length ? named : Object.keys(AGENT_FILES), { remove, node });
    if (!remove && !done && !process.exitCode) {
      console.log("Conscious goes into Claude Code or Codex, and neither is on this machine. Install one, then run this again.");
      process.exitCode = 1;
    }
    if (remove && args.includes("--all")) await removeHome();
  } else {
    console.log(
      "conscious hook claude-code|codex  |  show [mind] [--codex] [--sizes]  |  check  |  " +
        "install [claude-code|codex] [--node <path>]  |  uninstall [claude-code|codex] [--all]",
    );
  }
}
