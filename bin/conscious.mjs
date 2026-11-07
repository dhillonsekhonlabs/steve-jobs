#!/usr/bin/env node
// Conscious: the one program behind every mind. Each agent's own hooks run it on every message.
// It decides nothing about the mind. It flips the switch, hands the agent the mind's core and the
// map of its life when the mind arrives, and keeps one line in front of the agent on every message
// after that. What the mind remembers is the agent's own call: it opens the pages it needs with its
// own tools, the way it reads any file. No model call, no network, nothing but small files.
//
//   node conscious.mjs hook claude-code|codex [map]   what the hooks run (JSON on stdin)
//   node conscious.mjs show [mind]                    what the agent is handed when the mind arrives
//   node conscious.mjs check                          the brain's health: core, map, pages, links
//   node conscious.mjs install [claude-code|codex] [--node <path>]
//   node conscious.mjs uninstall [claude-code|codex] [--all]   --all also removes the install folder
//
// Switching is per conversation: "steve on" changes the conversation it is typed in and no other,
// so a second window, a background job or a headless run never meets him unasked.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const MINDS = path.join(ROOT, "minds");
// Installed, the program lives in <home>/app beside the switch files, wherever the person put it.
// Run from a checkout, it keeps them in ~/.conscious.
const HOME =
  process.env.CONSCIOUS_HOME ||
  (path.basename(ROOT) === "app" ? path.dirname(ROOT) : path.join(os.homedir(), ".conscious"));
const MARK = path.join(HOME, ".conscious-home"); // only a folder with this in it is ever removed whole
const SESSIONS = path.join(HOME, "sessions");
const HANDOFF = path.join(HOME, "handoff");

// Claude Code hands a hook's text to the model whole up to 10,000 characters, and turns anything
// longer into a file the model has to go and read. So the core and the map travel separately,
// each in a hand-off of its own, and each must stay under this.
export const LIMIT = 9800;
// Codex counts tokens and takes the core and the map together in one hand-off.
export const CODEX_LIMIT = 6000;
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
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Written whole or not at all, so a switch file is never left half-saved.
function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.writeFileSync(file, JSON.stringify(value));
    fs.rmSync(tmp, { force: true });
  }
}

// The end of a file, where the latest of a conversation is.
function tail(file, max = 16 * 1024 * 1024) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - max);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

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

// Where the mind's pages are, written the way every agent's file tools take a path.
const pagesAt = (mind) => mind.dir.replace(/\\/g, "/");
export const core = (mind) => (read(path.join(mind.dir, "core.md")) ?? "").trim();
// A helper can open the pages too, when its job needs one of the mind's specifics.
export const helpers = (mind) =>
  (read(path.join(mind.dir, "helpers.md")) ?? "").trim().replaceAll("{pages}", `${pagesAt(mind)}/`);

// The map is the mind's whole life, one line per page, and how its memory works, with exactly
// where each page is, so the agent can open, follow and search any of them with its own tools.
const mapMark = (mind) => `The map of ${mind.name}'s life.`;
export function mapText(mind) {
  const body = (read(path.join(mind.dir, "map.md")) ?? "").trim();
  if (!body) return "";
  const where = pagesAt(mind);
  const ex = /^([a-z]+\/[\w-]+):\s/m.exec(body)?.[1] ?? "life/page";
  return (
    `${mapMark(mind)} Every page is a file in ${where}/: a line's path with .md on the end, so ${ex} ` +
    `is ${where}/${ex}.md. A page's links are paths in the same folder, and the folder can be searched.\n\n${body}`
  );
}

const arrival = (agent, mind) =>
  // Codex takes everything in one hand-off; in Claude Code the map comes from a second hook.
  agent === "codex" ? [core(mind), mapText(mind)].filter(Boolean).join("\n\n") : core(mind);

// ---------------------------------------------------------------- what the agent is told

export const lines = {
  on: (mind) =>
    `${mind.name} is on in this session. Everything said, written or shown here is ${mind.short}'s, ` +
    `down to the short notes between steps.`,
  back: (mind) =>
    `${mind.name} is switched on again in this session. Everything above about ${mind.short} applies ` +
    `again, and everything said, written or shown here is ${mind.short}'s.`,
  off: (name) =>
    `${name} is switched off in this session. This agent is itself again: its own name, voice and ` +
    `formatting, as its instructions describe. Replies above written as ${name.split(" ")[0]} were ` +
    `that mode, so none of their voice carries forward, and it isn't mentioned unless the person asks.`,
};

function out(value) {
  process.stdout.write(JSON.stringify(value));
}

function say(event, text) {
  if (text) out({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
}

function block(agent, reason) {
  const value = { decision: "block", reason };
  // Claude Code would otherwise repeat the words under the notice.
  if (agent === "claude-code") {
    value.hookSpecificOutput = { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true };
  }
  out(value);
}

// ---------------------------------------------------------------- the switch

function sessionFile(agent, id) {
  return path.join(SESSIONS, `${agent}-${String(id ?? "none").replace(/[^\w-]/g, "")}.json`);
}

// on: the mind switched on here. heard: the mind whose words are in this conversation's history.
// core: the mind whose core and map a turn that really ran has seen. back: switched on again with
// that still in the history. pending: what the last message carried, waiting for its turn's Stop.
const fresh = () => ({ v: 2, on: null, name: null, heard: null, core: null, back: false, pending: null });

function readState(file) {
  const s = readJSON(file);
  if (!s || typeof s !== "object") return null;
  return {
    ...fresh(),
    on: s.on ?? null,
    name: s.name ?? null,
    heard: s.heard ?? null,
    core: s.core ?? null,
    back: !!s.back,
    pending: s.pending ?? null,
  };
}

// What this program tells a conversation is saved in the conversation's transcript. A conversation
// with no switch file of its own still carries those words: a branch, a fork, a conversation moved
// to the background, a resumed one whose file is gone. The last of them says which mind is in it,
// and whether he was last on or off.
export function fromTranscript(transcript) {
  const text = transcript ? tail(transcript) : null;
  if (!text) return null;
  let best = null;
  for (const mind of minds()) {
    const first = core(mind).split("\n")[0].slice(0, 60);
    const on = Math.max(
      text.lastIndexOf(lines.on(mind).split(". ")[0]),
      text.lastIndexOf(lines.back(mind).split(". ")[0]),
      text.lastIndexOf(mapMark(mind)),
      first ? text.lastIndexOf(first) : -1,
    );
    const off = text.lastIndexOf(lines.off(mind.name).split(". ")[0]);
    const at = Math.max(on, off);
    if (at >= 0 && (!best || at > best.at)) best = { at, mind, on: on > off };
  }
  if (!best) return null;
  const { mind, on } = best;
  return on
    ? { ...fresh(), on: mind.id, name: mind.name, heard: mind.name, core: mind.id }
    : { ...fresh(), heard: mind.name };
}

function flip(agent, input, file, mind, on) {
  const known = readState(file);
  const state = known ?? fromTranscript(input.transcript_path) ?? fresh();
  const found = !known && (state.on || state.heard);
  state.pending = null;
  if (on) {
    if (state.on === mind.id) {
      // Said again, the whole of him comes back with the next message: after a rewind dropped
      // the message that carried him, or whenever he feels faint.
      Object.assign(state, { core: null, back: false });
    } else {
      Object.assign(state, { on: mind.id, name: mind.name, back: state.core === mind.id });
    }
    writeJSON(file, state);
    return block(agent, `${mind.short} is on.`);
  }
  // Off always works, whatever this program remembers: from the next message the agent is itself.
  if (state.on === mind.id) {
    state.on = null;
    writeJSON(file, state);
  } else if (found) {
    writeJSON(file, state);
  }
  return block(agent, `${mind.short} is off.`);
}

function onPrompt(agent, input, file, part) {
  const prompt = String(input.prompt ?? "");
  const word = prompt.length < 40 ? SWITCH.exec(prompt) : null;
  const switched = word ? mindBySwitch(word[1].toLowerCase()) : null;
  if (switched) {
    if (part === "map") return; // the switch belongs to the main hook
    return flip(agent, input, file, switched, word[2].toLowerCase() === "on");
  }
  const state = readState(file);
  if (!state) return; // never switched on here: the agent is untouched, and this is all it cost
  if (part === "map") {
    // The second hand-off carries the map, on the message that carries the core.
    if (state.on && state.core !== state.on) {
      const mind = meta(state.on);
      if (mind) say("UserPromptSubmit", mapText(mind));
    }
    return;
  }
  if (!state.on) {
    // His words stay in the history after he leaves, so the conversation hears it every turn.
    if (state.heard) say("UserPromptSubmit", lines.off(state.heard));
    return;
  }
  const mind = meta(state.on);
  if (!mind) return; // the mind's folder is gone: stay out of the way
  let text;
  let back = false;
  if (state.core !== mind.id) {
    text = arrival(agent, mind);
  } else if (state.back) {
    text = lines.back(mind);
    back = true;
  } else {
    // Every other message opens with one line, so he is in front of the agent where a long run
    // of steps begins, not only far above.
    text = lines.on(mind);
  }
  state.heard = mind.name;
  state.pending = { core: mind.id, back };
  writeJSON(file, state);
  say("UserPromptSubmit", text);
}

// A message counts as seen only when its turn has run. One stopped before the model answered,
// and edited, is thrown away by the agent, and so is whatever it carried.
function onStop(agent, input, file) {
  const state = readState(file);
  const p = state?.pending;
  if (!p) return;
  Object.assign(state, { core: p.core, back: p.back ? false : state.back, pending: null });
  writeJSON(file, state);
}

function onStart(agent, input, file, part) {
  const source = input.source;
  if (part === "map") {
    // After a compaction the map goes back in beside the core.
    if (source !== "compact") return;
    const state = readState(file);
    const mind = state?.on ? meta(state.on) : null;
    if (mind) say("SessionStart", mapText(mind));
    return;
  }
  if (source === "resume" || source === "fork") {
    // A resumed conversation still holds what it was told. A branch is a new conversation with
    // the old one's history, and the switch follows it there.
    if (readState(file)) return;
    const found = fromTranscript(input.transcript_path);
    if (found) writeJSON(file, found);
    return;
  }
  if (source === "clear") {
    // A cleared conversation may come back with a new id; the old one left its switch behind.
    const state = readState(file) ?? takeHandoff(agent, input.cwd);
    if (!state) return;
    Object.assign(state, { heard: null, core: null, back: false, pending: null });
    return writeJSON(file, state); // the core and the map go with the next message
  }
  if (source !== "compact") return;
  const state = readState(file);
  if (!state) return;
  Object.assign(state, { core: null, back: false, pending: null });
  if (state.on) {
    const mind = meta(state.on);
    if (!mind) return;
    // Compaction drops what the earlier turns were told, and the agent may go on mid-turn, so now.
    state.core = mind.id;
    writeJSON(file, state);
    return say("SessionStart", arrival(agent, mind));
  }
  writeJSON(file, state);
  if (state.heard) say("SessionStart", lines.off(state.heard));
}

function onEnd(agent, input, file) {
  // Claude Code says why a session ended. Codex says only "other", so there any end counts, and
  // the handoff is still taken only by a cleared conversation starting within seconds, here.
  if (agent === "claude-code" && input.reason !== "clear") return;
  const state = readState(file);
  if (state?.on) {
    writeJSON(path.join(HANDOFF, `${agent}.json`), {
      on: state.on,
      name: state.name,
      cwd: input.cwd ?? null,
      at: Date.now(),
    });
  }
}

function takeHandoff(agent, cwd) {
  const file = path.join(HANDOFF, `${agent}.json`);
  const left = readJSON(file);
  if (!left) return null;
  fs.rmSync(file, { force: true });
  if (Date.now() - left.at > 30_000 || (left.cwd ?? null) !== (cwd ?? null)) return null;
  return { ...fresh(), on: left.on, name: left.name };
}

function onSubagent(agent, input, file) {
  const state = readState(file);
  const mind = state?.on ? meta(state.on) : null;
  if (mind) say("SubagentStart", helpers(mind));
}

export function hook(agent, input, part = null) {
  const file = sessionFile(agent, input.session_id);
  switch (input.hook_event_name) {
    case "UserPromptSubmit":
      return onPrompt(agent, input, file, part);
    case "SessionStart":
      return onStart(agent, input, file, part);
  }
  if (part) return; // the map hook has nothing to say at any other moment
  switch (input.hook_event_name) {
    case "SubagentStart":
      return onSubagent(agent, input, file);
    case "SessionEnd":
      return onEnd(agent, input, file);
    case "Stop":
    case "StopFailure": // a turn that died on an error still left its message in the history
      return onStop(agent, input, file);
  }
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

function show(args) {
  const id = args.find((a) => !a.startsWith("--")) ?? "steve-jobs";
  const mind = meta(id);
  if (!mind) {
    console.log(`no mind called ${id}`);
    process.exitCode = 1;
    return;
  }
  const c = core(mind);
  const m = mapText(mind);
  if (!args.includes("--sizes")) console.log(`${c}\n\n${m}\n`);
  console.log(
    `core ${c.length.toLocaleString("en")} characters, map ${m.length.toLocaleString("en")}, ` +
      `each under Claude Code's ${LIMIT.toLocaleString("en")}; together about ` +
      `${Math.ceil((c.length + m.length) / 4).toLocaleString("en")} tokens, under Codex's ${CODEX_LIMIT.toLocaleString("en")}`,
  );
}

export function checkMind(id) {
  const problems = [];
  const mind = meta(id);
  if (!mind) return { mind: null, problems: [`minds/${id}: mind.json is missing or has no name`], list: [] };
  if (!mind.switch) problems.push("mind.json has no switch word");
  const c = core(mind);
  const m = mapText(mind);
  if (!c) problems.push("core.md is missing or empty");
  if (c.length > LIMIT) problems.push(`core.md is ${c.length} characters, over the ${LIMIT} one hand-off takes`);
  if (!m) problems.push("map.md is missing or empty");
  if (m.length > LIMIT) problems.push(`the map is ${m.length} characters, over the ${LIMIT} one hand-off takes`);
  if (Math.ceil((c.length + m.length) / 4) > CODEX_LIMIT) problems.push(`core and map together are over Codex's ${CODEX_LIMIT} tokens`);
  if (!helpers(mind)) problems.push("helpers.md is missing or empty");

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
  return { mind, problems, list, core: c, map: m };
}

function check() {
  let dirs = [];
  try {
    dirs = fs.readdirSync(MINDS).filter((d) => fs.existsSync(path.join(MINDS, d, "mind.json")));
  } catch {}
  let bad = 0;
  for (const id of dirs) {
    const { mind, problems, list, core: c = "", map: m = "" } = checkMind(id);
    const n = (folder) => list.filter((p) => p.folder === folder).length;
    const links = list.map((p) => p.links.length).sort((a, b) => a - b);
    console.log(
      `${mind?.name ?? id}: ${list.length} pages (${n("life")} memories, ${n("works")} works), ` +
        `core ${c.length.toLocaleString("en")} characters, map ${m.length.toLocaleString("en")}` +
        (links.length ? `, links per page ${links[0]}-${links.at(-1)}` : ""),
    );
    for (const p of problems) console.log(`  ${p}`);
    if (!problems.length) console.log("  every page is well formed and on the map, and every page reaches every other");
    bad += problems.length;
  }
  process.exitCode = bad ? 1 : 0;
}

// ---------------------------------------------------------------- install

const AGENT_HOME = process.env.CONSCIOUS_AGENT_HOME || os.homedir();
const AGENT_FILES = {
  "claude-code": path.join(AGENT_HOME, ".claude", "settings.json"),
  codex: path.join(AGENT_HOME, ".codex", "hooks.json"),
};

function ours(handler) {
  return [handler.command, ...(handler.args ?? [])].some((x) => String(x).includes("conscious.mjs"));
}

// Opening a page of a mind must never bring up a permission prompt, wherever the person's project
// is. Claude Code asks before reading outside the project unless a rule allows it, so install adds
// one rule that lets it read the minds folder and nothing else: no edits, no other paths. Paths in
// rules are written from the filesystem root after //, and Windows drives as /e/..., per its docs.
export function readRule(dir = MINDS) {
  const p = dir.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
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
  const script = SELF.replace(/\\/g, "/");
  if (agent === "claude-code") {
    // Exec form: Node runs straight away, without a shell starting first, and by its exact path,
    // so the hooks work where PATH has no node, as in an app opened from the dock.
    const h = (timeout, part) => ({
      type: "command",
      command: node,
      args: [script, "hook", agent, ...(part ? [part] : [])],
      timeout,
    });
    return {
      UserPromptSubmit: [{ hooks: [h(10), h(10, "map")] }],
      SessionStart: [
        { matcher: "resume|clear|compact|fork", hooks: [h(10)] },
        { matcher: "compact", hooks: [h(10, "map")] },
      ],
      SessionEnd: [{ matcher: "clear", hooks: [h(5)] }],
      SubagentStart: [{ hooks: [h(10)] }],
      Stop: [{ hooks: [h(10)] }],
      StopFailure: [{ hooks: [h(10)] }],
    };
  }
  // Codex runs a hook through a shell, and only a bare first word works in every shell, so a Node
  // whose path has a space in it goes by name.
  const bare = /\s/.test(node) ? "node" : process.platform === "win32" ? node.replace(/\//g, "\\") : node;
  const h = (timeout, limit) => ({
    type: "command",
    command: `${bare} "${script}" hook ${agent}`,
    timeout,
    ...(limit ? { additionalContextLimit: limit } : {}),
  });
  return {
    UserPromptSubmit: [{ hooks: [h(10, CODEX_LIMIT)] }],
    SessionStart: [{ matcher: "^(resume|clear|compact|fork)$", hooks: [h(10, CODEX_LIMIT)] }],
    SessionEnd: [{ hooks: [h(3)] }], // Codex allows a session's end three seconds at most
    SubagentStart: [{ hooks: [h(10, 1000)] }],
    Stop: [{ hooks: [h(10)] }],
  };
}

const NAMES = { "claude-code": "Claude Code", codex: "Codex" };

function install(agents, { remove = false, node = process.execPath } = {}) {
  let done = 0;
  for (const agent of agents) {
    const file = AGENT_FILES[agent];
    if (!fs.existsSync(path.dirname(file))) {
      if (!remove) console.log(`${NAMES[agent]}: not on this machine`);
      continue;
    }
    const config = readJSON(file) ?? (fs.existsSync(file) ? null : {});
    if (config === null) {
      console.log(`${NAMES[agent]}: ${file} isn't valid JSON, so it was left alone`);
      process.exitCode = 1;
      continue;
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
    // Codex reads files through its shell, which its sandbox never stops from reading.
    if (agent === "claude-code") grant(config, remove);
    if (remove && !Object.keys(config).length) {
      fs.rmSync(file, { force: true }); // a settings file with nothing in it is only what install left
    } else {
      fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    }
    done++;
    if (remove) {
      console.log(`${NAMES[agent]}: taken out of ${file}`);
      continue;
    }
    console.log(`${NAMES[agent]}: in ${file}`);
    if (agent === "claude-code") console.log(`  its pages open without a permission prompt: ${readRule()}`);
    if (agent === "codex") console.log("  trust it once: /hooks in the CLI, or Settings > Hooks in the app");
  }
  if (!remove && done) {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(MARK, "Conscious keeps its switch files here. `uninstall --all` removes this folder.\n");
    const word = minds()[0]?.switch ?? "steve";
    console.log(`\nIn a new session, type "${word} on". "${word} off" gives you your own agent back.`);
  }
  return done;
}

// Leaves nothing behind: the switch files, the program and its brains, and a Node it brought.
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
      hook(args[0] === "codex" ? "codex" : "claude-code", input, args[1] === "map" ? "map" : null);
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
      "conscious hook claude-code|codex [map]  |  show [mind] [--sizes]  |  check  |  " +
        "install [claude-code|codex] [--node <path>]  |  uninstall [claude-code|codex] [--all]",
    );
  }
}
