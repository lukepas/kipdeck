#!/usr/bin/env node
// rundown-version: 1.4.0
import { execFile, spawn, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, promises, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lstat, open, realpath } from "node:fs/promises";
//#region src/shared/rundown/schema.ts
var STATUSES = [
	"done",
	"in-progress",
	"not-started",
	"stuck"
];
var STATUS_LABEL = {
	done: "Done",
	"in-progress": "In progress",
	"not-started": "Not started",
	stuck: "Stuck"
};
/** Limits shared by the skill's collector and the office's. */
var LIMITS = {
	files: 5e4,
	bytesPerFile: 1e6,
	bytesPerRun: 2e8,
	skillMs: 2e4,
	officeMs: 15e3,
	gitTimeoutMs: 1e4,
	gitMaxBuffer: 16777216,
	branches: 40,
	worktrees: 40,
	recentCommits: 30,
	heatmapDays: 182,
	largest: 15,
	uncommittedPaths: 50,
	todoLocations: 40,
	commitPaths: 20,
	dirs: 1500,
	/** The office reads the skill's rundown.json up to this size. */
	skillFileBytes: 524288
};
var emptyMetrics = () => ({
	lines: 0,
	files: 0,
	testFiles: 0,
	todo: 0,
	fixme: 0,
	commits30d: 0,
	lastCommit: null,
	uncommitted: 0
});
//#endregion
//#region src/shared/rundown/diff.ts
/** The compact projection of a rundown the next run diffs against. */
function toState(r) {
	const git = r.facts.git;
	return {
		schemaVersion: 1,
		generatedAt: r.generatedAt,
		head: r.project.head?.sha ?? null,
		parts: r.parts.map((p) => ({
			id: p.id,
			name: p.name,
			status: p.status,
			waitingOn: p.waitingOn,
			lines: p.metrics.lines,
			testFiles: p.metrics.testFiles,
			todo: p.metrics.todo
		})),
		milestones: r.milestones.map((m) => ({
			id: m.id,
			name: m.name,
			done: m.items.filter((i) => i.done).length,
			total: m.items.length,
			state: m.state
		})),
		openDecisions: r.decisions.filter((d) => !d.answer).map((d) => d.id),
		answeredDecisions: r.decisions.filter((d) => d.answer).map((d) => d.id),
		branches: Object.fromEntries((git?.branches ?? []).map((b) => [b.name, b.sha])),
		testFiles: r.facts.files.tests.files,
		todo: r.facts.files.todo.todo + r.facts.files.todo.fixme + r.facts.files.todo.hack,
		uncommitted: git ? git.uncommitted.staged + git.uncommitted.modified + git.uncommitted.deleted + git.uncommitted.untracked : 0
	};
}
var str = (v, fallback = "") => typeof v === "string" ? v : fallback;
var num$1 = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
/** "in progress" (project-map's spelling) and friends to a Status. */
function statusOf(v) {
	const s = str(v).toLowerCase().replace(/[\s_]+/g, "-");
	return STATUSES.includes(s) ? s : "not-started";
}
/** A state.json as written by this version or by the project-map agent, or null when it's neither. */
function readState(raw) {
	if (!raw || typeof raw !== "object") return null;
	const o = raw;
	const parts = Array.isArray(o.parts) ? o.parts.filter((p) => p && typeof p.id === "string") : [];
	const milestones = Array.isArray(o.milestones) ? o.milestones.filter((m) => m && typeof m.id === "string") : [];
	const legacy = o.schemaVersion !== 1;
	const open = Array.isArray(o.openDecisions) ? o.openDecisions : Array.isArray(o.open_decisions) ? o.open_decisions : [];
	return {
		schemaVersion: 1,
		generatedAt: str(o.generatedAt, str(o.updated)),
		head: str(o.head, str(o.last_commit)) || null,
		parts: parts.map((p) => ({
			id: p.id,
			name: str(p.name, p.id),
			status: statusOf(p.status),
			waitingOn: str(p.waitingOn, str(p.waiting_on)) || null,
			lines: legacy ? -1 : num$1(p.lines),
			testFiles: num$1(p.testFiles),
			todo: num$1(p.todo)
		})),
		milestones: milestones.map((m) => ({
			id: m.id,
			name: str(m.name, m.id),
			done: num$1(m.done),
			total: num$1(m.total),
			state: m.state === "done" || m.state === "active" || m.state === "ahead" ? m.state : num$1(m.total) > 0 && num$1(m.done) >= num$1(m.total) ? "done" : "ahead"
		})),
		openDecisions: open.filter((x) => typeof x === "string"),
		answeredDecisions: Array.isArray(o.answeredDecisions) ? o.answeredDecisions.filter((x) => typeof x === "string") : [],
		branches: o.branches && typeof o.branches === "object" ? Object.fromEntries(Object.entries(o.branches).filter(([, v]) => typeof v === "string")) : {},
		testFiles: legacy ? -1 : num$1(o.testFiles),
		todo: legacy ? -1 : num$1(o.todo),
		uncommitted: legacy ? -1 : num$1(o.uncommitted)
	};
}
var plural$1 = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
var signed = (n) => n > 0 ? `+${n}` : String(n);
/** Every change from `prev` to `next`, heaviest first. */
function diffStates(prev, next, since) {
	if (!prev) return [];
	const out = [];
	const add = (c) => out.push(c);
	const before = new Map(prev.parts.map((p) => [p.id, p]));
	const after = new Map(next.parts.map((p) => [p.id, p]));
	for (const p of next.parts) {
		const was = before.get(p.id);
		if (!was) {
			add({
				kind: "part-added",
				ref: p.id,
				from: null,
				to: p.status,
				text: `New part: ${p.name} (${STATUS_LABEL[p.status].toLowerCase()})`,
				weight: 70
			});
			continue;
		}
		if (was.status !== p.status) {
			const why = p.status === "stuck" && p.waitingOn ? `, waiting on ${p.waitingOn}` : "";
			add({
				kind: "part-status",
				ref: p.id,
				from: was.status,
				to: p.status,
				text: `${p.name}: ${STATUS_LABEL[was.status].toLowerCase()} to ${STATUS_LABEL[p.status].toLowerCase()}${why}`,
				weight: p.status === "stuck" ? 120 : 100
			});
		}
		const d = p.lines - was.lines;
		if (was.lines >= 0 && d !== 0 && (Math.abs(d) > 200 || was.lines > 0 && Math.abs(d) / was.lines > .05)) add({
			kind: "lines",
			ref: p.id,
			from: was.lines,
			to: p.lines,
			text: `${p.name}: ${signed(d)} ${Math.abs(d) === 1 ? "line" : "lines"} (${p.lines.toLocaleString("en-US")} now)`,
			weight: 30 + Math.min(20, Math.abs(d) / 200)
		});
	}
	for (const p of prev.parts) if (!after.has(p.id)) add({
		kind: "part-removed",
		ref: p.id,
		from: p.status,
		to: null,
		text: `Part gone: ${p.name}`,
		weight: 60
	});
	const msBefore = new Map(prev.milestones.map((m) => [m.id, m]));
	for (const m of next.milestones) {
		const was = msBefore.get(m.id);
		if (m.state === "done" && was && was.state !== "done") add({
			kind: "milestone-done",
			ref: m.id,
			from: was.done,
			to: m.done,
			text: `${m.id} ${m.name} is done`,
			weight: 110
		});
		else if (was && m.done !== was.done) add({
			kind: "milestone-progress",
			ref: m.id,
			from: was.done,
			to: m.done,
			text: `${m.id} ${m.name}: ${m.done} of ${plural$1(m.total, "item")} done (was ${was.done})`,
			weight: 80
		});
	}
	const wasOpen = new Set(prev.openDecisions);
	const wasAnswered = new Set(prev.answeredDecisions);
	const openNow = new Set(next.openDecisions);
	for (const id of next.openDecisions) if (!wasOpen.has(id) && !wasAnswered.has(id)) add({
		kind: "decision-new",
		ref: id,
		from: null,
		to: "open",
		text: `New decision for you: ${id}`,
		weight: 90
	});
	for (const id of next.answeredDecisions) if (wasOpen.has(id) && !openNow.has(id)) add({
		kind: "decision-answered",
		ref: id,
		from: "open",
		to: "answered",
		text: `You answered ${id}`,
		weight: 85
	});
	if (since?.rewritten) add({
		kind: "history-rewritten",
		ref: null,
		from: prev.head,
		to: next.head,
		text: "History was rewritten: the last rundown's commit is no longer on this branch",
		weight: 75
	});
	else if (since && since.count > 0) add({
		kind: "commits",
		ref: null,
		from: prev.head,
		to: next.head,
		text: `${plural$1(since.count, "new commit")} on this branch`,
		weight: 50 + Math.min(20, since.count)
	});
	for (const [name, sha] of Object.entries(next.branches)) {
		const was = prev.branches[name];
		if (!was) add({
			kind: "branch-added",
			ref: name,
			from: null,
			to: sha,
			text: `New branch ${name}`,
			weight: 40
		});
		else if (was !== sha) add({
			kind: "branch-moved",
			ref: name,
			from: was,
			to: sha,
			text: `${name} moved to ${sha.slice(0, 7)}`,
			weight: 20
		});
	}
	for (const name of Object.keys(prev.branches)) if (!(name in next.branches)) add({
		kind: "branch-removed",
		ref: name,
		from: prev.branches[name],
		to: null,
		text: `Branch ${name} is gone`,
		weight: 35
	});
	if (prev.testFiles >= 0 && next.testFiles !== prev.testFiles) add({
		kind: "tests",
		ref: null,
		from: prev.testFiles,
		to: next.testFiles,
		text: `Test files ${signed(next.testFiles - prev.testFiles)} (${next.testFiles} now)`,
		weight: 45
	});
	if (prev.todo >= 0 && next.todo !== prev.todo) add({
		kind: "todo",
		ref: null,
		from: prev.todo,
		to: next.todo,
		text: `TODO and FIXME ${signed(next.todo - prev.todo)} (${next.todo} now)`,
		weight: 25
	});
	if (prev.uncommitted >= 0 && next.uncommitted !== prev.uncommitted) add({
		kind: "uncommitted",
		ref: null,
		from: prev.uncommitted,
		to: next.uncommitted,
		text: next.uncommitted ? `${plural$1(next.uncommitted, "uncommitted file")} (was ${prev.uncommitted})` : "Everything is committed now",
		weight: 15
	});
	return out.sort((a, b) => b.weight - a.weight);
}
//#endregion
//#region src/shared/rundown/paths.ts
/** Folders never listed: git's own, the office's data (with the workers' worktrees), our output, dependencies. */
var SKIP_DIR_SEGMENTS = /* @__PURE__ */ new Set([
	".git",
	"node_modules",
	".agent-office",
	".rundown",
	".project-map"
]);
/** Whether a path is left out altogether. */
function excludedPath(p) {
	if (p.startsWith(".claude/worktrees/")) return true;
	for (const seg of p.split("/").slice(0, -1)) if (SKIP_DIR_SEGMENTS.has(seg)) return true;
	return false;
}
/** Tools' own caches and snapshots that land in a checkout untracked (a browser tool's page dumps, build caches). */
var TOOL_CACHE_SEGMENTS = /* @__PURE__ */ new Set([
	".playwright-mcp",
	".cache",
	".turbo",
	".pytest_cache",
	".mypy_cache",
	".ruff_cache",
	".parcel-cache",
	".next",
	".nuxt",
	".svelte-kit",
	"__pycache__",
	".venv",
	"venv",
	".tox",
	".gradle",
	".idea",
	".vscode"
]);
/** Whether an untracked path is a tool's cache rather than the project's own work (left out of the counts). */
function toolCachePath(p) {
	for (const seg of p.split("/").slice(0, -1)) if (TOOL_CACHE_SEGMENTS.has(seg)) return true;
	return false;
}
/**
* File names that may hold secrets or personal data: counted, never opened. Keys and keystores,
* .env files, anything named for credentials, secrets or a vault, database dumps, backups and logs.
*/
function sensitivePath(p) {
	const name = (p.split("/").pop() ?? "").toLowerCase();
	if (name.startsWith(".env")) return true;
	if (/\.(pem|key|p12|pfx|jks|keystore|sql|dump|bak|log)$/.test(name)) return true;
	if (/^id_(rsa|ed25519|ecdsa|dsa)/.test(name)) return true;
	if (/credential|secret|vault|\.netrc|\.npmrc|\.pypirc/.test(name)) return true;
	const dir = p.toLowerCase();
	return /(^|\/)\.(ssh|aws|kube|gnupg)\//.test(dir);
}
/** Listed and counted, but not in the line totals: lockfiles, minified and built output. */
function generatedPath(p) {
	const name = p.split("/").pop() ?? "";
	if (/(^|\/)(dist|build|out|coverage|vendor)\//.test(p)) return true;
	if (/\.min\.[a-z]+$/i.test(name) || /\.map$/.test(name)) return true;
	return /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum|bun\.lockb)$/.test(name);
}
/** Never read for lines: media, fonts, archives and other binaries (by extension, before opening). */
var BINARY_EXT = new Set("png jpg jpeg gif webp avif ico bmp tiff psd svgz mp4 mov webm mkv avi mp3 wav ogg flac m4a woff woff2 ttf otf eot zip gz tgz bz2 xz 7z rar jar war ear class pdf doc docx xls xlsx ppt pptx glb gltf bin fbx obj blend hdr exr ktx2 wasm so dylib dll exe node pyc o a lib sqlite db".split(" "));
function binaryByName(p) {
	const ext = (p.split(".").pop() ?? "").toLowerCase();
	return p.includes(".") && BINARY_EXT.has(ext);
}
var LANG = {
	ts: "TypeScript",
	tsx: "TypeScript",
	mts: "TypeScript",
	cts: "TypeScript",
	js: "JavaScript",
	jsx: "JavaScript",
	mjs: "JavaScript",
	cjs: "JavaScript",
	py: "Python",
	rb: "Ruby",
	go: "Go",
	rs: "Rust",
	java: "Java",
	kt: "Kotlin",
	kts: "Kotlin",
	scala: "Scala",
	cs: "C#",
	fs: "F#",
	vb: "Visual Basic",
	php: "PHP",
	swift: "Swift",
	m: "Objective-C",
	mm: "Objective-C",
	c: "C",
	h: "C",
	cc: "C++",
	cpp: "C++",
	cxx: "C++",
	hpp: "C++",
	dart: "Dart",
	ex: "Elixir",
	exs: "Elixir",
	erl: "Erlang",
	clj: "Clojure",
	hs: "Haskell",
	lua: "Lua",
	r: "R",
	jl: "Julia",
	sol: "Solidity",
	vue: "Vue",
	svelte: "Svelte",
	astro: "Astro",
	html: "HTML",
	htm: "HTML",
	css: "CSS",
	scss: "CSS",
	sass: "CSS",
	less: "CSS",
	md: "Markdown",
	mdx: "Markdown",
	rst: "reStructuredText",
	txt: "Text",
	json: "JSON",
	jsonc: "JSON",
	yaml: "YAML",
	yml: "YAML",
	toml: "TOML",
	xml: "XML",
	ini: "INI",
	sh: "Shell",
	bash: "Shell",
	zsh: "Shell",
	ps1: "PowerShell",
	bat: "Batch",
	sql: "SQL",
	graphql: "GraphQL",
	gql: "GraphQL",
	proto: "Protobuf",
	tf: "Terraform",
	hcl: "Terraform",
	glsl: "GLSL",
	wgsl: "WGSL",
	svg: "SVG"
};
/** A file's language by its extension (or its name: Dockerfile, Makefile), "Other" when unknown. */
function languageOf(p) {
	const name = p.split("/").pop() ?? "";
	if (/^Dockerfile/.test(name)) return "Dockerfile";
	if (/^(Makefile|GNUmakefile)$/.test(name)) return "Makefile";
	return LANG[name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : ""] ?? "Other";
}
/** A test file by its path: a tests folder, or a .test./.spec./_test name. */
function testPath(p) {
	const name = p.split("/").pop() ?? "";
	if (/\.(test|spec|e2e)\.[a-z0-9]+$/i.test(name) || /_test\.(go|py|rb|exs?)$/.test(name) || /^test_.*\.py$/.test(name) || /Tests?\.(java|kt|cs)$/.test(name)) return true;
	return /(^|\/)(tests?|__tests__|spec|e2e)\//.test(p) && /\.[a-z]+$/i.test(name) && languageOf(p) !== "Markdown" && languageOf(p) !== "JSON";
}
/** The first folder of a path ("." for a file at the root). */
function topFolder(p) {
	const i = p.indexOf("/");
	return i < 0 ? "." : p.slice(0, i);
}
/** The folder bucket a file counts toward: its folder, cut to `depth` levels ("" at the root). */
function bucketOf(p, depth = 4) {
	return p.split("/").slice(0, -1).slice(0, depth).join("/");
}
/** A glob's literal folder prefix: "src/server/**" -> "src/server", "src/*.ts" -> "src", "README.md" -> "README.md". */
function globBase(glob) {
	const segs = glob.replace(/^\.\//, "").replace(/\/+$/, "").split("/");
	const out = [];
	for (const s of segs) {
		if (/[*?[\]{}]/.test(s)) break;
		out.push(s);
	}
	return out.join("/");
}
/** Whether `glob` covers `path` (a file or a folder bucket): its literal prefix contains it, or is it. */
function globCovers(glob, path) {
	const base = globBase(glob);
	if (!base) return true;
	return path === base || path.startsWith(`${base}/`);
}
/** How specific a glob is: the depth of its literal prefix. The most specific part wins a path. */
function globDepth(glob) {
	const base = globBase(glob);
	return base ? base.split("/").length : 0;
}
/** The part a path belongs to: the one with the most specific glob covering it, else null. */
function partOfPath(parts, path) {
	let best = null;
	let depth = -1;
	for (const part of parts) for (const g of part.paths) {
		if (!globCovers(g, path)) continue;
		const d = globDepth(g);
		if (d > depth) {
			depth = d;
			best = part.id;
		}
	}
	return best;
}
/** A remote URL as owner/name, credentials and host left out; null when it isn't one. */
function remoteName(url) {
	if (!url) return null;
	const clean = url.trim().replace(/^[a-z+]+:\/\/[^@/]*@/i, (m) => m.replace(/\/\/[^@/]*@/, "//"));
	const m = /[:/]([^/:]+)\/([^/]+?)(\.git)?\/?$/.exec(clean);
	return m ? `${m[1]}/${m[2]}` : null;
}
//#endregion
//#region src/shared/rundown/html-sections.ts
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
var fmt = (n) => n.toLocaleString("en-US");
var plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
/** The part's folders one level under its own paths, for the cells inside its tile. */
function partFolders(r, part) {
	const out = /* @__PURE__ */ new Map();
	for (const d of r.facts.files.dirs) {
		if (!d.lines || partOfPath(r.parts, d.path) !== part.id) continue;
		const base = part.paths.map((g) => g.split("/").filter((s) => !/[*?[\]{}]/.test(s)).join("/")).find((b) => !b || d.path === b || d.path.startsWith(`${b}/`)) ?? "";
		const rest = base ? d.path.slice(base.length).replace(/^\//, "") : d.path;
		const key = rest ? `${base ? `${base}/` : ""}${rest.split("/")[0]}` : base || ".";
		out.set(key, (out.get(key) ?? 0) + d.lines);
	}
	return [...out.entries()].map(([path, lines]) => ({
		path,
		lines
	})).sort((a, b) => b.lines - a.lines);
}
//#endregion
//#region src/shared/rundown/page-css.ts
var BASE_CSS = (accent, accentLight) => `
:root{--bg:#0d0f13;--surface:#15181f;--surface2:#1d212a;--line:#2a2f3a;--text:#eceef2;--muted:#a1a9b6;--accent:${accent};--accent-soft:color-mix(in srgb,${accent} 12%,transparent);--accent-line:color-mix(in srgb,${accent} 55%,transparent);--on-accent:#16130f;--done:#4ade80;--progress:#60a5fa;--idle:#a1a9b6;--stuck:#f87171;--amber:#fbbf24;--l0:#60a5fa;--l1:#fbbf24;--l2:#a78bfa;--l3:#2dd4bf;--l4:#f472b6;--l5:#a3e635;--l6:#fb923c;--l7:#94a3b8;color-scheme:dark}
:root[data-theme=light]{--bg:#f6f7f9;--surface:#ffffff;--surface2:#eef0f4;--line:#d9dde4;--text:#15181e;--muted:#525a67;--accent:${accentLight};--accent-soft:color-mix(in srgb,${accentLight} 9%,transparent);--accent-line:color-mix(in srgb,${accentLight} 55%,transparent);--on-accent:#ffffff;--done:#15803d;--progress:#1d4ed8;--idle:#5b6472;--stuck:#b91c1c;--amber:#a16207;--l0:#2563eb;--l1:#b45309;--l2:#7c3aed;--l3:#0f766e;--l4:#be185d;--l5:#4d7c0f;--l6:#c2410c;--l7:#64748b;color-scheme:light}
@media print{:root{--bg:#fff;--surface:#fff;--surface2:#f1f1f1;--line:#ccc;--text:#000;--muted:#444}.icon-btn,.rail{display:none}header.top{position:static}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-padding-top:96px}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:break-word}
a{color:var(--accent)}code{font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--surface2);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wrap{max-width:1080px;margin:0 auto;padding-left:16px;padding-right:16px}
.sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.skip{position:absolute;left:-999px;top:8px;z-index:20;background:var(--surface);padding:8px 12px;border-radius:8px}.skip:focus{left:8px}
.muted{color:var(--muted)}.small{font-size:13px}
.clamp1{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden}
.clamp2{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.st-done{color:var(--done)}.st-in-progress{color:var(--progress)}.st-not-started{color:var(--idle)}.st-stuck{color:var(--stuck)}
.g{display:inline-block;width:1.1em;text-align:center;flex:none}
.ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;vertical-align:-3px}
summary{cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}
.chip{position:relative;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:12.5px;line-height:1.5;color:var(--text);background:var(--surface);text-decoration:none;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
a.chip:hover,summary.chip:hover{border-color:var(--accent-line)}
.chip.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--surface2)}
.chip.muted,.chip.t-muted{color:var(--muted)}.chip.t-stuck{color:var(--stuck);border-color:color-mix(in srgb,var(--stuck) 45%,transparent)}.chip.t-done{color:var(--done);border-color:color-mix(in srgb,var(--done) 40%,transparent)}.chip.t-accent{color:var(--accent);border-color:var(--accent-line)}
.pchip{position:relative;display:inline-flex;align-items:center;gap:3px;border:1px solid var(--line);background:var(--surface2);border-radius:999px;padding:2px 10px 2px 6px;font-size:12.5px;cursor:pointer;white-space:nowrap;max-width:15em;flex:none}
.pchip span:not(.g){overflow:hidden;text-overflow:ellipsis}.pchip:hover{border-color:var(--accent-line)}
.pchip.neutral{padding-left:10px;color:var(--muted);background:transparent}
.alias{position:absolute;top:-96px;left:0;width:0;height:0}
.cmore summary{display:flex;align-items:baseline;gap:6px}.cmore summary>span:first-child{flex:0 1 auto;min-width:0}
.cmore .more::after{content:"more";color:var(--accent);font-size:12.5px;white-space:nowrap}.cmore[open] .more::after{content:"less"}
.cmore[open] summary>span:first-child{-webkit-line-clamp:unset}.cmore.fits .more{display:none}.cmore.fits summary{cursor:default}
.show-s{display:none}
/* header */
header.top{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:10px;height:48px;min-width:0}
.brand{display:flex;align-items:center;gap:8px;margin:0;font-size:16px;font-weight:700;letter-spacing:-.01em;min-width:0}
.bdot{width:10px;height:10px;border-radius:50%;background:var(--accent);flex:none;box-shadow:0 0 0 4px var(--accent-soft)}
.bname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.upd{color:var(--muted);font-size:13px;white-space:nowrap}.grow{flex:1}
@media (max-width:480px){.upd{display:none}}
.icon-btn{display:grid;place-items:center;width:44px;height:44px;margin-right:-8px;border-radius:10px;border:0;background:transparent;color:var(--muted);cursor:pointer;flex:none}
@media (hover:hover){.icon-btn:hover{color:var(--text);background:var(--surface2)}}
.icon-btn .ic{width:20px;height:20px}[data-theme=dark] .i-sun,[data-theme=light] .i-moon{display:none}
.rail ol{list-style:none;margin:0;padding:0;display:flex;align-items:center;gap:2px;height:34px}
.rail a{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:13.5px;font-weight:600}
.rail li:first-child a{margin-left:-10px}
.rail a:hover{color:var(--text)}.rail a.on{color:var(--text);background:var(--surface2)}.rail a.on .num{color:var(--accent)}
.rail .num{font-size:15px}.rail .sep{color:var(--line)}.rail .lbl-s{display:none}
.rbadge,.count{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0;background:var(--surface2);color:var(--text);border:1px solid var(--line)}
.rbadge.warn,.count.warn{background:color-mix(in srgb,var(--stuck) 18%,transparent);color:var(--stuck);border-color:color-mix(in srgb,var(--stuck) 45%,transparent)}
.note{background:var(--accent-soft);border:1px solid var(--accent-line);padding:8px 12px;border-radius:10px;font-size:14px;margin:0 0 12px}
footer{margin:28px 0 40px;color:var(--muted);font-size:12.5px}footer code{font-size:11.5px}
.home-btn{display:inline-flex;align-items:center;gap:6px;flex:none;min-height:34px;padding:0 10px;margin-left:-6px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--muted);text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap}
.home-btn:hover{color:var(--text);border-color:var(--accent-line)}
.home-btn .hb-s{display:none}
@media (max-width:640px){.home-btn{padding:0 8px}.home-btn .hb-l{display:none}.home-btn .hb-s{display:inline}.hide-s{display:none!important}}
@media (pointer:coarse){.home-btn{min-height:40px;min-width:40px;justify-content:center}}
`;
var PAGE_CSS = `
/* sections */
.desc{margin:16px 0 0;color:var(--muted);font-size:14px;max-width:92ch}
.desc summary{display:flex;align-items:baseline;gap:6px}.desc .clamp1{flex:0 1 auto}
.desc .more::after{content:"more";color:var(--accent);font-size:12.5px;white-space:nowrap}.desc[open] .more::after{content:"less"}
.desc[open] .clamp1{-webkit-line-clamp:unset}.desc.fits .more{display:none}.desc.fits summary{cursor:default}
.sec{padding-top:30px}.intro{padding-top:20px}
.sh{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.sh .num{font-size:18px;color:var(--accent);letter-spacing:0}
.tagpill{font-size:11.5px;font-weight:700;letter-spacing:.02em;text-transform:none;color:var(--accent);border:1px solid var(--accent-line);border-radius:999px;padding:0 8px}
/* road */
.track{list-style:none;margin:0;padding:0;display:flex}
.node{flex:1 1 0;min-width:0;position:relative}
.conn{position:absolute;top:46px;right:50%;width:100%;height:4px;overflow:visible;z-index:0}
.conn line{stroke:var(--accent);stroke-width:3}.conn.dashed line{stroke:var(--muted);stroke-opacity:.55;stroke-width:2;stroke-dasharray:5 5}
.first-d>.conn{display:none}
.nflag{height:22px;display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap}
.nflag .ic{width:14px;height:14px}
.nbtn{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;width:100%;padding:0 4px 6px;border:0;background:none;text-decoration:none;color:inherit;cursor:pointer;border-radius:12px;text-align:center}
.ndw{height:50px;display:flex;align-items:center;justify-content:center}
.ndot{width:20px;height:20px;border-radius:50%;border:2px dashed var(--muted);background:var(--bg);box-shadow:0 0 0 4px var(--bg)}
.ms-done .ndot{border:0;background:var(--accent)}
.ringw{position:relative;width:56px;height:56px;display:grid;place-items:center;border-radius:50%;background:var(--bg);box-shadow:0 0 0 4px var(--bg),0 0 0 9px var(--accent-soft)}
.ring{position:absolute;inset:0;width:100%;height:100%}.ring-bg{fill:none;stroke:var(--surface2);stroke-width:6}.ring-fg{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round}
.ring-t{position:relative;font-size:13px;font-weight:800}
.nlab{display:flex;flex-direction:column;align-items:center;gap:1px;margin-top:8px;min-width:0;max-width:100%}
.nlab b{font-size:13px}.focus .nlab b{color:var(--accent)}
.nname{font-size:13.5px;line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-width:100%}
.nmeta{font-size:12px;color:var(--muted)}.ms-active .nmeta{color:var(--text);font-weight:600}
.ms-ahead .nname,.ms-ahead .nlab b{color:var(--muted)}
.nbtn:hover .nname{color:var(--accent)}.node.sel .nbtn{background:var(--surface2)}
.dbadge{margin-top:4px;font-size:11px;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:0 7px;white-space:nowrap}
.more-m{display:none}.hide-d{display:none}.fold:not(.first-d){display:none}
.track.unfold .hide-d{display:block}.track.unfold .fold{display:none}.track.unfold .fold+.node>.conn{display:none}
.since{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:16px 0 0;font-size:13px}
.since-l{color:var(--muted);font-weight:600}
.since-more summary{color:var(--accent)}.since-more ul{margin:8px 0 0;padding-left:18px;color:var(--muted)}.since-more[open]{flex-basis:100%}
.checklist{margin-top:14px}
.ck{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:0 16px 4px}
.ck>summary{padding:12px 0 6px}.ck-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.ck.ck-done p{margin:0;padding:14px 0 12px;display:flex;gap:8px;align-items:center}
.dw{margin:0 0 6px;font-size:13px;color:var(--muted)}
.items{list-style:none;margin:0;padding:0}
.it{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line);min-height:44px}
.it-t{flex:1;min-width:0}.it.done .it-t{color:var(--muted)}
.ck-g{width:18px;text-align:center;flex:none;color:var(--muted);font-weight:700}
.it.next{border-left:3px solid var(--accent);margin-left:-16px;padding-left:13px;background:linear-gradient(90deg,var(--accent-soft),transparent 70%)}
.tag-next{font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap;text-decoration:none}
.it.fold{display:block}.it.fold summary{color:var(--muted);font-size:13.5px;min-height:30px;display:flex;align-items:center;gap:10px}
.others{margin-top:6px}.others>summary{color:var(--muted);font-size:13.5px;min-height:44px;display:flex;align-items:center;gap:8px}.others>summary::before{content:"\\25B8";color:var(--accent)}.others[open]>summary::before{content:"\\25BE"}
.msd{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:0 16px 4px;margin-top:8px}.msd>summary{padding:10px 0}
/* next */
.next-card{display:flex;gap:16px;align-items:flex-start;background:var(--accent-soft);border:1px solid var(--accent-line);border-left:4px solid var(--accent);border-radius:14px;padding:18px 20px}
.next-card.empty{background:var(--surface);border-color:var(--line)}.next-card.empty p{margin:0}
.next-ic{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--accent);color:var(--on-accent)}
.next-body{flex:1;min-width:0}.next-t{margin:0;font-size:20px;line-height:1.3;font-weight:650}
.next-why{margin:6px 0 0;color:var(--muted);font-size:14px}
.next-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
.btn-ghost{display:inline-flex;align-items:center;gap:6px;margin-left:auto;min-height:36px;padding:4px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);cursor:pointer;font-size:13px;font-weight:600}
.btn-ghost:hover{border-color:var(--accent-line);color:var(--accent)}.btn-ghost .ic{width:16px;height:16px}
/* needs */
.anchor{display:block;position:relative;top:-96px}
.ok-line{margin:0;color:var(--done);font-weight:600}
.dec-grid{display:grid;align-items:start;grid-template-columns:minmax(0,1fr);gap:12px}
@media (min-width:860px){.dec-grid.two{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-flow:row dense}}
.dec{display:flex;flex-direction:column;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px;min-width:0}
.dec:target{border-color:var(--accent)}
.dec-top{display:flex;align-items:flex-start;gap:10px}
.did{flex:none;font-size:12px;font-weight:800;color:var(--accent);border:1px solid var(--accent-line);border-radius:6px;padding:1px 6px;margin-top:1px}
.dq{flex:1;min-width:0;margin:0;font-size:15px;line-height:1.35;font-weight:650}
.raised{margin:0;font-size:12px;color:var(--muted)}
.opts{display:flex;flex-wrap:wrap;gap:8px}
.opt{display:inline-flex;align-items:center;gap:8px;min-height:44px;max-width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);cursor:pointer;font-size:13.5px;text-align:left;line-height:1.3}
.opt:hover{border-color:var(--accent-line)}
.opt.is-default{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.opt-t{min-width:0;overflow-wrap:anywhere}
.def-l{flex:none;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
.dec-why{font-size:13px;color:var(--muted)}.why-l{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-right:4px}
.dec-ub{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;border-top:1px dashed var(--line);padding-top:10px;font-size:13px}
.ub-l{font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
.wait{flex-basis:100%;color:var(--muted)}
.stuck-list{display:flex;flex-direction:column;gap:8px}.dec-grid+.stuck-list{margin-top:12px}
.stuck-row{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:10px 14px;text-align:left;cursor:pointer;border-radius:12px;background:color-mix(in srgb,var(--stuck) 7%,var(--surface));border:1px solid color-mix(in srgb,var(--stuck) 35%,transparent)}
.stuck-row:hover{border-color:var(--stuck)}.stuck-row:target{box-shadow:0 0 0 2px var(--stuck)}
a.stuck-row{color:inherit;text-decoration:none}.stuck-row.is-next{min-height:44px;padding:6px 14px;background:var(--surface);border-color:var(--line)}.stuck-row.is-next .sr-ic{background:var(--accent-soft);color:var(--accent)}.stuck-row.is-next:hover{border-color:var(--accent-line)}
.sr-ic{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:color-mix(in srgb,var(--stuck) 14%,transparent);color:var(--stuck)}
.sr-name{flex:0 1 auto;max-width:38%;font-weight:650;display:flex;gap:4px}.sr-name .g{color:var(--stuck)}
.sr-wait{flex:1;min-width:0;color:var(--muted);font-size:13.5px}
.more-needs{margin-top:8px}.more-needs>summary,.answered>summary{min-height:44px;display:flex;align-items:center;color:var(--accent);font-size:13.5px}
.answered>summary{color:var(--done)}.answered ul{margin:0 0 6px;padding-left:18px;font-size:14px}
.foot-note{margin:10px 0 0}
/* parts */
.parts-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin-bottom:14px}.parts-head .sh{margin:0}
.stack{flex:1 1 140px;display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;background:var(--surface2);min-width:100px}
.seg.st-done{background:var(--done)}.seg.st-in-progress{background:var(--progress)}.seg.st-not-started{background:var(--idle);opacity:.55}.seg.st-stuck{background:var(--stuck)}
.legend{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:2px 14px;font-size:13px;color:var(--muted)}.legend li{white-space:nowrap}
.pills{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.pill{position:relative;display:flex;flex-direction:column;justify-content:center;gap:4px;min-height:58px;min-width:0;padding:9px 14px 9px 12px;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--idle);border-radius:12px}
.pill.st-stuck{border-left-color:var(--stuck)}.pill.st-in-progress{border-left-color:var(--progress)}.pill.st-not-started{border-left-style:dashed}.pill.st-unjudged{border-left-color:var(--line)}.pill.st-unjudged .p2{padding-left:0}
.pill:hover{border-color:var(--accent-line)}.pill:target{box-shadow:0 0 0 2px var(--accent)}
.pill-btn{display:flex;align-items:center;gap:6px;min-width:0;padding:0;border:0;background:none;cursor:pointer;font-weight:650;text-align:left}
.pill-btn::after{content:"";position:absolute;inset:0;border-radius:12px}.pill-btn:focus-visible{outline:none}.pill-btn:focus-visible::after{outline:2px solid var(--accent);outline-offset:2px}
.pill .pname{color:var(--text)}.pname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ghost{flex:none;margin-left:auto;font-size:11.5px;font-weight:600;color:var(--muted)}
.p2{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding-left:22px;font-size:12.5px;color:var(--muted)}
.see{position:relative;z-index:1;color:var(--stuck);font-weight:650;text-decoration:none}.see:hover{text-decoration:underline}
.age{margin-left:auto;padding:0 8px;border:1px solid var(--line);border-radius:999px;white-space:nowrap}.age.old{color:var(--amber);border-color:color-mix(in srgb,var(--amber) 50%,transparent)}
.cells{white-space:nowrap}.cells span[aria-hidden]{color:var(--accent)}.cells.all span[aria-hidden]{color:var(--done)}
.done-line{display:flex;flex-wrap:wrap;align-items:center;gap:0 6px;margin:12px 0 0;font-size:13.5px;color:var(--muted)}.done-line b{color:var(--text)}
.linkish{border:0;background:none;padding:6px 0;cursor:pointer;color:var(--text);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px;text-align:left}.linkish:hover{color:var(--accent);text-decoration-color:var(--accent)}
/* hood */
.hood{margin-top:44px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.hood>summary,.panel>summary{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-height:52px;padding:10px 18px}
.hood>summary b{font-size:15px}.gist{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;color:var(--muted);font-size:13px}
.chev{display:grid;place-items:center;color:var(--muted);transition:transform .15s}.chev .ic{width:16px;height:16px}
details[open]>summary>.chev{transform:rotate(90deg)}
.panel{border-top:1px solid var(--line)}.panel>summary{min-height:46px;padding-left:28px}.panel>summary b{font-size:14px}
.panel-body{padding:4px 18px 18px 28px}
.minibars rect{fill:var(--accent)}
.treemap{width:100%;height:auto;display:block}.treemap.narrow{display:none}
.tm-part{cursor:pointer;outline:none}.tm-part .bg{stroke-width:1.5;fill-opacity:.16}
.tm-part.st-done .bg{fill:var(--done);stroke:var(--done)}.tm-part.st-in-progress .bg{fill:var(--progress);stroke:var(--progress)}
.tm-part.st-not-started .bg{fill:var(--idle);stroke:var(--idle);fill-opacity:.06;stroke-dasharray:5 4}.tm-part.st-unjudged .bg{fill:var(--idle);stroke:var(--line);fill-opacity:.08}.tm-part.st-stuck .bg{fill:var(--stuck);stroke:var(--stuck);fill-opacity:.22;stroke-width:2.5}
.tm-part:hover .bg,.tm-part:focus-visible .bg{fill-opacity:.32;stroke-width:3}
.tm-name{font-size:14px;font-weight:650;fill:var(--text)}.tm-sub{font-size:12px;fill:var(--muted)}
.tm-part.st-done .g{fill:var(--done)}.tm-part.st-in-progress .g{fill:var(--progress)}.tm-part.st-not-started .g{fill:var(--idle)}.tm-part.st-stuck .g{fill:var(--stuck)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin-top:6px}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
thead th{font-size:12px;color:var(--muted);font-weight:600}tbody tr:last-child>*{border-bottom:0}tbody th{font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.act{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:20px;align-items:start}
.heatmap{width:100%;height:auto;display:block}
.hm{fill:var(--accent)}.hm.l0{fill:var(--surface2)}.hm.l1{fill-opacity:.3}.hm.l2{fill-opacity:.52}.hm.l3{fill-opacity:.76}.hm.l4{fill-opacity:1}
.ax{font-size:10px;fill:var(--muted)}
.contrib{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.contrib li{display:flex;align-items:center;gap:8px;font-size:13.5px}.contrib .cn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.av{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--surface2);border:1px solid var(--line);font-size:11px;font-weight:700;flex:none}
.sub-d{margin-top:10px}.sub-d>summary{color:var(--accent);font-size:13.5px;min-height:36px;display:flex;align-items:center}
.commits,.plain{list-style:none;margin:0;padding:0}.commits li,.plain li{padding:5px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.branches{width:100%;height:auto;display:block}
.lane{stroke:var(--progress);stroke-width:2.5;fill:none}.lane.def{stroke:var(--accent);stroke-width:4}.lane.nobase{stroke-dasharray:4 5;stroke:var(--muted)}
.tip{fill:var(--surface);stroke:var(--progress);stroke-width:2.5}.isdef .tip{stroke:var(--accent)}.tip.has-wt{fill:var(--progress)}
.br-name{font-size:13px;font-weight:600;fill:var(--text)}.isdef .br-name{fill:var(--accent)}.br-meta{font-size:11px;fill:var(--muted)}
.wt-t{font-size:9.5px;font-weight:700;fill:var(--accent);letter-spacing:.06em}.now{stroke:var(--line);stroke-dasharray:2 3}
.wt-inline{font-size:10px;letter-spacing:.06em;font-weight:700;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:0 4px}
.br-list{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);list-style:none;padding:0}.br-list li{padding:6px 0;border-bottom:1px solid var(--line)}
.mini-h{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px}
.vitals{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin:4px 0 16px}
.vitals div{background:var(--surface2);border-radius:10px;padding:8px 12px}.vitals dt{font-size:12px;color:var(--muted)}.vitals dd{margin:0;font-weight:700;font-size:16px}.vitals dd.small{font-weight:400;font-size:12.5px}
.langbar{display:flex;height:10px;border-radius:5px;overflow:hidden;gap:2px}
.lang.l0,.sw.l0{background:var(--l0)}.lang.l1,.sw.l1{background:var(--l1)}.lang.l2,.sw.l2{background:var(--l2)}.lang.l3,.sw.l3{background:var(--l3)}.lang.l4,.sw.l4{background:var(--l4)}.lang.l5,.sw.l5{background:var(--l5)}.lang.l6,.sw.l6{background:var(--l6)}.lang.l7,.sw.l7{background:var(--l7)}
.langs{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px}.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
/* drawer, toast */
dialog{border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--text);padding:0;width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 48px)}
dialog::backdrop{background:rgba(0,0,0,.55)}
.dlg-body{padding:18px 22px 22px;overflow:auto;max-height:calc(100vh - 50px)}
.dr-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-right:48px}.dr-head h2{margin:0;font-size:19px}.dr-head>.g{font-size:18px}
.badge{display:inline-flex;align-items:center;gap:2px;font-size:12px;font-weight:700;border:1px solid currentColor;border-radius:999px;padding:0 8px 0 4px;white-space:nowrap}
.dr-wait{display:flex;gap:10px;align-items:flex-start;background:color-mix(in srgb,var(--stuck) 8%,transparent);border:1px solid color-mix(in srgb,var(--stuck) 35%,transparent);border-radius:10px;padding:10px 12px}.dr-wait .ic{color:var(--stuck);margin-top:2px}.dr-wait span,.sr-wait,.wait,.dec-why,.next-t,.it-t,.dr-list li{overflow-wrap:anywhere}
.dr-nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:14px 0}.dr-nums div{background:var(--surface2);border-radius:10px;padding:6px 10px}.dr-nums dt{font-size:11.5px;color:var(--muted)}.dr-nums dd{margin:0;font-weight:700;font-size:17px}
.dlg-body h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:16px 0 6px}
.dr-list{list-style:none;margin:0;padding:0}.dr-list li{padding:5px 0;border-bottom:1px solid var(--line);font-size:14px}
.kind{font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--accent);margin-right:4px}
.dr-more{margin-top:14px}.dr-more>summary{color:var(--accent);font-size:13.5px;min-height:36px;display:flex;align-items:center}
.close{position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--surface2);font-size:17px;cursor:pointer}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;transition:opacity .15s,transform .15s;z-index:30;max-width:calc(100vw - 32px)}
.toast.on{opacity:1;transform:translate(-50%,0)}
.copybox{position:fixed;left:16px;right:16px;bottom:16px;z-index:31;max-width:640px;margin:0 auto;background:var(--surface);border:1px solid var(--accent);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}.copybox[hidden]{display:none}.copybox p{margin:0}.copybox code{display:block;padding:8px;user-select:all}.copybox .btn-ghost{margin-left:auto}
@media (max-width:900px){.act{grid-template-columns:1fr}}
@media (max-width:720px){.pills{grid-template-columns:1fr}}
@media (min-width:641px){.js .others{display:none}}
@media (max-width:640px){
.hide-s{display:none!important}.show-s{display:block}.it.done .pchip.neutral{display:none}.js .others:not(.need-m){display:none}.upd{font-size:12px}
.sec{padding-top:22px}.sh{margin-bottom:10px}.it{padding:4px 0;font-size:14px;gap:8px}.ck{padding:0 12px 2px}.it.next{margin-left:-12px;padding-left:9px}.dec{padding:12px;gap:8px}.dec-grid{gap:10px}.next-why{-webkit-line-clamp:1}.pill{min-height:52px;padding:7px 12px 7px 10px}.pills{gap:8px}.hood{margin-top:32px}.since{margin-top:10px}.foot-note{display:none}
.rail .lbl{display:none}.rail .lbl-s{display:inline;font-size:12px}.rail .num{font-size:14px}.rail a{gap:4px;padding:0 8px;min-height:32px;justify-content:center}.rail li:first-child a{margin-left:-8px}.rail .sep{display:none}.rail ol{gap:0;justify-content:space-between;overflow-x:auto;scrollbar-width:none}.rail .rbadge{min-width:18px;height:18px;padding:0 5px;font-size:11px}
.track .node.hide-m{display:none}.track .more-m{display:block}.track .node.fold{display:block}
.track .node>.conn{display:block}.track .node.first-m>.conn{display:none}
.conn{top:42px}.ringw{width:48px;height:48px}.ndw{height:44px}
.nname{font-size:12.5px}.nflag{font-size:11px}
.next-card{padding:14px;gap:12px}.next-ic{width:32px;height:32px}.next-t{font-size:17px}.btn-ghost{margin-left:0}
.stuck-row{flex-wrap:wrap;gap:6px 10px}.sr-name{max-width:calc(100% - 44px)}.sr-wait{flex-basis:100%}

.treemap.wide{display:none}.treemap.narrow{display:block}.br-svg{display:none}.br-list{position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto}
.panel>summary,.panel-body{padding-left:18px}
.parts-t th:nth-child(4),.parts-t td:nth-child(4),.parts-t th:nth-child(6),.parts-t td:nth-child(6),.parts-t th:nth-child(8),.parts-t td:nth-child(8){display:none}
.dr-nums{grid-template-columns:repeat(2,minmax(0,1fr))}
dialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0;border:0}.dlg-body{max-height:100dvh}
}
@media (max-width:380px){.age{margin-left:0}.p2{padding-left:0}}
@media (pointer:coarse){.chip,.pchip{min-height:32px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;
var INDEX_CSS = `
.help{margin:16px 0 14px;font-size:14px}
.q{display:block;width:100%;max-width:420px;margin:0 0 14px;padding:9px 12px;font:inherit;font-size:14px;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:10px}
.q:focus{border-color:var(--accent-line);outline:none}
.pcs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:12px}
.pc{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;padding:12px 14px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.pc:hover{border-color:var(--accent-line)}
.pc[hidden]{display:none}
.pc-top{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;min-width:0}
.pc-name{flex:1 1 auto;min-width:0;font-size:16px;font-weight:700;color:var(--text);text-decoration:none;overflow-wrap:anywhere}
.pc-name::after{content:"";position:absolute;inset:0;z-index:1;border-radius:14px}.pc-name:focus-visible{outline:none}.pc-name:focus-visible::after{outline:2px solid var(--accent);outline-offset:2px}
.pc-name:hover{color:var(--accent)}
.needs-b{display:inline-flex;align-items:center;gap:4px;flex:none;white-space:nowrap;padding:0 7px;border-radius:999px;font-size:12px;font-weight:700;color:var(--stuck);background:color-mix(in srgb,var(--stuck) 14%,transparent);border:1px solid color-mix(in srgb,var(--stuck) 40%,transparent)}.needs-b .ic{width:13px;height:13px}
.pc-age{margin-left:auto;display:inline-flex;align-items:center;gap:6px;flex:none;font-size:12.5px;color:var(--muted);white-space:nowrap}
.stale-m{font-size:11px;font-weight:700;color:var(--amber);border:1px solid color-mix(in srgb,var(--amber) 50%,transparent);border-radius:999px;padding:0 6px}
.pc-path{display:flex;align-items:center;gap:8px;min-width:0;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.pp{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.pc-br{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px;border-radius:999px;background:var(--surface2);color:var(--text)}
.pc-road{display:flex;align-items:center;gap:6px;min-width:0;font-size:13.5px;white-space:nowrap}
.ms-id{color:var(--accent)}.ms-n{overflow:hidden;text-overflow:ellipsis;min-width:0}.ms-c{font-variant-numeric:tabular-nums;color:var(--muted)}
.pbar{flex:none;display:inline-block;width:56px;height:6px;border-radius:3px;background:var(--surface2);overflow:hidden}.pbar span{display:block;height:100%;background:var(--accent)}
.pc-next{margin:0;font-size:13.5px}.pc-next .arrow{color:var(--accent)}
.pc-parts{display:flex;flex-wrap:wrap;gap:2px 12px;font-size:13px;color:var(--muted)}
.pc.stale .pc-name{color:var(--muted)}
`;
//#endregion
//#region src/shared/signal-parts.ts
/**
* The next thing, from a map with no judgement of Claude's: the first open item of the active milestone
* (the person's milestones.md), else the part with the most uncommitted work, else the part in progress
* that moved last. Null when nothing is in progress.
*/
function inferredNext(r) {
	const item = r.milestones.find((m) => m.id === r.nextMilestone)?.items.find((i) => !i.done);
	if (item) return item.text;
	const going = r.parts.filter((p) => p.status === "in-progress");
	const dirty = [...going].filter((p) => p.metrics.uncommitted > 0).sort((a, b) => b.metrics.uncommitted - a.metrics.uncommitted)[0];
	if (dirty) return `Finish or commit the work in ${dirty.name} (${dirty.metrics.uncommitted} uncommitted ${dirty.metrics.uncommitted === 1 ? "file" : "files"})`;
	const last = [...going].filter((p) => p.metrics.lastCommit).sort((a, b) => (b.metrics.lastCommit ?? "").localeCompare(a.metrics.lastCommit ?? ""))[0];
	if (last) return `Carry on with ${last.name} (last commit ${last.metrics.lastCommit.slice(0, 10)})`;
	return null;
}
//#endregion
//#region src/shared/rundown/page-svg.ts
var ICON_PATHS = {
	arrow: "M5 12h14M13 6l6 6-6 6",
	person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
	deploy: "M12 15V3M7 8l5-5 5 5M5 21h14",
	external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
	bug: "M9 8a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM12 9v9M4 12h5M15 12h5M5 6l4 3M19 6l-4 3M5 19l4-3M19 19l-4-3",
	flag: "M5 21V4M5 4h11l-2 4 2 4H5",
	warn: "M12 3l10 18H2zM12 10v5M12 18v.01",
	copy: "M9 9h11v11H9zM5 15H4V4h11v1",
	moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
	sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
	chev: "M9 6l6 6-6 6",
	back: "M15 6l-6 6 6 6"
};
function icon(name, cls = "") {
	return `<svg class="ic${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICON_PATHS[name] ?? ICON_PATHS.warn}"/></svg>`;
}
/** What a stuck part waits on, read from its words: a person, a deploy, an outside party or a bug. */
function waitIcon(text) {
	const t = String(text ?? "");
	if (/\b(you|founder|owner|approv\w*|merge|review\w*|sign[- ]?off|decid\w*|decision|accountant|lawyer|D\d+)\b/i.test(t)) return "person";
	if (/\b(deploy\w*|release|rollout|migration|ship)\b/i.test(t)) return "deploy";
	if (/\b(vendor|api|credential\w*|account|partner|third[- ]party|contract|external|provider)\b/i.test(t)) return "external";
	if (/\b(bug|crash\w*|fail\w*|error|broken|flaky|regression)\b/i.test(t)) return "bug";
	return "warn";
}
/** The active milestone's progress ring; the "2/4" in it is real text the page draws over it. */
function ring(done, total, size = 56) {
	const c = size / 2;
	const r = c - 4;
	const len = 2 * Math.PI * r;
	const f = total ? Math.max(0, Math.min(1, done / total)) : 0;
	return `<svg class="ring" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false"><circle class="ring-bg" cx="${c}" cy="${c}" r="${r}"/>${f > 0 ? `<circle class="ring-fg" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="${(f * len).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>` : ""}</svg>`;
}
/** The line joining two road nodes, in px with x2="100%" so its dashes never stretch. */
function track$1(kind) {
	return `<svg class="conn ${kind}" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="100%" y2="2"/></svg>`;
}
/** A tiny bar chart for a summary line; `values` oldest first. */
function miniBars(values, label, w = 44, h = 14) {
	const n = values.length || 1;
	const max = Math.max(1, ...values);
	const bw = w / n;
	return `<svg class="minibars" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}">${values.map((v, i) => {
		const bh = Math.max(1.5, v / max * h);
		return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1"/>`;
	}).join("")}</svg>`;
}
//#endregion
//#region src/shared/rundown/view.ts
/** One glyph per status, on the page, in the drawer and in the chat reply. */
var GLYPH = {
	done: "●",
	"in-progress": "◐",
	"not-started": "○",
	stuck: "▲"
};
/** Stuck first: the order parts are listed and counted in. */
var STATUS_ORDER = [
	"stuck",
	"in-progress",
	"not-started",
	"done"
];
/** Whitespace collapsed to one line: names and questions end up in headings and the reply block. */
var oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
/** Cut at a word boundary, trailing punctuation dropped, with "..." when anything went. */
function cutWords(s, n) {
	const t0 = oneLine(s);
	if (t0.length <= n) return t0;
	let t = t0.slice(0, Math.max(1, n - 3));
	const sp = t.lastIndexOf(" ");
	if (sp > n * .6) t = t.slice(0, sp);
	return `${t.replace(/[\s,;:.(-]+$/, "")}...`;
}
var MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"
];
/** "Oct 7", with the year when it isn't `ref`'s. Takes YYYY-MM-DD or a full ISO time (read in local time). */
function fmtDay(s, ref = /* @__PURE__ */ new Date()) {
	if (!s) return "";
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
	if (!m) return String(s);
	let y = Number(m[1]);
	let mo = Number(m[2]);
	let d = Number(m[3]);
	if (String(s).length > 10) {
		const t = new Date(s);
		if (Number.isFinite(t.getTime())) {
			y = t.getFullYear();
			mo = t.getMonth() + 1;
			d = t.getDate();
		}
	}
	return `${MONTHS[mo - 1]} ${d}${y !== ref.getFullYear() ? `, ${y}` : ""}`;
}
/** "3d ago" from an ISO time, or "-". */
function ago(iso, now = Date.now()) {
	if (!iso) return "-";
	const s = Math.round((now - Date.parse(iso)) / 1e3);
	if (!Number.isFinite(s)) return "-";
	if (s < 60) return "just now";
	for (const [u, l] of [
		[31536e3, "y"],
		[2592e3, "mo"],
		[604800, "w"],
		[86400, "d"],
		[3600, "h"],
		[60, "min"]
	]) if (s >= u) return `${Math.floor(s / u)}${l} ago`;
	return "just now";
}
/** A short label for chips: the name when short, else its first clause, else the name cut. */
function shortName(p) {
	const n = String(p.name || p.id || "");
	if (n.length <= 16) return n;
	const first = n.split(/,|\s&\s|\sand\s|\s-\s|\s\(|:/)[0].trim();
	if (first.length >= 3 && first.length <= 18) return first;
	return `${n.slice(0, 15).trim()}...`;
}
/** The decision ids ("D3") a text names. */
function decisionIds(text) {
	return [...new Set(String(text ?? "").match(/\bD\d+\b/g) ?? [])];
}
/** Whether every part is the collector's guess and nothing else was judged: no road, no next step yet. */
function judged(r) {
	return !(r.parts.every((p) => p.statusSource === "inferred") && !r.milestones.length && !r.nextStep);
}
/** Stuck parts covered by an open decision: the decision's part, or a part whose waitingOn names it. */
function linkStuckToDecisions(r) {
	const open = r.decisions.filter((d) => !d.answer);
	const byDecision = new Map(open.map((d) => [d.id, []]));
	const coverOf = /* @__PURE__ */ new Map();
	for (const p of r.parts) {
		if (p.status !== "stuck") continue;
		const named = new Set(decisionIds(p.waitingOn));
		for (const d of open) {
			if (d.partId !== p.id && !named.has(d.id)) continue;
			const primary = !coverOf.has(p.id);
			if (primary) coverOf.set(p.id, d.id);
			byDecision.get(d.id).push({
				part: p,
				primary
			});
		}
	}
	return {
		byDecision,
		coverOf
	};
}
/**
* Everything waiting on the person: open decisions (those that unblock a stuck part, then those the
* next step names, then the rest in order), then the stuck parts no decision covers.
*/
function needsQueue(r) {
	const link = linkStuckToDecisions(r);
	const nsIds = new Set(r.nextStep ? decisionIds(r.nextStep.text) : []);
	const rank = (d) => (link.byDecision.get(d.id) ?? []).length ? 0 : nsIds.has(d.id) ? 1 : 2;
	const decisions = r.decisions.filter((d) => !d.answer).map((d, i) => [d, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([d]) => d);
	const nsPart = r.nextStep?.partId ?? null;
	const uncovered = r.parts.filter((p) => p.status === "stuck" && !link.coverOf.has(p.id));
	const nextPart = uncovered.find((p) => p.id === nsPart) ?? null;
	const stuck = uncovered.filter((p) => p !== nextPart);
	return {
		decisions,
		stuck,
		nextPart,
		link,
		count: decisions.length + stuck.length
	};
}
var norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
/** The option the DEFAULT picks: the default is it, or starts with it (a parenthetical optional). */
function bestDefault(d) {
	const b = norm(d.default);
	let best = null;
	let bestLen = 0;
	for (const o of d.options) for (const cand of [norm(o), norm(o.replace(/\s*\([^)]*\)/g, " "))]) {
		if (!cand || cand.length <= bestLen) continue;
		if (b === cand || b.startsWith(cand) && !/[a-z0-9]/.test(b[cand.length])) {
			best = o;
			bestLen = cand.length;
		}
	}
	return best;
}
/** What the DEFAULT says beyond the option it picks (a reason), or null when that's under 3 words. */
function defaultReason(d) {
	const def = oneLine(d.default);
	if (!def) return null;
	const best = bestDefault(d);
	if (!best) return d.options.length ? def : null;
	let rest = def;
	for (const cand of [best, best.replace(/\s*\([^)]*\)/g, "").trim()]) if (rest.toLowerCase().startsWith(cand.toLowerCase())) {
		rest = rest.slice(cand.length);
		break;
	}
	rest = rest.replace(/^[\s,;:.()-]+/, "").replace(/[\s)]+$/, "").trim();
	return (rest.match(/[A-Za-z0-9][\w'-]*/g) ?? []).length >= 3 ? rest : null;
}
var words4 = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
/** The open item of the next step's milestone the next step works on: its part, or two shared words. */
function nextItem(r) {
	const ns = r.nextStep;
	if (!ns) return null;
	const m = r.milestones.find((x) => x.id === (ns.milestoneId || r.nextMilestone));
	if (!m) return null;
	const nw = words4(ns.text);
	let best = null;
	let bestScore = 0;
	m.items.forEach((it, i) => {
		if (it.done) return;
		const overlap = [...words4(it.text)].filter((w) => nw.has(w)).length;
		const samePart = !!ns.partId && it.partId === ns.partId;
		if (!samePart && overlap < 2) return;
		const score = overlap + (samePart ? .5 : 0);
		if (score > bestScore) {
			best = {
				milestoneId: m.id,
				index: i
			};
			bestScore = score;
		}
	});
	return best;
}
/** How many things the next step unblocks: open items of its milestone on its part, and stuck parts waiting on a decision it names. */
function unblocks(r) {
	const ns = r.nextStep;
	if (!ns) return 0;
	const m = r.milestones.find((x) => x.id === (ns.milestoneId || r.nextMilestone));
	let n = m && ns.partId ? m.items.filter((i) => !i.done && i.partId === ns.partId).length : 0;
	const ids = new Set(decisionIds(ns.text));
	if (ids.size) n += r.parts.filter((p) => p.status === "stuck" && decisionIds(p.waitingOn).some((id) => ids.has(id))).length;
	return n;
}
/** A change as a compact chip: its label, its tone, and the place on the page it links to. */
function changeChip(c, parts = []) {
	const p = c.ref ? parts.find((x) => x.id === c.ref) : void 0;
	const pn = p ? shortName(p) : c.ref ?? "";
	const g = (s) => GLYPH[s] ?? "?";
	const delta = () => Number(c.to ?? 0) - Number(c.from ?? 0);
	switch (c.kind) {
		case "part-status": return {
			label: `${pn} ${g(c.from)}→${g(c.to)}`,
			tone: c.to === "stuck" ? "stuck" : c.to === "done" ? "done" : "neutral",
			href: p ? `#pill-${p.id}` : null
		};
		case "part-added": return c.ref ? {
			label: `+ ${pn}`,
			tone: "neutral",
			href: p ? `#pill-${p.id}` : null
		} : {
			label: "parts regrouped",
			tone: "neutral",
			href: "#parts"
		};
		case "part-removed": return {
			label: `- ${c.ref ?? ""}`,
			tone: "muted",
			href: null
		};
		case "milestone-done": return {
			label: `${c.ref} done`,
			tone: "done",
			href: `#node-${c.ref}`
		};
		case "milestone-progress": {
			const d = delta();
			return {
				label: `${c.ref} ${d >= 0 ? "+" : "-"}${Math.abs(d)} done`,
				tone: "accent",
				href: `#node-${c.ref}`
			};
		}
		case "decision-new": return {
			label: `${c.ref} new`,
			tone: "accent",
			href: `#dec-${c.ref}`
		};
		case "decision-answered": return {
			label: `${c.ref} answered`,
			tone: "done",
			href: "#answered"
		};
		case "commits": {
			const n = (String(c.text).match(/\d+/) ?? ["?"])[0];
			return {
				label: `+${n} commit${n === "1" ? "" : "s"}`,
				tone: "neutral",
				href: "#hood-activity"
			};
		}
		case "history-rewritten": return {
			label: "history rewritten",
			tone: "stuck",
			href: "#hood-branches"
		};
		case "branch-added": return {
			label: `+ branch ${c.ref}`,
			tone: "muted",
			href: "#hood-branches"
		};
		case "branch-removed": return {
			label: `- branch ${c.ref}`,
			tone: "muted",
			href: "#hood-branches"
		};
		case "branch-moved": return {
			label: `${c.ref} moved`,
			tone: "muted",
			href: "#hood-branches"
		};
		case "tests": return {
			label: `tests ${c.from}→${c.to}`,
			tone: "muted",
			href: "#hood-repo"
		};
		case "todo": return {
			label: `TODO ${c.from}→${c.to}`,
			tone: "muted",
			href: "#hood-repo"
		};
		case "uncommitted": return {
			label: `uncommitted ${c.from}→${c.to}`,
			tone: "muted",
			href: "#hood-repo"
		};
		case "lines": {
			const d = delta();
			return {
				label: `${pn} ${d > 0 ? "+" : "-"}${Math.abs(d).toLocaleString("en-US")} lines`,
				tone: "muted",
				href: p ? `#pill-${p.id}` : null
			};
		}
		default: return {
			label: c.text,
			tone: "muted",
			href: null
		};
	}
}
//#endregion
//#region src/shared/rundown/page-flow.ts
var num = (n) => n == null ? "-" : Number(n).toLocaleString("en-US");
var short = (sha) => sha ? sha.slice(0, 7) : "-";
var time = (iso, now) => iso ? `<time datetime="${esc(iso)}" title="${esc(String(iso).replace("T", " ").slice(0, 16))}" data-rel>${esc(ago(iso, now))}</time>` : "-";
var glyph = (s) => `<span class="g st-${s}" aria-hidden="true">${GLYPH[s]}</span>`;
var badge = (s) => `<span class="badge st-${s}">${glyph(s)} ${STATUS_LABEL[s]}</span>`;
var NUMS = [
	"①",
	"②",
	"③",
	"④"
];
var DAY_MS$2 = 864e5;
var STEP_NUM = {
	road: 0,
	next: 1,
	needs: 2,
	parts: 3
};
/** A section heading, numbered once the page is judged (before that there's no flow to follow). */
var sh = (key, ctx, title, extra = "", id = "") => `<h2 class="sh"${id ? ` id="${id}"` : ""}>${ctx.judged ? `<span class="num" aria-hidden="true">${NUMS[STEP_NUM[key]]}</span>` : ""}${title}${extra}</h2>`;
/** A clamped line with a "more" disclosure, so touch and keyboard users can read the whole of it. */
var clampMore = (cls, html, lines = 2) => `<details class="cmore ${cls}"><summary><span class="clamp${lines}">${html}</span><span class="more" aria-hidden="true"></span></summary></details>`;
/** A part chip: glyph and short name, opens the drawer. Neutral (no status colour) on finished checklist rows. */
var partChip = (p, neutral = false) => neutral ? `<button type="button" class="pchip neutral" data-open-part="${esc(p.id)}" title="${esc(p.name)}"><span>${esc(shortName(p))}</span></button>` : `<button type="button" class="pchip" data-open-part="${esc(p.id)}" title="${esc(p.name)}: ${STATUS_LABEL[p.status]}">${glyph(p.status)}<span>${esc(shortName(p))}</span><span class="sr"> (${STATUS_LABEL[p.status]})</span></button>`;
function header(r, ctx) {
	const h = r.project.head;
	const g = r.facts.git;
	const u = g?.uncommitted;
	const unc = u ? u.staged + u.modified + u.deleted + u.untracked : 0;
	const where = h ? `<code class="chip mono hide-s" title="${esc(h.subject || "")}">${esc(h.branch || "detached")} @ ${short(h.sha)}</code>` : g ? `<span class="chip mono hide-s">no commits yet</span>` : "";
	const warn = ctx.needs.stuck.length || ctx.needs.link.coverOf.size;
	const rail = ctx.steps.map((s) => {
		const count = s.id === "needs" && ctx.needs.count ? ` <span class="rbadge${warn ? " warn" : ""}" aria-hidden="true">${ctx.needs.count}</span>` : "";
		const aria = s.id === "needs" && ctx.needs.count ? `${s.label}, ${ctx.needs.count} waiting` : s.label;
		return `<li><a href="#${s.id}" data-rail="${s.id}" aria-label="${esc(aria)}">${ctx.judged ? `<span class="num" aria-hidden="true">${NUMS[STEP_NUM[s.id]]}</span>` : ""}<span class="lbl" aria-hidden="true">${s.label}</span><span class="lbl-s" aria-hidden="true">${s.short ?? s.label}</span>${count}</a></li>`;
	}).join("<li class=\"sep\" aria-hidden=\"true\">·</li>");
	const bd = u ? `${u.staged} staged · ${u.modified} modified · ${u.deleted} deleted · ${u.untracked} untracked${g?.stashes ? ` · ${plural(g.stashes, "stash", "stashes")}` : ""}` : "";
	return `<header class="top" id="top"><div class="wrap bar">
${ctx.indexHref ? `<a class="home-btn" href="${esc(ctx.indexHref)}" aria-label="All rundowns" title="All rundowns">${icon("back")}<span class="hb-l">All rundowns</span><span class="hb-s" aria-hidden="true">All</span></a>` : ""}<h1 class="brand"><span class="bdot" aria-hidden="true"></span><span class="bname" title="${esc(r.project.name)}">${esc(r.project.name)}</span></h1>
${where}<span class="upd">updated ${time(r.generatedAt, ctx.now)}</span><span class="grow"></span>
${unc > 0 ? `<span class="chip hide-s" tabindex="0" title="${bd}">${num(unc)} uncommitted<span class="sr">: ${bd}</span></span>` : ""}
<button id="theme" class="icon-btn" type="button" aria-pressed="${ctx.theme === "dark"}" aria-label="Dark theme">${icon("moon", "i-moon")}${icon("sun", "i-sun")}</button>
</div>
<nav class="rail" aria-label="Sections"><div class="wrap"><ol>${rail}</ol></div></nav>
</header>`;
}
function describe(r) {
	const d = r.project.description;
	if (!d) return "";
	return `<details class="desc"><summary><span class="clamp1" title="${esc(d)}">${esc(d)}</span><span class="more" aria-hidden="true"></span></summary></details>`;
}
function itemsList(m, ctx) {
	if (!m.items.length) return "<p class=\"muted small\">No items yet. Add some under this milestone in .rundown/milestones.md.</p>";
	const ni = ctx.nextItem && ctx.nextItem.milestoneId === m.id ? ctx.nextItem.index : -1;
	let prevPart = null;
	const row = (i) => {
		const it = m.items[i];
		const p = it.partId ? ctx.partById.get(it.partId) : void 0;
		const next = i === ni;
		const showChip = p && (next || p.id !== prevPart);
		prevPart = p ? p.id : null;
		return `<li class="it${it.done ? " done" : ""}${next ? " next" : ""}"><span class="ck-g${it.done ? " st-done" : ""}" aria-hidden="true">${it.done ? GLYPH.done : "○"}</span><span class="it-t">${esc(it.text)}<span class="sr">${it.done ? " (done)" : " (open)"}</span></span>${next ? `<a class="tag-next" href="#next">→ next</a>` : ""}${showChip && p ? partChip(p, it.done) : ""}</li>`;
	};
	const idx = m.items.map((_, i) => i);
	const open = idx.filter((i) => !m.items[i].done);
	const done = idx.filter((i) => m.items[i].done);
	const openHtml = open.map(row).join("");
	prevPart = null;
	return `<ul class="items">${openHtml}${done.length <= 3 ? done.map(row).join("") : `<li class="it fold"><details><summary><span class="ck-g st-done" aria-hidden="true">${GLYPH.done}</span> +${done.length} done</summary><ul class="items">${done.map(row).join("")}</ul></details></li>`}</ul>`;
}
function checklistBody(m, ctx) {
	const meta = [m.state === "done" ? `${GLYPH.done} done` : "", m.due ? `due ${esc(fmtDay(m.due, ctx.nowDate))}` : ""].filter(Boolean).join(" · ");
	return `<summary><span class="ck-h"><b>${esc(m.id)} · ${esc(m.name)}</b>${meta ? `<span class="muted small">${meta}</span>` : ""}</span></summary>
${m.doneWhen ? `<p class="dw clamp1" title="${esc(m.doneWhen)}">Done when: ${esc(m.doneWhen)}</p>` : ""}
${itemsList(m, ctx)}`;
}
function nodeBadges(m, ctx) {
	const out = [];
	for (const c of ctx.changes) {
		if (c.ref !== m.id) continue;
		if (c.kind === "milestone-done") out.push("just finished");
		else if (c.kind === "milestone-progress") {
			const d = Number(c.to ?? 0) - Number(c.from ?? 0);
			out.push(`${d >= 0 ? "+" : "-"}${Math.abs(d)} done`);
		}
	}
	if (ctx.prev?.milestones.length && !ctx.prev.milestones.some((x) => x.id === m.id)) out.push("new");
	return out.map((b) => `<span class="dbadge">${esc(b)}</span>`).join("");
}
function sinceRow(r, ctx) {
	if (!r.previous) return "<div class=\"since\"><span class=\"chip muted\">first rundown</span></div>";
	const when = esc(fmtDay(r.previous.generatedAt, ctx.nowDate));
	if (!r.changes.length) return `<div class="since"><span class="chip muted">no changes since ${when}</span></div>`;
	const chips = r.changes.slice(0, 5).map((c) => {
		const ch = changeChip(c, r.parts);
		return ch.href ? `<a class="chip t-${ch.tone}" href="${esc(ch.href)}" title="${esc(c.text)}">${esc(ch.label)}</a>` : `<span class="chip t-${ch.tone}" title="${esc(c.text)}">${esc(ch.label)}</span>`;
	}).join("");
	const rest = r.changes.slice(5);
	return `<div class="since"><span class="since-l">Since ${when}:</span>${chips}${rest.length ? `<details class="since-more"><summary class="chip">+${rest.length} more</summary><ul>${rest.map((c) => `<li>${esc(c.text)}</li>`).join("")}</ul></details>` : ""}</div>`;
}
function roadSection(r, ctx) {
	const ms = r.milestones;
	const proposed = ms.some((m) => m.source === "proposed") ? " <span class=\"tagpill\" title=\"Drafted by /rundown. Edit .rundown/milestones.md to make it yours.\">Proposed</span>" : "";
	if (!ms.length) return `<section id="road" class="sec" aria-labelledby="h-road">${sh("road", ctx, "Road", "", "h-road")}\n<p class="muted">No milestones yet. Run /rundown to draft them.</p>${sinceRow(r, ctx)}</section>`;
	const activeIdx = ms.findIndex((m) => m.state === "active");
	const allDone = activeIdx === -1;
	const focus = allDone ? ms.length - 1 : activeIdx;
	const F = focus;
	const foldD = ms.length > 6 && F >= 2;
	const foldM = F >= 2;
	const aheadM = ms.length - (focus + 2);
	const cls = (hideD, hideM, key) => `${hideD ? " hide-d" : ""}${hideM ? " hide-m" : ""}${(foldD ? "fold" : 0) === key ? " first-d" : ""}${(foldM ? "fold" : 0) === key ? " first-m" : ""}`;
	const nodes = [];
	if (F >= 2) nodes.push(`<li class="node ms-done fold${cls(!foldD, false, "fold")}">${track$1("solid")}<div class="nflag"></div><button type="button" class="nbtn" data-unfold aria-label="${esc(ms[0].id)} to ${esc(ms[F - 1].id)} done, show them"><span class="ndw"><span class="ndot"></span></span><span class="nlab"><b>${esc(ms[0].id)}-${esc(ms[F - 1].id)}</b><span class="nmeta">${GLYPH.done} done</span></span></button></li>`);
	ms.forEach((m, i) => {
		const done = m.items.filter((x) => x.done).length;
		const isFocus = i === focus;
		const state = m.state;
		const hideD = foldD && i < F;
		const hideM = foldM && i < F || i > focus + 1;
		const flag = isFocus ? allDone ? `${icon("flag")} all done` : `◆ you are here` : "";
		const due = m.due ? ` · due ${esc(fmtDay(m.due, ctx.nowDate))}` : "";
		const meta = state === "done" ? `${GLYPH.done} done` : state === "active" ? m.due ? `due ${esc(fmtDay(m.due, ctx.nowDate))}` : "" : `${plural(m.items.length, "item")}${due}`;
		const dot = state === "active" ? `<span class="ringw">${ring(done, m.items.length)}<span class="ring-t">${done}/${m.items.length}</span></span>` : "<span class=\"ndot\"></span>";
		const label = `${m.id} ${m.name}: ${state === "done" ? "done" : state === "active" ? `in progress, ${done} of ${m.items.length} items done` : `not started, ${plural(m.items.length, "item")}`}`;
		nodes.push(`<li class="node ms-${state}${isFocus ? " focus" : ""}${cls(hideD, hideM, i)}" id="node-${esc(m.id)}">${track$1(state === "ahead" ? "dashed" : "solid")}<div class="nflag">${flag}</div><a class="nbtn" href="#${state === "active" ? "checklist" : `msd-${esc(m.id)}`}" data-ms="${esc(m.id)}" aria-controls="checklist" aria-label="${esc(label)}"${state === "active" ? " aria-current=\"step\"" : ""}><span class="ndw">${dot}</span><span class="nlab"><b>${esc(m.id)}</b><span class="nname" title="${esc(m.name)}">${esc(m.name)}</span>${meta ? `<span class="nmeta">${meta}</span>` : ""}${nodeBadges(m, ctx)}</span></a></li>`);
	});
	if (aheadM > 0) nodes.push(`<li class="node ms-ahead more-m">${track$1("dashed")}<div class="nflag"></div><a class="nbtn" href="#ms-others" aria-label="${aheadM} more milestones ahead"><span class="ndw"><span class="ndot"></span></span><span class="nlab"><b>+${aheadM}</b><span class="nmeta">ahead</span></span></a></li>`);
	const active = allDone ? null : ms[activeIdx];
	const others = ms.filter((m) => m !== active);
	const check = active ? `<details open class="ck">${checklistBody(active, ctx)}</details>` : `<div class="ck ck-done"><p>${icon("flag")} All milestones done. Add the next one in .rundown/milestones.md</p></div>`;
	const needM = foldM || aheadM > 0;
	return `<section id="road" class="sec" aria-labelledby="h-road">${sh("road", ctx, "Road", proposed, "h-road")}
<ol class="track${foldD ? " folded" : ""}" aria-label="Milestones">${nodes.join("")}</ol>
${sinceRow(r, ctx)}
<div id="checklist" class="checklist" role="region" aria-live="polite" aria-label="Milestone checklist">${check}</div>
${others.length ? `<details class="others${needM ? " need-m" : ""}" id="ms-others"><summary>Other milestones <span class="muted small">${others.map((m) => esc(m.id)).join(" · ")}</span></summary>${others.map((m) => `<details class="msd" id="msd-${esc(m.id)}">${checklistBody(m, ctx)}</details>`).join("")}</details>` : ""}
</section>`;
}
/** The prompt Copy as prompt puts on the clipboard for the next step. */
var nextPrompt = (text) => `Do the next step from .rundown: ${text}`;
/** The prompt a decision's option button copies. */
var answerPrompt = (d, option) => `Answer ${d.id} in .rundown/decisions.md: "${option}". Then /rundown quick.`;
function nextSection(r, ctx) {
	const ns = r.nextStep;
	if (!ns) {
		const allDone = ctx.judged && r.milestones.length > 0 && r.milestones.every((m) => m.state === "done");
		const guess = allDone ? null : inferredNext(r);
		if (guess) return `<section id="next" class="sec" aria-labelledby="h-next">${sh("next", ctx, "Next", "", "h-next")}<div class="next-card"><span class="next-ic">${icon("arrow")}</span><div class="next-body"><p class="next-t">${esc(guess)}</p><p class="next-why">Inferred from the code. Run /rundown for Claude's read.</p><div class="next-foot"><button type="button" class="btn-ghost" data-copy="${esc(nextPrompt(guess))}" data-toast="Copied. Paste it to Claude.">${icon("copy")} Copy as prompt</button></div></div></div></section>`;
		const msg = allDone ? "Nothing next: all milestones are done. Add one to <code>.rundown/milestones.md</code> to set the next goal." : "Run /rundown for a suggested next step.";
		return `<section id="next" class="sec" aria-labelledby="h-next">${sh("next", ctx, "Next", "", "h-next")}<div class="next-card empty"><p class="muted">${msg}</p></div></section>`;
	}
	const p = ns.partId ? ctx.partById.get(ns.partId) : void 0;
	let mid = ns.milestoneId && r.milestones.some((m) => m.id === ns.milestoneId) ? ns.milestoneId : null;
	if (mid && r.milestones.find((m) => m.id === mid)?.state === "done") mid = r.milestones.find((m) => m.state === "active")?.id ?? null;
	const open = new Set(r.decisions.filter((d) => !d.answer).map((d) => d.id));
	const linkD = (t) => esc(t).replace(/\bD\d+\b/g, (id) => open.has(id) ? `<a href="#dec-${id}">${id}</a>` : id);
	const ub = unblocks(r);
	const stale = r.generator.mode === "quick" && ctx.judgedAt && fmtDay(ctx.judgedAt, ctx.nowDate) !== fmtDay(r.generatedAt, ctx.nowDate) ? ` <span class="muted small">from ${esc(fmtDay(ctx.judgedAt, ctx.nowDate))}</span>` : "";
	return `<section id="next" class="sec" aria-labelledby="h-next">${sh("next", ctx, "Next", "", "h-next")}
<div class="next-card"><span class="next-ic">${icon("arrow")}</span><div class="next-body">
<p class="next-t">${linkD(ns.text)}${stale}</p>
${ns.why ? clampMore("next-why", esc(ns.why)) : ""}
<div class="next-foot">${mid ? `<a class="chip t-accent" href="#node-${esc(mid)}" data-select-ms="${esc(mid)}">${esc(mid)}</a>` : ""}${p ? partChip(p) : ""}${ub > 0 ? `<span class="chip t-neutral">unblocks ${ub}</span>` : ""}<button type="button" class="btn-ghost" data-copy="${esc(nextPrompt(ns.text))}" data-toast="Copied. Paste it to Claude.">${icon("copy")} Copy as prompt</button></div>
</div></div></section>`;
}
function decisionCard(d, ctx) {
	const best = bestDefault(d);
	const optHtml = (d.options.length ? d.options : d.default ? [d.default] : []).map((o) => {
		const isDef = best ? o === best : !d.options.length;
		return `<button type="button" class="opt${isDef ? " is-default" : ""}" data-copy="${esc(answerPrompt(d, o))}" data-toast="Copied. Paste it to Claude."${isDef && d.default ? ` title="Default: ${esc(d.default)}"` : ""}><span class="opt-t">${esc(o)}</span>${isDef ? "<span class=\"def-l\">default</span>" : ""}</button>`;
	}).join("");
	const reason = d.options.length ? defaultReason(d) : null;
	const why = reason ? clampMore("dec-why", `<span class="why-l">Why default</span> ${esc(reason)}`) : "";
	const linked = ctx.needs.link.byDecision.get(d.id) ?? [];
	const ub = linked.length ? `<div class="dec-ub"><span class="ub-l">Unblocks</span>${linked.map((x) => partChip(x.part)).join("")}${linked.filter((x) => x.primary).map((x) => clampMore("wait", `${linked.length > 1 ? `${esc(shortName(x.part))} ` : ""}waiting on: ${esc(x.part.waitingOn)}`)).join("")}</div>` : "";
	return `<article class="dec" id="dec-${esc(d.id)}" aria-labelledby="dq-${esc(d.id)}">
<div class="dec-top"><span class="did">${esc(d.id)}</span><h3 class="dq" id="dq-${esc(d.id)}">${esc(d.question)}</h3></div>
${optHtml ? `<div class="opts" role="group" aria-label="Options for ${esc(d.id)}; each copies an answer prompt">${optHtml}</div>` : ""}
${why}${ub}${d.raised ? `<p class="raised">raised ${esc(fmtDay(d.raised, ctx.nowDate))}</p>` : ""}</article>`;
}
var stuckRow = (p) => `<button type="button" class="stuck-row" id="stuck-${esc(p.id)}" data-open-part="${esc(p.id)}"><span class="sr-ic">${icon(waitIcon(p.waitingOn))}</span><span class="sr-name">${glyph("stuck")}<span>${esc(p.name)}</span><span class="sr"> (stuck)</span></span><span class="sr-wait clamp2">waiting on: ${esc(p.waitingOn || "not stated")}</span></button>`;
/** The next step's own stuck part: one line pointing up to the Next card (its waitingOn would repeat it). */
var nextPartRow = (p) => `<a class="stuck-row is-next" id="stuck-${esc(p.id)}" href="#next"><span class="sr-ic">${icon("arrow")}</span><span class="sr-name">${glyph("stuck")}<span>${esc(p.name)}</span><span class="sr"> (stuck)</span></span><span class="sr-wait">is your next step <span aria-hidden="true">↑</span></span></a>`;
function needsSection(r, ctx) {
	const q = ctx.needs;
	const answered = r.decisions.filter((d) => d.answer);
	const room = Math.max(1, 4 - q.stuck.length);
	const shownD = q.decisions.slice(0, room);
	const restD = q.decisions.slice(room);
	const decBlock = (list) => list.length ? `<div class="dec-grid${list.length > 3 ? " two" : ""}">${list.map((d) => decisionCard(d, ctx)).join("")}</div>` : "";
	const stuckHtml = q.stuck.length || q.nextPart ? `<div class="stuck-list">${q.stuck.map(stuckRow).join("")}${q.nextPart ? nextPartRow(q.nextPart) : ""}</div>` : "";
	const warn = q.stuck.length || q.link.coverOf.size;
	return `<section id="needs" class="sec" aria-labelledby="h-needs"><span id="decisions" class="anchor"></span>${sh("needs", ctx, "Needs you", q.count ? ` <span class="count${warn ? " warn" : ""}">${q.count}</span>` : "", "h-needs")}
${q.count ? `${decBlock(shownD)}${stuckHtml}` : `<p class="ok-line"><span aria-hidden="true">${GLYPH.done}</span> Nothing is waiting on you</p>${stuckHtml}`}
${restD.length ? `<details class="more-needs"><summary>Show ${plural(restD.length, "more decision")}</summary>${decBlock(restD)}</details>` : ""}
${answered.length ? `<details id="answered" class="answered"><summary>${GLYPH.done} ${answered.length} answered</summary><ul>${answered.map((d) => `<li><b>${esc(d.id)}</b> ${esc(d.question)} <span class="muted">→ ${esc(d.answer)}</span></li>`).join("")}</ul></details>` : ""}
${q.decisions.length ? "<p class=\"muted small foot-note\">Until answered, the map assumes each default.</p>" : ""}
</section>`;
}
var linkedItems = (r, p) => r.milestones.flatMap((m) => m.items.filter((i) => i.partId === p.id).map((i) => ({
	...i,
	m: m.id
})));
/** Linked milestone items as plain text ("2/5 items"), so nothing on the pill needs a legend. */
function cells(done, total) {
	if (!total) return "";
	return `<span class="cells${done === total ? " all" : ""}" title="${done} of ${total} milestone items done"><span aria-hidden="true">${done === total ? GLYPH.done : "▰"}</span> ${done}/${total} ${total === 1 ? "item" : "items"}<span class="sr"> done</span></span>`;
}
function partsSection(r, ctx) {
	const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, r.parts.filter((p) => p.status === s).length]));
	const bar = STATUS_ORDER.filter((s) => counts[s]).map((s) => `<span class="seg st-${s}" style="flex:${counts[s]}"></span>`).join("");
	const legend = STATUS_ORDER.filter((s) => counts[s]).map((s) => `<li>${glyph(s)} ${counts[s]} ${STATUS_LABEL[s].toLowerCase()}</li>`).join("");
	const inferred = r.parts.length > 0 && r.parts.every((p) => p.statusSource === "inferred");
	const neutral = inferred && !ctx.judged;
	const prevStatus = new Map(ctx.changes.filter((c) => c.kind === "part-status").map((c) => [c.ref, String(c.from)]));
	const lc = (p) => p.metrics.lastCommit ? Date.parse(p.metrics.lastCommit) : 0;
	const live = r.parts.filter((p) => p.status !== "done").sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || lc(b) - lc(a));
	const done = r.parts.filter((p) => p.status === "done");
	const pill = (p) => {
		const items = linkedItems(r, p);
		const was = prevStatus.get(p.id);
		const age = p.metrics.lastCommit ? ctx.now - Date.parse(p.metrics.lastCommit) : null;
		const old = age != null && age > 14 * DAY_MS$2;
		const isNext = ctx.needs.nextPart?.id === p.id;
		const home = p.status === "stuck" ? ctx.needs.link.coverOf.has(p.id) ? `#dec-${ctx.needs.link.coverOf.get(p.id)}` : isNext ? "#next" : `#stuck-${p.id}` : null;
		return `<div class="pill st-${neutral ? "unjudged" : p.status}" id="pill-${esc(p.id)}"><span class="alias" id="part-${esc(p.id)}"></span>
<button type="button" class="pill-btn" data-open-part="${esc(p.id)}" aria-label="${esc(`${p.name}: ${neutral ? "not assessed yet" : STATUS_LABEL[p.status]}. Open details.`)}">${neutral ? "" : glyph(p.status)}<span class="pname">${esc(p.name)}</span>${was ? `<span class="ghost" title="was ${esc(STATUS_LABEL[was] ?? was)}">was ${GLYPH[was] ?? "?"}→</span>` : ""}</button>
<span class="p2">${cells(items.filter((i) => i.done).length, items.length)}${home ? `<a class="see" href="${esc(home)}">${isNext ? `→ see Next` : `${GLYPH.stuck} see Needs you`}</a>` : `<span>${plural(p.metrics.commits30d, "commit")}/30d</span>`}${age != null ? `<span class="age${old ? " old" : ""}" title="last commit ${esc(String(p.metrics.lastCommit).slice(0, 10))}">${esc(ago(p.metrics.lastCommit, ctx.now))}</span>` : "<span class=\"age\">no commits</span>"}</span>
</div>`;
	};
	const all = neutral ? r.parts.slice().sort((a, b) => lc(b) - lc(a)) : live;
	return `<section id="parts" class="sec" aria-labelledby="h-parts"><div class="parts-head">${sh("parts", ctx, "Parts", "", "h-parts")}
${neutral ? "<span class=\"muted small\">not assessed yet · one part per folder</span>" : r.parts.length ? `<span class="stack" role="img" aria-label="${STATUS_ORDER.map((s) => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(", ")}">${bar}</span><ul class="legend">${legend}</ul>` : ""}</div>
${inferred && ctx.judged ? "<p class=\"note\">Statuses guessed from activity. Run /rundown for a real read.</p>" : ""}
${r.parts.length ? "" : "<p class=\"muted\">No parts yet.</p>"}
${all.length ? `<div class="pills">${all.map(pill).join("")}</div>` : ""}
${done.length && !neutral ? `<p class="done-line">${glyph("done")} <b>${done.length} done:</b> ${done.map((p, i) => `${i ? "<span aria-hidden=\"true\">·</span>" : ""}<button type="button" class="linkish" id="pill-${esc(p.id)}" data-open-part="${esc(p.id)}"><span class="alias" id="part-${esc(p.id)}"></span>${esc(p.name)}</button>`).join(" ")}</p>` : ""}
</section>`;
}
/** A part's drawer, kept in a template until it's opened. */
function partDetail(r, p, ctx, folders) {
	const commits = (r.facts.git?.recentCommits ?? []).filter((c) => c.parts.includes(p.id)).slice(0, 6);
	const decisions = r.decisions.filter((d) => d.partId === p.id || p.waitingOn && new RegExp(`\\b${d.id}\\b`).test(p.waitingOn));
	const items = linkedItems(r, p);
	const m = p.metrics;
	return `<template id="tpl-${esc(p.id)}"><div class="dr-head"><h2>${esc(p.name)}</h2>${badge(p.status)}${p.statusSource === "inferred" ? "<span class=\"muted small\">guessed</span>" : ""}</div>
${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
${p.waitingOn ? `<p class="dr-wait">${icon(waitIcon(p.waitingOn))}<span><b>Waiting on</b> ${esc(p.waitingOn)}</span></p>` : ""}
<dl class="dr-nums"><div><dt>lines</dt><dd>${num(m.lines)}</dd></div><div><dt>test files</dt><dd>${num(m.testFiles)}</dd></div><div><dt>TODO</dt><dd>${num(m.todo + m.fixme)}</dd></div><div><dt>commits/30d</dt><dd>${num(m.commits30d)}</dd></div></dl>
${items.length ? `<h3>Milestone items</h3><ul class="dr-list">${items.map((i) => `<li><span class="${i.done ? "st-done" : "muted"}" aria-hidden="true">${i.done ? GLYPH.done : "○"}</span> <b>${esc(i.m)}</b> ${esc(i.text)}<span class="sr">${i.done ? " (done)" : " (open)"}</span></li>`).join("")}</ul>` : ""}
${decisions.length ? `<h3>Decisions</h3><ul class="dr-list">${decisions.map((d) => `<li>${d.answer ? `<b>${esc(d.id)}</b> ${esc(d.question)} <span class="muted">→ ${esc(d.answer)}</span>` : `<a href="#dec-${esc(d.id)}"><b>${esc(d.id)}</b> ${esc(d.question)}</a>`}</li>`).join("")}</ul>` : ""}
${p.evidence.length ? `<h3>Evidence</h3><ul class="dr-list">${p.evidence.map((e) => `<li><span class="kind">${esc(e.kind)}</span> ${e.ref ? `<code>${esc(e.ref)}</code> ` : ""}${esc(e.text)}</li>`).join("")}</ul>` : ""}
${commits.length ? `<h3>Recent commits</h3><ul class="dr-list">${commits.map((c) => `<li><code>${short(c.sha)}</code> ${esc(c.subject)} <span class="muted small">${esc(fmtDay(c.date, ctx.nowDate))}</span></li>`).join("")}</ul>` : ""}
<details class="dr-more"><summary>Paths and folders</summary><p>${p.paths.map((x) => `<code>${esc(x)}</code>`).join(" ") || "-"}</p>${folders.length ? `<ul class="dr-list">${folders.slice(0, 8).map((c) => `<li><code>${esc(c.path)}</code> <span class="muted">${plural(c.lines, "line")}</span></li>`).join("")}</ul>` : ""}<p class="muted small">${plural(m.files, "file")} · ${num(m.uncommitted)} uncommitted · last commit ${m.lastCommit ? esc(String(m.lastCommit).replace("T", " ").slice(0, 16)) : "none"}</p></details>
</template>`;
}
function laneLayout(branches, defaultBranch, worktrees, now) {
	const byBranch = new Map(worktrees.filter((w) => w.branch).map((w) => [w.branch, w]));
	const def = branches.find((b) => b.name === defaultBranch);
	const others = branches.filter((b) => b !== def).slice().sort((a, b) => Number(a.merged) - Number(b.merged) || b.date.localeCompare(a.date));
	const shown = others.slice(0, 15 - (def ? 1 : 0));
	const rest = others.slice(shown.length).map((b) => ({
		name: b.name,
		date: b.date,
		merged: b.merged
	}));
	const all = [...def ? [def] : [], ...shown];
	const times = all.flatMap((b) => [Date.parse(b.date), b.forkDate ? Date.parse(b.forkDate) : NaN]).filter((t) => Number.isFinite(t));
	const endT = Math.max(now.getTime(), ...times);
	const startT = times.length ? Math.min(...times) : endT - 2592e6;
	const span = Math.max(1, endT - startT);
	const pos = (iso, fallback) => {
		const t = iso ? Date.parse(iso) : NaN;
		return Number.isFinite(t) ? Math.min(1, Math.max(0, (t - startT) / span)) : fallback;
	};
	const lanes = all.map((b) => {
		const to = pos(b.date, 1);
		const isDefault = b === def;
		const from = isDefault ? 0 : Math.min(to, pos(b.forkDate, Math.max(0, to - .05)));
		const wt = byBranch.get(b.name);
		return {
			name: b.name,
			from,
			to,
			ahead: b.ahead,
			behind: b.behind,
			merged: b.merged,
			isDefault,
			date: b.date,
			worktree: wt ? {
				path: wt.path,
				owner: wt.owner
			} : null
		};
	});
	const def0 = lanes.find((l) => l.isDefault);
	if (def0) def0.to = Math.max(def0.to, ...lanes.map((l) => l.from));
	return {
		start: new Date(startT).toISOString(),
		end: new Date(endT).toISOString(),
		lanes,
		rest
	};
}
/** How many weeks to draw for a repository first committed on `first`: its age, MIN_WEEKS to WEEKS. */
function weeksFor(first, today) {
	const t = first ? Date.parse(first) : NaN;
	if (!Number.isFinite(t)) return 26;
	const weeks = Math.ceil((today.getTime() - t) / 6048e5) + 1;
	return Math.max(8, Math.min(26, weeks));
}
var pad = (n) => String(n).padStart(2, "0");
/** A date as YYYY-MM-DD in local time. */
var ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The step a count is on, against the busiest day: 1 to 4 for any commit at all, 0 for none. */
function levelOf(count, max) {
	if (count <= 0 || max <= 0) return 0;
	return Math.min(4, Math.max(1, Math.ceil(count / max * 4)));
}
function heatmap(byDay, today, nWeeks = 26) {
	const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const dow = (end.getDay() + 6) % 7;
	const start = new Date(end);
	start.setDate(end.getDate() - dow - (nWeeks - 1) * 7);
	const todayKey = ymd(end);
	let max = 0;
	for (const [k, v] of Object.entries(byDay)) if (k <= todayKey && v > max) max = v;
	const weeks = [];
	const at = new Date(start);
	for (let w = 0; w < nWeeks; w++) {
		const col = [];
		for (let d = 0; d < 7; d++) {
			const key = ymd(at);
			const count = byDay[key] ?? 0;
			const future = key > todayKey;
			col.push({
				date: key,
				count: future ? 0 : count,
				level: future ? 0 : levelOf(count, max),
				future
			});
			at.setDate(at.getDate() + 1);
		}
		weeks.push(col);
	}
	const back = (days) => {
		let n = 0;
		const d = new Date(end);
		for (let i = 0; i < days; i++) {
			n += byDay[ymd(d)] ?? 0;
			d.setDate(d.getDate() - 1);
		}
		return n;
	};
	let streak = 0;
	const d = new Date(end);
	if (!(byDay[ymd(d)] ?? 0)) d.setDate(d.getDate() - 1);
	while ((byDay[ymd(d)] ?? 0) > 0) {
		streak++;
		d.setDate(d.getDate() - 1);
	}
	return {
		weeks,
		totals: {
			d7: back(7),
			d30: back(30),
			d182: back(182)
		},
		streak,
		max
	};
}
//#endregion
//#region src/shared/rundown/treemap.ts
function worst(row, side) {
	const s = row.reduce((a, b) => a + b, 0);
	if (s <= 0 || side <= 0) return Infinity;
	let max = -Infinity;
	let min = Infinity;
	for (const r of row) {
		max = Math.max(max, r);
		min = Math.min(min, r);
	}
	const s2 = s * s;
	const w2 = side * side;
	return Math.max(w2 * max / s2, s2 / (w2 * min));
}
/**
* Lays `items` out in `box`, each sized by `value(item)`, biggest first. Items with no value at all
* get no tile; give them a floor first (withFloor) to keep them.
*/
function squarify(items, value, box) {
	const list = items.map((item) => ({
		item,
		v: Math.max(0, value(item))
	})).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
	const total = list.reduce((a, b) => a + b.v, 0);
	const out = [];
	if (!list.length || box.w <= 0 || box.h <= 0) return out;
	const scale = box.w * box.h / total;
	const areas = list.map((x) => x.v * scale);
	let { x, y, w, h } = box;
	let i = 0;
	while (i < list.length) {
		const side = Math.min(w, h);
		const row = [areas[i]];
		let j = i + 1;
		while (j < list.length && worst([...row, areas[j]], side) <= worst(row, side)) row.push(areas[j++]);
		const sum = row.reduce((a, b) => a + b, 0);
		if (w >= h) {
			const cw = sum / h;
			let cy = y;
			for (let k = 0; k < row.length; k++) {
				const ch = row[k] / cw;
				out.push({
					item: list[i + k].item,
					x,
					y: cy,
					w: cw,
					h: ch
				});
				cy += ch;
			}
			x += cw;
			w -= cw;
		} else {
			const rh = sum / w;
			let cx = x;
			for (let k = 0; k < row.length; k++) {
				const cw = row[k] / rh;
				out.push({
					item: list[i + k].item,
					x: cx,
					y,
					w: cw,
					h: rh
				});
				cx += cw;
			}
			y += rh;
			h -= rh;
		}
		i = j;
	}
	return out;
}
/** A rectangle shrunk by `pad` on every side (never below zero). */
function inset(r, pad) {
	return {
		x: r.x + pad,
		y: r.y + pad,
		w: Math.max(0, r.w - 2 * pad),
		h: Math.max(0, r.h - 2 * pad)
	};
}
//#endregion
//#region src/shared/rundown/page-hood.ts
var DAY_MS$1 = 864e5;
var kfmt = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k` : String(n);
var trunc = (s, n) => n < 2 ? "" : s.length > n ? `${s.slice(0, Math.max(1, n - 3))}...` : s;
var FLOOR = {
	stuck: .12,
	"in-progress": .06,
	"not-started": .05,
	done: .02
};
var CAP = .45;
/** Each part's treemap weight: its share of lines, between its status floor and the cap. */
function treemapWeights(parts) {
	const total = parts.reduce((s, p) => s + p.metrics.lines, 0) || 1;
	return parts.map((p) => ({
		part: p,
		value: Math.min(CAP, Math.max(FLOOR[p.status] ?? .02, p.metrics.lines / total))
	}));
}
function treemapSvg(r, W, H, cls, neutral) {
	return `<svg class="treemap ${cls}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Parts sized by lines of code">${squarify(treemapWeights(r.parts), (x) => x.value, {
		x: 0,
		y: 0,
		w: W,
		h: H
	}).map((t) => {
		const p = t.item.part;
		const b = inset(t, 3);
		const chars = Math.floor((b.w - 30) / 7.6);
		const name = b.h > 20 && chars > 2 ? `<text class="tm-name" x="${(b.x + 8).toFixed(1)}" y="${(b.y + 19).toFixed(1)}">${neutral ? "" : `<tspan class="g" aria-hidden="true">${GLYPH[p.status]}</tspan> `}${esc(trunc(p.name, chars))}</text>` : "";
		const sub = b.h > 40 && b.w > 60 ? `<text class="tm-sub" x="${(b.x + 8).toFixed(1)}" y="${(b.y + 36).toFixed(1)}">${esc(kfmt(p.metrics.lines))} ${p.metrics.lines === 1 ? "line" : "lines"}</text>` : "";
		const stl = neutral ? "not assessed" : STATUS_LABEL[p.status];
		return `<g class="tm-part st-${neutral ? "unjudged" : p.status}" tabindex="0" role="button" data-open-part="${esc(p.id)}" aria-label="${esc(`${p.name}: ${stl}, ${plural(p.metrics.lines, "line")}. Open details.`)}"><rect class="bg" x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="6"><title>${esc(p.name)} · ${stl} · ${plural(p.metrics.lines, "line")}</title></rect>${name}${sub}</g>`;
	}).join("")}</svg>`;
}
var panel = (id, title, gist, body) => `<details class="panel" id="${id}"><summary><span class="chev">${icon("chev")}</span><b>${title}</b><span class="gist">${gist}</span></summary><div class="panel-body">
${body}
</div></details>`;
function codebasePanel(r, ctx) {
	const total = r.parts.reduce((s, p) => s + p.metrics.lines, 0);
	const partFiles = r.parts.reduce((s, p) => s + p.metrics.files, 0);
	const un = ctx.unassigned;
	const unPct = un ? Math.round(un / (un + partFiles) * 100) : 0;
	const neutral = !ctx.judged && r.parts.every((p) => p.statusSource === "inferred");
	const rows = r.parts.map((p) => `<tr><th scope="row"><button type="button" class="linkish" data-open-part="${esc(p.id)}">${esc(p.name)}</button></th><td>${neutral ? "not assessed" : `${glyph(p.status)} ${STATUS_LABEL[p.status]}`}</td><td class="n">${num(p.metrics.lines)}</td><td class="n">${num(p.metrics.files)}</td><td class="n">${num(p.metrics.testFiles)}</td><td class="n">${num(p.metrics.todo + p.metrics.fixme)}</td><td class="n">${num(p.metrics.commits30d)}</td><td class="n">${p.metrics.lastCommit ? esc(fmtDay(p.metrics.lastCommit, ctx.nowDate)) : "-"}</td></tr>`).join("");
	return panel("hood-code", "Codebase", `${esc(kfmt(total))} lines in ${plural(r.parts.length, "part")}${un ? ` · ${unPct < 1 ? "<1" : unPct}% of files in no part` : ""}`, `${r.parts.length ? treemapSvg(r, 1e3, 420, "wide", neutral) + treemapSvg(r, 400, 560, "narrow", neutral) : ""}
<p class="muted small">Area = all lines in the part's files, docs and data included (small parts get a minimum size).${un ? ` ${plural(un, "file")} are in no part.` : ""}</p>
<div class="tablewrap"><table class="parts-t"><caption class="sr">Parts with their size and activity</caption><thead><tr><th scope="col">Part</th><th scope="col">Status</th><th scope="col" class="n">Lines</th><th scope="col" class="n">Files</th><th scope="col" class="n">Tests</th><th scope="col" class="n">TODO</th><th scope="col" class="n">Commits 30d</th><th scope="col" class="n">Last commit</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
var initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
function activityPanel(r, ctx) {
	const g = r.facts.git;
	if (!g || !g.totalCommits) return "";
	const weeks = weeksFor(g.firstCommit, ctx.nowDate);
	const h = heatmap(g.activityByDay, ctx.nowDate, weeks);
	const C = 13;
	const L = 28;
	const T = 16;
	const cells = h.weeks.flatMap((col, w) => col.filter((c) => !c.future).map((c, d) => `<rect class="hm l${c.level}" x="${L + w * 16}" y="${T + d * 16}" width="${C}" height="${C}" rx="3"><title>${c.date}: ${plural(c.count, "commit")}</title></rect>`)).join("");
	const months = [];
	let last = "";
	h.weeks.forEach((col, w) => {
		const m = col[0].date.slice(0, 7);
		if (m !== last && Number(col[0].date.slice(8)) <= 7) months.push(`<text class="ax" x="${L + w * 16}" y="11">${(/* @__PURE__ */ new Date(`${col[0].date}T12:00:00`)).toLocaleString("en-US", { month: "short" })}</text>`);
		last = m;
	});
	const days = [
		"Mon",
		"Wed",
		"Fri"
	].map((d, i) => `<text class="ax" x="0" y="${T + i * 2 * 16 + 10}">${d}</text>`).join("");
	const W = L + weeks * 16;
	const H = 128;
	const weekly = h.weeks.map((col) => ({
		start: col[0].date,
		n: col.reduce((s, c) => s + c.count, 0)
	}));
	const last5 = weekly.slice(-5).map((x) => x.n);
	const windowTotal = weekly.reduce((s, x) => s + x.n, 0);
	const who = g.contributors.slice(0, 5);
	return panel("hood-activity", "Activity", `${miniBars(last5, `Commits in the last ${last5.length} weeks: ${last5.join(", ")}`)} ${plural(g.totalCommits, "commit")}${h.streak ? ` · ${h.streak}-day streak` : ""}`, `<div class="act"><div><svg class="heatmap" viewBox="0 0 ${W} ${H}" style="max-width:${Math.round(Math.min(620, W * 1.6))}px" role="img" aria-label="Commits per day over the last ${weeks} weeks; weekly totals in the table that follows">${months.join("")}${days}${cells}</svg>
<table class="sr"><caption>Commits per week</caption><thead><tr><th scope="col">Week of</th><th scope="col">Commits</th></tr></thead><tbody>${weekly.map((x) => `<tr><td>${x.start}</td><td>${x.n}</td></tr>`).join("")}</tbody></table>
<p class="muted small">${num(h.totals.d7)} this week · ${num(h.totals.d30)} in 30 days · ${num(windowTotal)} in ${weeks} weeks</p></div>
${who.length ? `<ul class="contrib" aria-label="Top contributors, 90 days">${who.map((c) => `<li title="${esc(c.name)}"><span class="av" aria-hidden="true">${esc(initials(c.name))}</span><span class="cn">${esc(c.name.split(/\s+/)[0])}</span><b>${num(c.commits)}</b></li>`).join("")}</ul>` : ""}</div>
${g.recentCommits.length ? `<details class="sub-d"><summary>Last ${g.recentCommits.length} commits</summary><ul class="commits">${g.recentCommits.map((c) => `<li><code>${short(c.sha)}</code> <span>${esc(c.subject)}</span> <span class="muted small">${esc(fmtDay(c.date, ctx.nowDate))}${c.parts.length ? ` · ${esc(c.parts.join(", "))}` : ""}</span></li>`).join("")}</ul></details>` : ""}`);
}
function branchesPanel(r, ctx) {
	const g = r.facts.git;
	if (!g || !g.branches.length) return "";
	if (g.branches.length <= 1 && g.worktrees.length <= 1) return "";
	const def = r.project.defaultBranch;
	const lay = laneLayout(g.branches, def, g.worktrees, ctx.nowDate);
	const facts = new Map(g.branches.map((b) => [b.name, b]));
	const X0 = 300;
	const X1 = 975;
	const RH = 34;
	const TOP = 24;
	const H = TOP + lay.lanes.length * RH + 26;
	const yDef = 41;
	const x = (u) => X0 + u * 675;
	const meta = (name) => {
		const b = facts.get(name);
		if (!b) return "";
		return `${b.name === def ? "default" : b.forkDate ? `+${b.ahead} / -${b.behind}` : "no shared history"} · ${esc(ago(b.date, ctx.now))}${b.merged ? " · merged" : ""}`;
	};
	const rows = lay.lanes.map((l, i) => {
		const y = TOP + i * RH + RH / 2;
		const tip = x(l.to);
		const line = l.isDefault ? `<line class="lane def" x1="${X0}" y1="${y}" x2="${tip.toFixed(1)}" y2="${y}"/>` : facts.get(l.name)?.forkDate ? `<path class="lane" d="M${x(l.from).toFixed(1)},${yDef} Q${x(l.from).toFixed(1)},${y} ${(x(l.from) + Math.min(16, tip - x(l.from))).toFixed(1)},${y} L${tip.toFixed(1)},${y}"/>` : `<line class="lane nobase" x1="${X0}" y1="${y}" x2="${tip.toFixed(1)}" y2="${y}"/>`;
		const w = l.worktree;
		return `<g class="br${l.isDefault ? " isdef" : ""}"><title>${esc(l.name)}, last commit ${esc(l.date.slice(0, 10))}${w ? `, worktree ${esc(w.path)}` : ""}</title>
<text class="br-name" x="8" y="${y - 3}">${esc(trunc(l.name, w ? 28 : 34))}${w ? "<tspan class=\"wt-t\" dx=\"8\">WORKTREE</tspan>" : ""}</text><text class="br-meta" x="8" y="${y + 11}">${meta(l.name)}</text>${line}<circle class="tip${w ? " has-wt" : ""}" cx="${tip.toFixed(1)}" cy="${y}" r="5"/></g>`;
	}).join("");
	const t0 = Date.parse(lay.start);
	const span = Date.parse(lay.end) - t0;
	const fmt = (t) => {
		const d = new Date(t);
		const md = d.toLocaleString("en-US", {
			month: "short",
			day: "numeric"
		});
		return span < 6 * DAY_MS$1 ? `${md} ${String(d.getHours()).padStart(2, "0")}:00` : md;
	};
	const ticks = [
		0,
		.5,
		1
	].map((f) => `<text class="ax" x="${x(f).toFixed(1)}" y="${H - 6}" text-anchor="${f === 0 ? "start" : f === 1 ? "end" : "middle"}">${fmt(t0 + f * span)}</text>`).join("");
	const wtN = g.worktrees.length;
	const wt = new Set(g.worktrees.map((w) => w.branch).filter(Boolean));
	return panel("hood-branches", "Branches", `${lay.lanes.length} shown${wtN > 1 ? ` · ${plural(wtN, "worktree")}` : ""}${lay.rest.length ? ` · ${lay.rest.length} more` : ""}`, `<p class="muted small">Each branch forks off <code>${esc(def || "the default branch")}</code> at its merge-base; +ahead / -behind.</p>
<ul class="br-list" aria-label="Branches">${lay.lanes.map((l) => `<li><code>${esc(l.name)}</code>${wt.has(l.name) ? " <span class=\"wt-inline\">WORKTREE</span>" : ""}<div class="muted small">${meta(l.name)}</div></li>`).join("")}</ul>
<div class="br-svg"><svg class="branches" viewBox="0 0 1000 ${H}" aria-hidden="true">${ticks}<line class="now" x1="${X1}" y1="16" x2="${X1}" y2="${H - 22}"/>${rows}</svg></div>
${lay.rest.length ? `<details class="sub-d"><summary>${plural(lay.rest.length, "more branch", "more branches")}</summary><ul class="plain">${lay.rest.map((b) => `<li><code>${esc(b.name)}</code> <span class="muted small">${meta(b.name)}</span></li>`).join("")}</ul></details>` : ""}
${wtN > 1 ? `<h3 class="mini-h">Worktrees</h3><ul class="plain">${g.worktrees.map((w) => `<li><code>${esc(w.path)}</code> ${w.branch ? esc(w.branch) : `detached at ${short(w.sha)}`}${w.locked ? " · locked" : ""}${w.prunable ? " · prunable" : ""}</li>`).join("")}</ul>` : ""}`);
}
var NOT_CODE = /* @__PURE__ */ new Set([
	"Markdown",
	"JSON",
	"CSV",
	"YAML",
	"Text",
	"Other",
	"TOML",
	"XML",
	"SVG",
	"reStructuredText",
	"Lockfile"
]);
/** The language with the most lines of code (docs and data left out), and its share. */
function topCodeLanguage(langs) {
	const code = Object.entries(langs).filter(([k, v]) => v.lines > 0 && !NOT_CODE.has(k));
	const total = code.reduce((s, [, v]) => s + v.lines, 0);
	if (!total) return null;
	const [name, v] = code.sort((a, b) => b[1].lines - a[1].lines)[0];
	return {
		name,
		pct: Math.round(v.lines / total * 100)
	};
}
function repoPanel(r) {
	const f = r.facts.files;
	const g = r.facts.git;
	const u = g?.uncommitted;
	const unc = u ? u.staged + u.modified + u.deleted + u.untracked : 0;
	const todo = f.todo.todo + f.todo.fixme;
	const langs = Object.entries(f.languages).filter(([, v]) => v.lines > 0).sort((a, b) => b[1].lines - a[1].lines);
	const totalLines = langs.reduce((s, [, v]) => s + v.lines, 0) || 1;
	const top = langs.slice(0, 7).map(([k, v]) => [k, v.lines]);
	const other = langs.slice(7).reduce((s, [, v]) => s + v.lines, 0);
	if (other) top.push(["Other", other]);
	const pct = (n) => Math.round(n / totalLines * 100);
	const tile = (label, value, sub, cls = "") => `<div${cls ? ` class="${cls}"` : ""}><dt>${label}</dt><dd>${value}</dd>${sub ? `<dd class="small muted">${sub}</dd>` : ""}</div>`;
	return panel("hood-repo", "Repo", "tests, TODO, languages", `<dl class="vitals">
${tile("Test cases", `~${num(f.tests.casesApprox)}`, f.tests.frameworks.length ? esc(f.tests.frameworks.join(", ")) : "")}
${tile("TODO / FIXME", num(todo), `${num(f.todo.todo)} TODO · ${num(f.todo.fixme)} FIXME`)}
${u && unc ? tile("Uncommitted", num(unc), `${u.staged} staged · ${u.modified} modified · ${u.deleted} deleted · ${u.untracked} untracked${g?.stashes ? ` · ${plural(g.stashes, "stash", "stashes")}` : ""}`, "show-s") : ""}
</dl>
${top.length ? `<div class="langbar" role="img" aria-label="All lines by language: ${top.map(([k, n]) => `${esc(k)} ${pct(n)}%`).join(", ")}">${top.map(([k, n], i) => `<span class="lang l${i}" style="flex:${n}" title="${esc(k)}: ${num(n)} lines"></span>`).join("")}</div>
<ul class="langs" aria-hidden="true">${top.map(([k, n], i) => `<li><span class="sw l${i}"></span>${esc(k)} <span class="muted">${pct(n)}%</span></li>`).join("")}</ul>
<p class="muted small">Share of all lines, docs and data included.</p>` : ""}${r.facts.gaps.length || r.facts.truncated || f.skippedSensitive ? `<ul class="plain small muted">${[
		...r.facts.gaps,
		...r.facts.truncated ? ["A limit was hit: the numbers are partial"] : [],
		...f.skippedSensitive ? [`${plural(f.skippedSensitive, "file")} on the deny list (keys, .env, credentials, dumps, logs) were counted, never opened`] : []
	].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`);
}
function hoodSection(r, ctx) {
	const g = r.facts.git;
	const t = r.facts.files.tests;
	const tDelta = ctx.prev ? t.files - ctx.prev.testFiles : 0;
	const up = g?.upstream;
	const gh = r.facts.github;
	const lang = topCodeLanguage(r.facts.files.languages);
	const gist = [
		`${plural(t.files, "test file")}${tDelta ? ` (${tDelta > 0 ? "+" : ""}${tDelta})` : ""}`,
		up ? `↑${up.ahead} ↓${up.behind} ${esc(up.ref)}` : null,
		gh ? plural(gh.openPrs.length, "PR") : null,
		gh ? plural(gh.openIssues, "issue") : null,
		lang ? `${esc(lang.name)} ${lang.pct}% of code` : null
	].filter(Boolean).join(" · ");
	return `<details id="hood" class="hood"><summary><span class="chev">${icon("chev")}</span><b>Under the hood</b><span class="gist">${gist}</span></summary>
${codebasePanel(r, ctx)}${activityPanel(r, ctx)}${branchesPanel(r, ctx)}${repoPanel(r)}
</details>`;
}
var JS_THEME = `function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
var tb=$('#theme');
function apply(t){root.setAttribute('data-theme',t);if(tb){tb.setAttribute('aria-pressed',t==='dark'?'true':'false');tb.title=t==='dark'?'Dark theme (click for light)':'Light theme (click for dark)'}}
var saved=get('rundown-theme');apply(saved==='light'||saved==='dark'?saved:root.getAttribute('data-theme')||'dark');
if(tb)tb.addEventListener('click',function(){var t=root.getAttribute('data-theme')==='dark'?'light':'dark';apply(t);put('rundown-theme',t)});`;
var JS_REL = `function rel(iso){var s=Math.round((Date.now()-Date.parse(iso))/1000);if(!isFinite(s))return null;if(s<60)return'just now';var u=[[31536000,'y'],[2592000,'mo'],[604800,'w'],[86400,'d'],[3600,'h'],[60,'min']];for(var i=0;i<u.length;i++)if(s>=u[i][0])return Math.floor(s/u[i][0])+u[i][1]+' ago';return'just now'}
$$('time[data-rel]').forEach(function(t){var v=rel(t.getAttribute('datetime'));if(v)t.textContent=v});`;
var PAGE_JS = `
(function(){
var d=document,root=d.documentElement;root.classList.add('js');
function $(s,c){return (c||d).querySelector(s)}
function $$(s,c){return Array.prototype.slice.call((c||d).querySelectorAll(s))}
${JS_THEME}
var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function reveal(el){for(var p=el;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open)p.open=true}
function go(id){var el=d.getElementById(id);if(!el)return false;reveal(el);el.scrollIntoView({block:'start',behavior:calm?'auto':'smooth'});if(!/^(A|BUTTON|SUMMARY|DETAILS)$/.test(el.tagName)&&!el.hasAttribute('tabindex'))el.setAttribute('tabindex','-1');try{el.focus({preventScroll:true})}catch(e){}return true}
var dlg=$('#drawer'),body=$('#drawer-body'),last=null;
function openPart(id){var tpl=d.getElementById('tpl-'+id);if(!tpl||!dlg)return false;last=d.activeElement;body.innerHTML='';body.appendChild(tpl.content.cloneNode(true));var h=body.querySelector('h2');if(h)$('#drawer-title').textContent=h.textContent;if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');var c=dlg.querySelector('.close');if(c)c.focus();return true}
function closeDlg(){if(!dlg)return;if(dlg.close)dlg.close();else dlg.removeAttribute('open')}
if(dlg){dlg.querySelector('.close').addEventListener('click',closeDlg);dlg.addEventListener('click',function(e){if(e.target===dlg)closeDlg()});dlg.addEventListener('close',function(){if(last&&last.focus)last.focus();last=null})}
var toast=$('#toast'),tt;
function say(m){toast.textContent=m;toast.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){toast.classList.remove('on')},2600)}
function manual(text){var box=$('#copybox'),c=$('#copybox code');c.textContent=text;box.hidden=false;var rg=d.createRange();rg.selectNodeContents(c);var s=getSelection();s.removeAllRanges();s.addRange(rg);say('Press Cmd/Ctrl+C to copy')}
function legacy(text,msg){var ta=d.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.top='0';ta.style.opacity='0';d.body.appendChild(ta);ta.select();var ok=false;try{ok=d.execCommand('copy')}catch(e){}d.body.removeChild(ta);if(ok)say(msg);else manual(text)}
function copy(text,msg){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){say(msg)},function(){legacy(text,msg)})}else legacy(text,msg)}
var ck=$('#checklist'),home=ck?ck.innerHTML:'';
function selectMs(id){if(!ck)return;$$('.node.sel').forEach(function(n){n.classList.remove('sel')});var node=d.getElementById('node-'+id);var src=d.getElementById('msd-'+id);if(src){if(node)node.classList.add('sel');var c=src.cloneNode(true);c.removeAttribute('id');c.className='ck';c.open=true;ck.innerHTML='';ck.appendChild(c)}else ck.innerHTML=home}
d.addEventListener('click',function(e){
var t=e.target;if(!t||!t.closest)return;var a;
if((a=t.closest('[data-copy]'))){e.preventDefault();copy(a.getAttribute('data-copy'),a.getAttribute('data-toast')||'Copied');return}
if(t.closest('[data-hide-copybox]')){$('#copybox').hidden=true;return}
if(!t.closest('a.see')&&(a=t.closest('[data-open-part]'))){if(openPart(a.getAttribute('data-open-part')))e.preventDefault();return}
if((a=t.closest('[data-ms]'))){e.preventDefault();selectMs(a.getAttribute('data-ms'));return}
if((a=t.closest('[data-unfold]'))){e.preventDefault();if(window.innerWidth<640)go('ms-others');else{var tr=$('.track');if(tr)tr.classList.add('unfold')}return}
if((a=t.closest('[data-select-ms]'))){e.preventDefault();selectMs(a.getAttribute('data-select-ms'));go('road');return}
if((a=t.closest('a[href^="#"]'))){var id=a.getAttribute('href').slice(1);if(!id)return;if(dlg&&dlg.open&&dlg.contains(a)){last=null;closeDlg()}if(go(id)){e.preventDefault();try{history.replaceState(null,'','#'+id)}catch(x){}}}
});
d.addEventListener('keydown',function(e){if(e.key!=='Enter'&&e.key!==' ')return;var g=e.target.closest&&e.target.closest('[role=button][data-open-part]');if(g&&g.tagName!=='BUTTON'){e.preventDefault();openPart(g.getAttribute('data-open-part'))}});
if(location.hash.length>1){var hel=d.getElementById(location.hash.slice(1));if(hel){reveal(hel);setTimeout(function(){hel.scrollIntoView()},0)}}
var hood=$('#hood');if(hood){if(get('rundown-hood')==='1')hood.open=true;hood.addEventListener('toggle',function(){put('rundown-hood',hood.open?'1':'0')})}
var links=$$('.rail a[data-rail]');
if('IntersectionObserver' in window&&links.length){var vis={};var io=new IntersectionObserver(function(es){es.forEach(function(x){vis[x.target.id]=x.isIntersecting});var cur=null;for(var i=0;i<links.length;i++){if(vis[links[i].getAttribute('data-rail')]){cur=links[i];break}}links.forEach(function(l){l.classList.toggle('on',l===cur);if(l===cur)l.setAttribute('aria-current','location');else l.removeAttribute('aria-current')})},{rootMargin:'-90px 0px -45% 0px'});links.forEach(function(l){var s=d.getElementById(l.getAttribute('data-rail'));if(s)io.observe(s)})}
function fit(){$$('.desc,.cmore').forEach(function(x){if(x.open)return;var c=x.querySelector('summary>span');x.classList.toggle('fits',!!c&&c.scrollHeight<=c.clientHeight+1)})}fit();
var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(fit,150)});d.addEventListener('toggle',function(e){if(e.target.id==='hood'||e.target.classList.contains('more-needs'))fit()},true);
d.addEventListener('click',function(e){var sm=e.target.closest&&e.target.closest('.fits>summary');if(sm&&!e.target.closest('a,button'))e.preventDefault()},true);
${JS_REL}
})();`;
var INDEX_JS = `
(function(){
var d=document,root=d.documentElement;root.classList.add('js');
function $(s,c){return (c||d).querySelector(s)}
function $$(s,c){return Array.prototype.slice.call((c||d).querySelectorAll(s))}
${JS_THEME}
${JS_REL}
var q=$('#q'),cards=$$('#pcs > li'),none=$('#nomatch');
// A card goes stale while the page sits open or unrefreshed for days.
cards.forEach(function(c){var t=c.querySelector('time[datetime]');if(!t||c.classList.contains('stale'))return;if(Date.now()-Date.parse(t.getAttribute('datetime'))>14*864e5){c.classList.add('stale');var m=d.createElement('span');m.className='stale-m';m.textContent='stale';t.parentNode.insertBefore(m,t)}});
if(q)q.addEventListener('input',function(){var v=q.value.trim().toLowerCase(),n=0;cards.forEach(function(c){var hit=!v||c.getAttribute('data-q').indexOf(v)!==-1;c.hidden=!hit;if(hit)n++});if(none)none.hidden=n>0});
})();`;
//#endregion
//#region src/shared/rundown/html.ts
/** JSON safe inside a <script> element: no "<\/script>", no "<!--". */
function scriptJson(v) {
	return JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
/** The accents a style file or --accent may name. */
var ACCENTS = {
	orange: "#ff8a3d",
	amber: "#fbbf24",
	yellow: "#facc15",
	red: "#f87171",
	rose: "#fb7185",
	pink: "#f472b6",
	purple: "#a78bfa",
	violet: "#a78bfa",
	indigo: "#818cf8",
	blue: "#60a5fa",
	cyan: "#22d3ee",
	teal: "#2dd4bf",
	green: "#4ade80",
	lime: "#a3e635"
};
/** `#rrggbb` for a name or a colour, or null when it's neither. */
function accentHex(accent) {
	if (!accent) return null;
	const a = accent.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(a)) return a;
	return ACCENTS[a] ?? null;
}
/** The accent for each theme: as is on dark, a darker shade on light so text in it stays readable. */
function accentPair(accent) {
	const hex = accentHex(accent) ?? ACCENTS.orange;
	if (hex === ACCENTS.orange) return {
		dark: hex,
		light: "#c2410c"
	};
	const n = Number.parseInt(hex.slice(1), 16);
	return {
		dark: hex,
		light: `#${[
			n >> 16 & 255,
			n >> 8 & 255,
			n & 255
		].map((c) => Math.round(c * .58).toString(16).padStart(2, "0")).join("")}`
	};
}
/** Files in no part, from the folder buckets. */
function unassignedFiles(r) {
	if (!r.parts.length) return 0;
	return r.facts.files.dirs.reduce((s, d) => s + (partOfPath(r.parts, d.path) ? 0 : d.files), 0);
}
function renderPage(r, now = /* @__PURE__ */ new Date(), style = {}, extras = {}) {
	const accent = accentPair(style.accent);
	const theme = style.theme === "light" ? "light" : "dark";
	const isJudged = judged(r);
	const needs = needsQueue(r);
	const steps = [];
	if (isJudged) steps.push({
		id: "road",
		label: "Road"
	}, {
		id: "next",
		label: "Next"
	});
	if (isJudged || needs.count || needs.nextPart) steps.push({
		id: "needs",
		label: "Needs you",
		short: "Needs"
	});
	steps.push({
		id: "parts",
		label: "Parts"
	});
	const ctx = {
		now: now.getTime(),
		nowDate: now,
		theme,
		judged: isJudged,
		steps,
		needs,
		prev: extras.prev ?? null,
		judgedAt: extras.judgedAt ?? null,
		indexHref: extras.indexHref ?? null,
		changes: r.changes,
		partById: new Map(r.parts.map((p) => [p.id, p])),
		nextItem: nextItem(r),
		unassigned: unassignedFiles(r)
	};
	const sections = {
		road: roadSection,
		next: nextSection,
		needs: needsSection,
		parts: partsSection
	};
	const body = steps.map((s) => sections[s.id](r, ctx)).join("\n");
	const intro = isJudged ? "" : `<div class="sec intro"><p class="note">No judgement yet: run <b>/rundown</b> for milestones, a next step and decisions. Until then each top folder is a part.</p>${sinceRow(r, ctx)}</div>`;
	const remote = r.project.remote ? ` · ${esc(r.project.remote)}` : "";
	return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>${esc(r.project.name)} rundown</title>
<style>${BASE_CSS(accent.dark, accent.light)}${PAGE_CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${header(r, ctx)}
<main class="wrap" id="main">
${describe(r)}
${intro}
${body}
${hoodSection(r, ctx)}
<footer>Edit <code>.rundown/milestones.md</code> or <code>decisions.md</code>, then <code>/rundown quick</code>${ctx.indexHref ? ` · <a href="${esc(ctx.indexHref)}">All rundowns</a>` : ""} · ${esc(r.generator.name)} ${esc(r.generator.version)} · ${esc(r.generator.mode)} run${remote} · generated ${time(r.generatedAt, ctx.now)}${r.facts.durationMs != null ? ` in ${num(r.facts.durationMs)} ms` : ""}. Nothing on this page leaves your computer.</footer>
</main>
<noscript><p class="wrap muted small">The part drawer, copy buttons and theme toggle need JavaScript; everything else works without it.</p></noscript>
<dialog id="drawer" aria-labelledby="drawer-title"><span id="drawer-title" class="sr">Part details</span><button class="close" type="button" aria-label="Close">×</button><div class="dlg-body" id="drawer-body"></div></dialog>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div id="copybox" class="copybox" hidden><p class="small">Press Cmd/Ctrl+C to copy:</p><code></code><button type="button" class="btn-ghost" data-hide-copybox>Done</button></div>
${r.parts.map((p) => partDetail(r, p, ctx, partFolders(r, p))).join("\n")}
<script type="application/json" id="rundown">${scriptJson(r)}<\/script>
<script>${PAGE_JS}<\/script>
</body>
</html>
`;
}
//#endregion
//#region src/shared/rundown/index-page.ts
/** The registry entry for one rendered project. */
function indexEntry(r, at) {
	const active = r.milestones.find((m) => m.state === "active") ?? null;
	const q = needsQueue(r);
	return {
		root: at.root,
		name: cutWords(r.project.name || at.root, 200),
		htmlPath: at.htmlPath,
		generatedAt: r.generatedAt,
		mode: r.generator.mode,
		branch: r.project.head?.branch ?? null,
		judged: judged(r),
		description: r.project.description ? cutWords(r.project.description, 160) : null,
		milestone: active ? {
			id: active.id,
			name: cutWords(active.name, 60),
			done: active.items.filter((i) => i.done).length,
			total: active.items.length,
			due: active.due
		} : null,
		milestonesDone: r.milestones.length > 0 && !active,
		next: r.nextStep ? cutWords(r.nextStep.text, 160) : null,
		needs: {
			decisions: q.decisions.length,
			stuck: q.stuck.length
		},
		parts: r.parts.length,
		counts: Object.fromEntries(STATUSES.map((s) => [s, r.parts.filter((p) => p.status === s).length])),
		dev: at.dev
	};
}
/** Whether something read from index.json is an entry this page can draw. */
function validEntry(e) {
	const x = e;
	return !!x && typeof x.root === "string" && typeof x.htmlPath === "string" && typeof x.name === "string" && typeof x.generatedAt === "string";
}
var FILTER_FROM = 9;
var DAY_MS = 864e5;
function road(e) {
	if (!e.judged) return `<span class="muted">not assessed yet, ${plural(e.parts || 0, "part")} by folder</span>`;
	const m = e.milestone;
	if (!m) return `<span class="muted">${e.milestonesDone ? "all milestones done" : "no milestones yet"}</span>`;
	const pct = m.total ? Math.round(m.done / m.total * 100) : 0;
	return `<b class="ms-id">${esc(m.id)}</b> <span class="ms-n">${esc(m.name)}</span><span class="pbar" role="img" aria-label="${num(m.done)} of ${num(m.total)} done"><span style="width:${pct}%"></span></span><span class="ms-c">${num(m.done)}/${num(m.total)}</span>${m.due ? `<span class="muted">due ${esc(fmtDay(m.due))}</span>` : ""}`;
}
/** One project's card; `href` is its page as a file: URL and `pathLabel` its root, tildified. */
function card(pc, now) {
	const t = Date.parse(pc.generatedAt);
	const stale = Number.isFinite(t) && now - t > 14 * DAY_MS;
	const waiting = pc.needs.decisions + pc.needs.stuck;
	const needsBits = [pc.needs.decisions ? plural(pc.needs.decisions, "open decision") : "", pc.needs.stuck ? `${num(pc.needs.stuck)} stuck` : ""].filter(Boolean).join(", ");
	const counts = STATUS_ORDER.filter((s) => pc.counts?.[s]).map((s) => `<span><span class="st-${s}" aria-hidden="true">${GLYPH[s]}</span> ${num(pc.counts[s])} ${STATUS_LABEL[s].toLowerCase()}</span>`).join("");
	const at = Number.isFinite(t) ? `updated ${pc.generatedAt.slice(0, 16).replace("T", " ")}` : "";
	const tip = [
		pc.name,
		pc.description,
		pc.pathLabel,
		at,
		needsBits && `needs you: ${needsBits}`
	].filter(Boolean).join("\n");
	return `<li class="pc${stale ? " stale" : ""}" data-q="${esc(`${pc.name} ${pc.pathLabel} ${pc.branch ?? ""}`.toLowerCase())}">
<div class="pc-top"><a class="pc-name" href="${esc(pc.href)}" title="${esc(tip)}">${esc(pc.name)}</a>${waiting ? `<span class="needs-b">${icon("person")}needs you ${num(waiting)}<span class="sr">: ${esc(needsBits)}</span></span>` : ""}<span class="pc-age">${stale ? "<span class=\"stale-m\">stale</span>" : ""}${time(pc.generatedAt, now)}</span></div>
<div class="pc-path"><span class="pp"><bdi>${esc(pc.pathLabel)}</bdi></span>${pc.branch ? `<span class="pc-br">${esc(pc.branch)}</span>` : ""}</div>
<div class="pc-road">${road(pc)}</div>
${pc.next ? `<p class="pc-next clamp1"><span class="arrow" aria-hidden="true">→</span> ${esc(pc.next)}</p>` : ""}
${pc.judged && counts ? `<div class="pc-parts">${counts}</div>` : ""}
</li>`;
}
/** The index page; `entries` newest first, each with its href and pathLabel set. */
function renderIndexPage(entries, style = {}, now = Date.now()) {
	const accent = accentPair(style.accent);
	const theme = style.theme === "light" ? "light" : "dark";
	const list = entries.length ? `<ul class="pcs" id="pcs">${entries.map((e) => card(e, now)).join("\n")}</ul><p class="muted small" id="nomatch" hidden>No project matches.</p>` : "<p class=\"note\">No rundowns yet. Run <b>/rundown</b> in a project and it shows up here.</p>";
	const filter = entries.length >= FILTER_FROM ? "<input id=\"q\" class=\"q\" type=\"search\" placeholder=\"Filter by name, path or branch\" aria-label=\"Filter projects\" autocomplete=\"off\">" : "";
	return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<meta name="referrer" content="no-referrer">
<title>Rundowns</title>
<style>${BASE_CSS(accent.dark, accent.light)}${INDEX_CSS}</style>
</head>
<body>
<header class="top"><div class="wrap bar">
<h1 class="brand"><span class="bdot" aria-hidden="true"></span><span class="bname">Rundowns</span></h1><span class="count">${num(entries.length)}<span class="sr"> ${entries.length === 1 ? "project" : "projects"}</span></span><span class="grow"></span>
<button id="theme" class="icon-btn" type="button" aria-pressed="${theme === "dark"}" aria-label="Dark theme">${icon("moon", "i-moon")}${icon("sun", "i-sun")}</button>
</div></header>
<main class="wrap" id="main">
${entries.length ? "<p class=\"help muted\">Every project you ran /rundown in, newest first. Click a card to open its rundown.</p>" : ""}
${filter}
${list}
<footer>Updated every time a project's rundown page is drawn (a full or quick /rundown). Projects whose page is gone drop off.</footer>
</main>
<script>${INDEX_JS}<\/script>
</body>
</html>
`;
}
//#endregion
//#region src/shared/rundown/markdown.ts
var PROPOSED_LINE = "Proposed: edit me.";
var DATE = /\b(\d{4}-\d{2}-\d{2})\b/;
/** Reads milestones.md: "## M1. Name (due 2026-10-12)", "Done when: ...", "- [x] item (part: core)". */
function parseMilestones(md) {
	const out = {
		proposed: false,
		milestones: []
	};
	let cur = null;
	for (const raw of md.split(/\r?\n/)) {
		const line = raw.trimEnd();
		if (/^Proposed: edit me/i.test(line.trim())) out.proposed = true;
		const head = /^##\s+(M\d+)[.:)]?\s+(.*)$/.exec(line);
		if (head) {
			let name = head[2].trim();
			let due = null;
			const paren = /\s*\(([^()]*)\)\s*$/.exec(name);
			if (paren && DATE.test(paren[1]) && /due|deadline|by/i.test(paren[1])) {
				due = DATE.exec(paren[1])[1];
				name = name.slice(0, paren.index).trim();
			}
			cur = {
				id: head[1],
				name,
				doneWhen: "",
				due,
				items: []
			};
			out.milestones.push(cur);
			continue;
		}
		if (!cur) continue;
		const done = /^Done when:\s*(.*)$/i.exec(line.trim());
		if (done) {
			cur.doneWhen = done[1].trim();
			continue;
		}
		const item = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
		if (item) {
			let text = item[2].trim();
			let partId = null;
			const tag = /\s*[({]part:\s*([a-z0-9-]+)[)}]\s*$/i.exec(text);
			if (tag) {
				partId = tag[1];
				text = text.slice(0, tag.index).trim();
			}
			const it = {
				text,
				done: item[1] !== " ",
				partId
			};
			cur.items.push(it);
		}
	}
	return out;
}
/** Writes milestones.md from scratch (only when there's none yet). */
function writeMilestones(milestones, opts) {
	const lines = ["# Milestones", ""];
	if (opts.proposed) lines.push(`${PROPOSED_LINE} ${opts.note ?? "Drafted by /rundown. Tick items, reorder, rename or delete as you like; /rundown only ticks items that are clearly done and adds notes."}`, "");
	for (const m of milestones) {
		lines.push(`## ${m.id}. ${m.name}${m.due ? ` (due ${m.due})` : ""}`, "");
		if (m.doneWhen) lines.push(`Done when: ${m.doneWhen}`, "");
		for (const it of m.items) lines.push(`- [${it.done ? "x" : " "}] ${it.text}${it.partId ? ` (part: ${it.partId})` : ""}`);
		lines.push("");
	}
	return lines.join("\n").replace(/\n+$/, "\n");
}
/** Reads decisions.md: "### D1. Title (raised 2026-10-07)" blocks with Question, Options, DEFAULT and Answer lines. */
function parseDecisions(md) {
	const out = [];
	let cur = null;
	for (const raw of md.split(/\r?\n/)) {
		const line = raw.trim();
		const head = /^###\s+(D\d+)[.:)]?\s+(.*)$/.exec(line);
		if (head) {
			let title = head[2].trim();
			let raised = "";
			const paren = /\s*\(([^()]*)\)\s*$/.exec(title);
			if (paren && DATE.test(paren[1])) {
				raised = DATE.exec(paren[1])[1];
				title = title.slice(0, paren.index).trim();
			}
			cur = {
				id: head[1],
				question: title,
				options: [],
				default: "",
				raised,
				answer: null,
				partId: null
			};
			out.push(cur);
			continue;
		}
		if (!cur) continue;
		if (/^##\s/.test(line)) {
			cur = null;
			continue;
		}
		const field = /^(Question|Options|DEFAULT|Default|Answer|Part):\s*(.*)$/.exec(line);
		if (!field) continue;
		const v = field[2].trim();
		switch (field[1]) {
			case "Question":
				if (v) cur.question = v;
				break;
			case "Options":
				cur.options = v ? v.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean) : [];
				break;
			case "DEFAULT":
			case "Default":
				cur.default = v;
				break;
			case "Answer":
				cur.answer = v || null;
				break;
			case "Part": cur.partId = v || null;
		}
	}
	return out;
}
function decisionBlock(d) {
	const title = d.question.length > 70 ? `${d.question.slice(0, 67).trimEnd()}...` : d.question;
	return [
		`### ${d.id}. ${title}${d.raised ? ` (raised ${d.raised})` : ""}`,
		`Question: ${d.question}`,
		`Options: ${d.options.join(" / ")}`,
		`DEFAULT: ${d.default}`,
		...d.partId ? [`Part: ${d.partId}`] : [],
		`Answer:${d.answer ? ` ${d.answer}` : ""}`,
		""
	];
}
var DECISIONS_INTRO = "Decisions only you can make. Write your answer under \"Answer:\" and run /rundown quick; answered ones move to Resolved on the next full run. If you leave one blank, the DEFAULT is what the map assumes.";
/** Writes decisions.md from scratch (only when there's none yet). */
function writeDecisions(decisions) {
	const open = decisions.filter((d) => !d.answer);
	const done = decisions.filter((d) => d.answer);
	const lines = [
		"# Your call",
		"",
		DECISIONS_INTRO,
		"",
		"## Open",
		""
	];
	for (const d of open) lines.push(...decisionBlock(d));
	if (!open.length) lines.push("Nothing waiting on you.", "");
	lines.push("## Resolved", "");
	for (const d of done) lines.push(...decisionBlock(d));
	if (!done.length) lines.push("None yet.", "");
	return lines.join("\n").replace(/\n+$/, "\n");
}
/** Adds decisions not in `md` yet to its Open section, leaving every line already there as it is. */
function appendDecisions(md, add) {
	const have = new Set(parseDecisions(md).map((d) => d.id));
	const fresh = add.filter((d) => !have.has(d.id));
	if (!fresh.length) return md;
	const block = fresh.flatMap((d) => decisionBlock({
		...d,
		answer: null
	})).join("\n");
	const at = md.search(/^## Resolved\s*$/m);
	if (at < 0) return `${md.replace(/\n*$/, "\n\n")}${block}`;
	return `${md.slice(0, at)}${block}\n${md.slice(at)}`.replace(/Nothing waiting on you\.\n\n(?=### )/, "");
}
/** A folder holding more than this share of the lines is split into its own subfolders. */
var DESCEND_SHARE = .6;
/** The parts the folders suggest: the biggest folders by lines, and "Everything else" for the rest. */
function inferParts(facts) {
	const dirs = facts.files.dirs;
	const total = dirs.reduce((a, d) => a + d.lines, 0);
	const folderLines = /* @__PURE__ */ new Map();
	for (const d of dirs) if (d.path) folderLines.set(topFolder(`${d.path}/x`), (folderLines.get(topFolder(`${d.path}/x`)) ?? 0) + d.lines);
	let folders = [...folderLines.entries()].map(([path, lines]) => ({
		path,
		lines
	}));
	folders.sort((a, b) => b.lines - a.lines);
	const big = folders[0];
	if (big && total > 0 && big.lines / total > DESCEND_SHARE) {
		const subs = /* @__PURE__ */ new Map();
		for (const d of dirs) {
			const segs = d.path.split("/");
			if (segs[0] !== big.path || segs.length < 2) continue;
			const key = `${segs[0]}/${segs[1]}`;
			subs.set(key, (subs.get(key) ?? 0) + d.lines);
		}
		if (subs.size > 1) folders = [...folders.slice(1), ...[...subs.entries()].map(([path, lines]) => ({
			path,
			lines
		}))].sort((a, b) => b.lines - a.lines);
	}
	const top = folders.filter((f) => f.lines > 0 || folders.length <= 8).slice(0, 8);
	const parts = top.map((f) => ({
		id: idOf(f.path),
		name: f.path,
		summary: summaryOf(facts, f.path),
		paths: [`${f.path}/**`]
	}));
	const covered = top.reduce((a, f) => a + f.lines, 0);
	if (dirs.some((d) => d.path === "" && d.files > 0) || covered < total) parts.push({
		id: "rest",
		name: "Everything else",
		summary: "Files at the top and the smaller folders",
		paths: ["*"]
	});
	return parts;
}
var idOf = (path) => path.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "root";
function summaryOf(facts, path) {
	const top = facts.files.byTopFolder.find((f) => f.folder === topFolder(`${path}/x`));
	const lang = top ? Object.entries(top.languages).sort((a, b) => b[1] - a[1])[0]?.[0] : void 0;
	const files = facts.files.dirs.filter((d) => d.path === path || d.path.startsWith(`${path}/`)).reduce((a, d) => a + d.files, 0);
	return `${files} file${files === 1 ? "" : "s"}${lang ? `, mostly ${lang}` : ""}`;
}
/** Each part's numbers, from the folder totals: every folder counts toward the most specific part covering it. */
function partMetrics(parts, facts) {
	const out = new Map(parts.map((p) => [p.id, emptyMetrics()]));
	for (const d of facts.files.dirs) {
		const id = partOfPath(parts, d.path);
		const m = id ? out.get(id) : void 0;
		if (!m) continue;
		m.lines += d.lines;
		m.files += d.files;
		m.testFiles += d.tests;
		m.todo += d.todo;
		m.fixme += d.fixme;
		m.commits30d += d.commits30d;
		if (d.lastCommit && (!m.lastCommit || d.lastCommit > m.lastCommit)) m.lastCommit = d.lastCommit;
	}
	for (const p of facts.git?.uncommitted.paths ?? []) {
		const id = partOfPath(parts, p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
		const m = id ? out.get(id) : void 0;
		if (m) m.uncommitted++;
	}
	return out;
}
/** The ids of the parts a commit's files belong to. */
function commitParts(parts, paths) {
	const ids = /* @__PURE__ */ new Set();
	for (const p of paths) {
		const id = partOfPath(parts, p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
		if (id) ids.add(id);
	}
	return [...ids];
}
/** In progress (changes or recent commits), not started (almost nothing there), else done. Never stuck. */
function inferStatus(m, now) {
	const recent = m.lastCommit ? now.getTime() - Date.parse(m.lastCommit) < 12096e5 : false;
	if (m.uncommitted > 0 || recent) {
		const evidence = [];
		if (m.uncommitted) evidence.push({
			kind: "note",
			ref: "uncommitted",
			text: `${m.uncommitted} uncommitted file${m.uncommitted === 1 ? "" : "s"}`
		});
		if (recent) evidence.push({
			kind: "commit",
			ref: m.lastCommit,
			text: `${m.commits30d} commit${m.commits30d === 1 ? "" : "s"} in 30 days, the last ${m.lastCommit.slice(0, 10)}`
		});
		return {
			status: "in-progress",
			evidence
		};
	}
	if (m.lines < 50) return {
		status: "not-started",
		evidence: [{
			kind: "note",
			ref: "lines",
			text: `${m.lines} ${m.lines === 1 ? "line" : "lines"} so far`
		}]
	};
	return {
		status: "done",
		evidence: [{
			kind: "note",
			ref: "quiet",
			text: `No changes in 14 days${m.lastCommit ? `; last commit ${m.lastCommit.slice(0, 10)}` : ""}`
		}]
	};
}
//#endregion
//#region src/shared/rundown/model.ts
/** Milestones in order with their state: done when every item is, the first one that isn't is active. */
function withStates(list, source) {
	let activeSeen = false;
	return list.map((m) => {
		const done = m.items.length > 0 && m.items.every((i) => i.done);
		let state = "ahead";
		if (done) state = "done";
		else if (!activeSeen) {
			state = "active";
			activeSeen = true;
		}
		return {
			...m,
			state,
			source
		};
	});
}
function milestonesOf(input) {
	if (input.milestonesMd !== null) {
		const parsed = parseMilestones(input.milestonesMd);
		return withStates(parsed.milestones, parsed.proposed ? "proposed" : "milestones.md");
	}
	return withStates((input.judgement?.milestones ?? []).map((m) => ({
		id: m.id,
		name: m.name,
		doneWhen: m.doneWhen,
		due: m.due ?? null,
		items: m.items.map((i) => ({
			text: i.text,
			done: i.done,
			partId: i.partId ?? null
		}))
	})), "proposed");
}
/** The person's decisions.md first (with their answers), then any Claude raised that aren't in it yet; open before resolved. */
function decisionsOf(input) {
	const fromMd = input.decisionsMd !== null ? parseDecisions(input.decisionsMd) : [];
	const have = new Set(fromMd.map((d) => d.id));
	const today = isoLocal(input.now).slice(0, 10);
	const raised = (input.judgement?.decisions ?? []).filter((d) => !have.has(d.id)).map((d) => ({
		id: d.id,
		question: d.question,
		options: d.options,
		default: d.default,
		raised: d.raised || today,
		answer: null,
		partId: d.partId ?? null
	}));
	const all = [...fromMd, ...raised];
	return [...all.filter((d) => !d.answer), ...all.filter((d) => d.answer)];
}
function partsOf(input) {
	const judged = input.judgement?.parts;
	const shapes = judged?.length ? judged : inferParts(input.facts);
	const metrics = partMetrics(shapes, input.facts);
	return shapes.map((s) => {
		const m = metrics.get(s.id);
		if (judged?.length) {
			const j = s;
			return {
				id: j.id,
				name: j.name,
				summary: j.summary,
				paths: j.paths,
				status: j.status,
				statusSource: "claude",
				waitingOn: j.status === "stuck" ? j.waitingOn ?? null : null,
				evidence: j.evidence ?? [],
				metrics: m
			};
		}
		const inferred = inferStatus(m, input.now);
		return {
			id: s.id,
			name: s.name,
			summary: s.summary,
			paths: s.paths,
			status: inferred.status,
			statusSource: "inferred",
			waitingOn: null,
			evidence: inferred.evidence,
			metrics: m
		};
	});
}
/** The whole rundown. */
function buildRundown(input) {
	const parts = partsOf(input);
	const facts = input.facts.git ? {
		...input.facts,
		git: {
			...input.facts.git,
			recentCommits: input.facts.git.recentCommits.map((c) => ({
				...c,
				parts: commitParts(parts, c.paths)
			}))
		}
	} : input.facts;
	const milestones = milestonesOf(input);
	const decisions = decisionsOf(input);
	const nextMilestone = milestones.find((m) => m.state !== "done")?.id ?? null;
	const step = input.judgement?.nextStep;
	const project = {
		...input.project,
		description: input.judgement?.description ?? input.project.description
	};
	const r = {
		schemaVersion: 1,
		generatedAt: isoLocal(input.now),
		generator: input.generator,
		project,
		facts,
		parts,
		milestones,
		nextMilestone,
		nextStep: step ? {
			text: step.text,
			why: step.why,
			partId: step.partId ?? null,
			milestoneId: step.milestoneId ?? nextMilestone,
			source: "claude"
		} : null,
		decisions,
		changes: [],
		previous: input.prev ? {
			generatedAt: input.prev.generatedAt,
			head: input.prev.head
		} : null
	};
	r.changes = diffStates(input.prev, toState(r), input.since);
	return r;
}
/** A time as ISO 8601 with the local offset ("2026-10-07T12:00:00+03:00"). */
function isoLocal(d) {
	const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
	const off = -d.getTimezoneOffset();
	const sign = off >= 0 ? "+" : "-";
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}
//#endregion
//#region src/shared/rundown/reply.ts
var lbl = (s) => `${s.padEnd(6, " ")} `;
var cut = (s, n) => cutWords(s ?? "", n);
/** The Road line: the milestones as a track (done ●, active ◆◐, ahead ○) and the active one's progress. */
function roadLine(r, now = /* @__PURE__ */ new Date()) {
	const ms = r.milestones;
	if (!ms.length) return `${lbl("Road")}no milestones yet, run /rundown`;
	const ai = ms.findIndex((m) => m.state === "active");
	if (ai === -1) return `${lbl("Road")}all milestones done`;
	const tokens = [];
	if (ai >= 2) tokens.push({
		t: `${ms[0].id}-${ms[ai - 1].id} ●`,
		reached: true
	});
	else if (ai === 1) tokens.push({
		t: `${ms[0].id} ●`,
		reached: true
	});
	tokens.push({
		t: `${ms[ai].id} ◆${GLYPH["in-progress"]}`,
		reached: true
	});
	const room = 5 - tokens.length;
	const ahead = ms.slice(ai + 1);
	for (const m of ahead.slice(0, ahead.length > room ? room - 1 : room)) tokens.push({
		t: `${m.id} ${m.state === "done" ? GLYPH.done : GLYPH["not-started"]}`,
		reached: false
	});
	if (ahead.length > room) tokens.push({
		t: `+${ahead.length - (room - 1)}`,
		reached: false
	});
	const road = tokens.map((x, i) => (i ? x.reached ? " ━ " : " ┄ " : "") + x.t).join("");
	const m = ms[ai];
	const done = m.items.filter((i) => i.done).length;
	const cells = m.items.length ? Math.floor(done / m.items.length * 5) : 0;
	return `${lbl("Road")}${road}    ${m.id} ${cut(m.name, 36)} ${"▰".repeat(cells)}${"▱".repeat(5 - cells)} ${done}/${m.items.length}${m.due ? ` · due ${fmtDay(m.due, now)}` : ""}`;
}
/** The reply block. `mapPath` is the page as shown (tildified); `index` the global index, when it was updated. */
function replyBlock(r, mapPath, index = null, now = /* @__PURE__ */ new Date()) {
	const out = [`Rundown · ${oneLine(r.project.name)} · ${oneLine(mapPath)}`, roadLine(r, now)];
	const isJudged = judged(r);
	if (r.nextStep) {
		const ub = unblocks(r);
		out.push(`Next → ${cut(r.nextStep.text, 100)}${ub > 0 ? ` (unblocks ${ub})` : ""}`);
	} else if (isJudged && r.milestones.length && r.milestones.every((m) => m.state === "done")) out.push(`${lbl("Next")}none, all milestones done`);
	else {
		const guess = inferredNext(r);
		out.push(guess ? `Next → ${cut(guess, 100)} (inferred from the code)` : `${lbl("Next")}none yet, run a full /rundown`);
	}
	const q = needsQueue(r);
	const needs = [...q.decisions.map((d) => `${GLYPH.stuck} ${d.id} ${cut(d.question, 52)}  default: ${cut(bestDefault(d) || d.default || "none", 40)}`), ...q.stuck.map((p) => `${GLYPH.stuck} ${cut(p.name, 30)} · waiting on ${cut(p.waitingOn, 56)}`)];
	if (!needs.length) out.push(`${lbl("Needs")}nothing waiting on you`);
	else {
		(needs.length > 2 ? needs.slice(0, 1) : needs).forEach((t, i) => out.push((i ? " ".repeat(7) : lbl("Needs")) + t));
		if (needs.length > 2) out.push(`${" ".repeat(7)}+${needs.length - 1} more on the page`);
	}
	const inferred = r.parts.length > 0 && r.parts.every((p) => p.statusSource === "inferred");
	const counts = STATUS_ORDER.map((s) => [s, r.parts.filter((p) => p.status === s).length]).filter(([, n]) => n);
	if (inferred && !isJudged) out.push(`${lbl("Parts")}${r.parts.length} by folder, not assessed yet`);
	else out.push(`${lbl("Parts")}${counts.map(([s, n]) => `${GLYPH[s]}${n}`).join(" ") || "none"}${inferred ? " (guessed)" : ""}`);
	if (!r.previous) out.push(`${lbl("Since")}first rundown`);
	else if (!r.changes.length) out.push(`${lbl("Since")}no changes`);
	else out.push(`${lbl("Since")}${fmtDay(r.previous.generatedAt, now)}: ${r.changes.slice(0, 4).map((c) => oneLine(changeChip(c, r.parts).label)).join(" · ")}`);
	if (index) out.push(`${lbl("Index")}${index.html} · ${plural(index.count, "project")}`);
	if (q.decisions.length) out.push("Answer: click an option on the page (copies a prompt) or edit .rundown/decisions.md, then /rundown quick");
	for (const g of r.facts.gaps) out.push(`! ${g}`);
	return out.join("\n");
}
//#endregion
//#region src/shared/rundown/version.ts
var RUNDOWN_VERSION = "1.4.0";
/** -1, 0 or 1 for two "x.y.z" versions; anything that isn't one sorts first. */
function compareVersions(a, b) {
	const parse = (v) => /^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null;
	const x = parse(a);
	const y = parse(b);
	if (!x || !y) return x ? 1 : y ? -1 : 0;
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
	return 0;
}
//#endregion
//#region src/shared/rundown/validate.ts
var EVIDENCE_KINDS = /* @__PURE__ */ new Set([
	"commit",
	"file",
	"test",
	"doc",
	"issue",
	"pr",
	"todo",
	"note"
]);
var ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
var DAY = /^\d{4}-\d{2}-\d{2}$/;
var Bad = class extends Error {};
var obj = (v, where) => {
	if (!v || typeof v !== "object" || Array.isArray(v)) throw new Bad(`${where} is not an object`);
	return v;
};
var text = (v, where, max) => {
	if (typeof v !== "string") throw new Bad(`${where} is not text`);
	return v.length > max ? `${v.slice(0, max - 3)}...` : v;
};
var optText = (v, where, max) => v === void 0 || v === null || v === "" ? null : text(v, where, max);
var list = (v, where, max) => {
	if (!Array.isArray(v)) throw new Bad(`${where} is not a list`);
	return v.slice(0, max);
};
var id = (v, where) => {
	const s = text(v, where, 64);
	if (!ID.test(s)) throw new Bad(`${where} "${s}" is not an id (letters, digits, dot, dash, underscore)`);
	return s;
};
var status = (v, where) => {
	if (!STATUSES.includes(v)) throw new Bad(`${where} is not one of ${STATUSES.join(", ")}`);
	return v;
};
var day = (v, where) => {
	const s = optText(v, where, 10);
	if (s !== null && !DAY.test(s)) throw new Bad(`${where} is not YYYY-MM-DD`);
	return s;
};
function evidence(v, where) {
	return list(v ?? [], where, 6).map((e, i) => {
		const o = obj(e, `${where}[${i}]`);
		return {
			kind: EVIDENCE_KINDS.has(o.kind) ? o.kind : "note",
			ref: text(o.ref ?? "", `${where}[${i}].ref`, 200),
			text: text(o.text, `${where}[${i}].text`, 300)
		};
	});
}
function judgementParts(v) {
	const seen = /* @__PURE__ */ new Set();
	return list(v, "parts", 12).map((p, i) => {
		const o = obj(p, `parts[${i}]`);
		const pid = id(o.id, `parts[${i}].id`);
		if (seen.has(pid)) throw new Bad(`parts[${i}].id "${pid}" is used twice`);
		seen.add(pid);
		const st = status(o.status, `parts[${i}].status`);
		const waitingOn = optText(o.waitingOn, `parts[${i}].waitingOn`, 200);
		if (st === "stuck" && !waitingOn) throw new Bad(`parts[${i}] is stuck but says nothing it is waiting on`);
		return {
			id: pid,
			name: text(o.name, `parts[${i}].name`, 80),
			summary: text(o.summary ?? "", `parts[${i}].summary`, 300),
			paths: list(o.paths ?? [], `parts[${i}].paths`, 30).map((g, k) => text(g, `parts[${i}].paths[${k}]`, 200)).filter((g) => !g.includes("..") && !g.startsWith("/")),
			status: st,
			waitingOn,
			evidence: evidence(o.evidence, `parts[${i}].evidence`)
		};
	});
}
function judgementMilestones(v) {
	return list(v, "milestones", 20).map((m, i) => {
		const o = obj(m, `milestones[${i}]`);
		return {
			id: id(o.id, `milestones[${i}].id`),
			name: text(o.name, `milestones[${i}].name`, 120),
			doneWhen: text(o.doneWhen ?? "", `milestones[${i}].doneWhen`, 300),
			due: day(o.due, `milestones[${i}].due`),
			items: list(o.items ?? [], `milestones[${i}].items`, 30).map((it, k) => {
				const io = obj(it, `milestones[${i}].items[${k}]`);
				return {
					text: text(io.text, `milestones[${i}].items[${k}].text`, 300),
					done: io.done === true,
					partId: optText(io.partId, `milestones[${i}].items[${k}].partId`, 64)
				};
			})
		};
	});
}
function judgementDecisions(v) {
	return list(v, "decisions", 20).map((d, i) => {
		const o = obj(d, `decisions[${i}]`);
		return {
			id: id(o.id, `decisions[${i}].id`),
			question: text(o.question, `decisions[${i}].question`, 400),
			options: list(o.options ?? [], `decisions[${i}].options`, 8).map((x, k) => text(x, `decisions[${i}].options[${k}]`, 200)),
			default: text(o.default, `decisions[${i}].default`, 400),
			raised: day(o.raised, `decisions[${i}].raised`) ?? "",
			partId: optText(o.partId, `decisions[${i}].partId`, 64)
		};
	});
}
function nextStep(v) {
	if (v === null || v === void 0) return null;
	const o = obj(v, "nextStep");
	return {
		text: text(o.text, "nextStep.text", 300),
		why: text(o.why ?? "", "nextStep.why", 300),
		partId: optText(o.partId, "nextStep.partId", 64),
		milestoneId: optText(o.milestoneId, "nextStep.milestoneId", 64)
	};
}
/** Claude's judgement.json, checked. */
function validateJudgement(raw) {
	try {
		const o = obj(raw, "judgement");
		const out = {};
		if (o.description !== void 0) out.description = optText(o.description, "description", 300);
		if (o.parts !== void 0) out.parts = judgementParts(o.parts);
		if (o.milestones !== void 0) out.milestones = judgementMilestones(o.milestones);
		if (o.nextStep !== void 0) out.nextStep = nextStep(o.nextStep);
		if (o.decisions !== void 0) out.decisions = judgementDecisions(o.decisions);
		return {
			ok: true,
			value: out
		};
	} catch (e) {
		if (e instanceof Bad) return {
			ok: false,
			error: e.message
		};
		throw e;
	}
}
//#endregion
//#region src/server/rundown/files.ts
/** Tracked files (with their blobs) and new ones git doesn't ignore, minus what's never counted. */
async function listFiles(git) {
	const tracked = await git([
		"ls-files",
		"-z",
		"-s"
	]);
	if (tracked === null) return null;
	const out = [];
	for (const e of tracked.split("\0")) {
		const tab = e.indexOf("	");
		if (tab < 0) continue;
		const [mode, sha] = e.slice(0, tab).split(" ");
		const p = e.slice(tab + 1);
		if (mode === "120000" || mode === "160000" || excludedPath(p)) continue;
		out.push({
			path: p,
			sha
		});
	}
	const others = await git([
		"ls-files",
		"-z",
		"--others",
		"--exclude-standard",
		"--directory",
		"--no-empty-directory"
	]);
	for (const p of (others ?? "").split("\0")) {
		if (!p || p.endsWith("/") || excludedPath(p) || toolCachePath(p)) continue;
		out.push({
			path: p,
			sha: null
		});
	}
	const seen = /* @__PURE__ */ new Set();
	const unique = out.filter((e) => !seen.has(e.path) && !!seen.add(e.path));
	return {
		entries: unique.slice(0, LIMITS.files),
		truncated: unique.length > LIMITS.files
	};
}
var TAG = /\b(TODO|FIXME|HACK)\b/;
var CASE = /(^|\s)(it|test|describe\.each|it\.each|test\.each)\s*\(|^\s*(async\s+)?def\s+test_|^\s*func\s+Test[A-Z_]|@Test\b|#\[test\]|^\s*fn\s+test_/gm;
/** Lines, TODO tags by line and test cases in a file's text. */
function statOf(text, isTest) {
	if (!text) return {
		lines: 0,
		todos: [],
		cases: 0
	};
	const all = text.split("\n");
	const lines = text.endsWith("\n") ? all.length - 1 : all.length;
	const todos = [];
	for (let i = 0; i < all.length && todos.length < 500; i++) {
		if (all[i].length > 2e3) continue;
		const m = TAG.exec(all[i]);
		if (m) todos.push({
			line: i + 1,
			tag: m[1]
		});
	}
	return {
		lines,
		todos,
		cases: isTest ? text.match(CASE)?.length ?? 0 : 0
	};
}
/**
* Stats every listed file: sensitive ones are only counted, binaries and generated ones only sized,
* the rest read (up to LIMITS.bytesPerFile each) unless the cache has them. Stops reading at the
* deadline or the run's byte budget and says it was cut short.
*/
async function readFiles(root, entries, opts) {
	const realRoot = await realpath(root);
	const dirOk = /* @__PURE__ */ new Map();
	const files = [];
	let sensitive = 0;
	let truncated = false;
	let i = 0;
	for (const e of entries) {
		if (++i % 500 === 0) await new Promise((r) => setImmediate(r));
		if (sensitivePath(e.path)) {
			sensitive++;
			files.push({
				path: e.path,
				sha: e.sha,
				bytes: 0,
				sensitive: true,
				skipLines: true,
				stat: null
			});
			continue;
		}
		const abs = path.join(root, e.path);
		let bytes = 0;
		try {
			const st = await lstat(abs);
			if (!st.isFile()) continue;
			bytes = st.size;
			const dir = path.dirname(abs);
			let ok = dirOk.get(dir);
			if (ok === void 0) {
				const real = await realpath(dir);
				ok = real === realRoot || real.startsWith(realRoot + path.sep);
				dirOk.set(dir, ok);
			}
			if (!ok) continue;
			const skipLines = binaryByName(e.path) || generatedPath(e.path);
			const item = {
				path: e.path,
				sha: e.sha,
				bytes,
				sensitive: false,
				skipLines,
				stat: null
			};
			files.push(item);
			if (skipLines) continue;
			const key = e.sha && !opts.changed.has(e.path) ? `b:${e.sha}` : `p:${e.path}:${st.size}:${st.mtimeMs}`;
			const cached = opts.cache.get(key);
			if (cached) {
				item.stat = cached;
				continue;
			}
			if (truncated || Date.now() > opts.budget.deadline || opts.budget.bytes <= 0) {
				truncated = true;
				continue;
			}
			const want = Math.min(st.size, LIMITS.bytesPerFile);
			const buf = Buffer.alloc(want);
			const fh = await open(abs, "r");
			try {
				await fh.read(buf, 0, want, 0);
			} finally {
				await fh.close();
			}
			opts.budget.bytes -= want;
			if (buf.subarray(0, 8192).includes(0)) {
				item.skipLines = true;
				continue;
			}
			item.stat = statOf(buf.toString("utf8"), opts.isTest(e.path));
			opts.cache.set(key, item.stat);
		} catch {}
	}
	return {
		files,
		truncated,
		sensitive
	};
}
/** Reads one small text file in the checkout (a manifest, a README), never through a symlink. */
async function readSmall(root, rel, max = 262144) {
	if (sensitivePath(rel) || rel.includes("..")) return null;
	const abs = path.join(root, rel);
	try {
		const st = await lstat(abs);
		if (!st.isFile()) return null;
		const real = await realpath(abs);
		const realRoot = await realpath(root);
		if (!real.startsWith(realRoot + path.sep)) return null;
		const want = Math.min(st.size, max);
		const buf = Buffer.alloc(want);
		const fh = await open(abs, "r");
		try {
			await fh.read(buf, 0, want, 0);
		} finally {
			await fh.close();
		}
		return buf.toString("utf8");
	} catch {
		return null;
	}
}
//#endregion
//#region src/server/rundown/git.ts
/** Settings that keep a repository's own config from running anything while it's read. */
var SAFE_CONFIG = [
	"-c",
	"core.fsmonitor=false",
	"-c",
	"core.untrackedCache=false",
	"-c",
	"log.showSignature=false",
	"-c",
	"core.pager=cat"
];
function gitEnv() {
	const env = {
		...process.env,
		GIT_OPTIONAL_LOCKS: "0",
		GIT_PAGER: "cat",
		PAGER: "cat",
		GIT_TERMINAL_PROMPT: "0",
		GIT_ASKPASS: "",
		SSH_ASKPASS: "",
		LC_ALL: "C"
	};
	for (const k of [
		"GIT_DIR",
		"GIT_WORK_TREE",
		"GIT_INDEX_FILE",
		"GIT_OBJECT_DIRECTORY",
		"GIT_ALTERNATE_OBJECT_DIRECTORIES",
		"GIT_CONFIG",
		"GIT_CONFIG_PARAMETERS",
		"GIT_EXTERNAL_DIFF"
	]) delete env[k];
	return env;
}
/** A git runner for `root`, at most `parallel` calls at a time; `gap` hears what failed. */
function gitRunner(root, gap, parallel = 6) {
	let running = 0;
	const queue = [];
	const env = gitEnv();
	const run = (args) => new Promise((resolve) => {
		execFile("git", [...SAFE_CONFIG, ...args], {
			cwd: root,
			env,
			timeout: LIMITS.gitTimeoutMs,
			maxBuffer: LIMITS.gitMaxBuffer,
			encoding: "utf8",
			windowsHide: true
		}, (err, stdout) => {
			if (err) {
				const e = err;
				if (e.code === "ENOENT") gap("git: not installed");
				else if (e.killed) gap(`git ${args[0]}: timed out`);
				resolve(null);
			} else resolve(stdout);
		});
	});
	return (args) => new Promise((resolve) => {
		const go = () => {
			running++;
			run(args).then((out) => {
				running--;
				queue.shift()?.();
				resolve(out);
			});
		};
		if (running < parallel) go();
		else queue.push(go);
	});
}
var lines = (s) => s ? s.split("\n").filter(Boolean) : [];
var NUL = "\0";
var RS = "";
/** The same separators as git writes them in a format (an argument can't hold a NUL). */
var F_NUL = "%x00";
var F_RS = "%x1e";
async function defaultBranch(git) {
	const head = (await git([
		"symbolic-ref",
		"--quiet",
		"--short",
		"refs/remotes/origin/HEAD"
	]))?.trim();
	if (head) return head.replace(/^origin\//, "");
	for (const b of ["main", "master"]) if ((await git([
		"rev-parse",
		"--verify",
		"--quiet",
		`refs/heads/${b}`
	]))?.trim()) return b;
	return null;
}
async function headInfo(git) {
	const out = await git([
		"log",
		"-1",
		"--no-ext-diff",
		"--no-textconv",
		`--format=%H${F_NUL}%cI${F_NUL}%s`
	]);
	if (!out?.trim()) return null;
	const [sha, date, subject] = out.trim().split(NUL);
	return {
		branch: (await git([
			"symbolic-ref",
			"--quiet",
			"--short",
			"HEAD"
		]))?.trim() || null,
		sha,
		subject: subject ?? "",
		date
	};
}
async function remote(git) {
	return remoteName((await git([
		"remote",
		"get-url",
		"origin"
	]))?.trim());
}
function track(s) {
	const a = /ahead (\d+)/.exec(s);
	const b = /behind (\d+)/.exec(s);
	if (!s || s === "[gone]") return {
		ahead: null,
		behind: null
	};
	return {
		ahead: a ? Number(a[1]) : 0,
		behind: b ? Number(b[1]) : 0
	};
}
async function branchFacts(git, def) {
	const out = await git([
		"for-each-ref",
		"--sort=-committerdate",
		`--count=${LIMITS.branches}`,
		"--format=%(refname:short)%00%(objectname)%00%(committerdate:iso-strict)%00%(upstream:short)%00%(upstream:track)",
		"refs/heads"
	]);
	const merged = new Set(def ? lines(await git([
		"for-each-ref",
		"--merged",
		`refs/heads/${def}`,
		"--format=%(refname:short)",
		"refs/heads"
	])) : []);
	return Promise.all(lines(out).map(async (l) => {
		const [name, sha, date, upstream, tr] = l.split(NUL);
		let ahead = 0;
		let behind = 0;
		let forkDate = null;
		if (def && name !== def) {
			const counts = (await git([
				"rev-list",
				"--left-right",
				"--count",
				`refs/heads/${def}...refs/heads/${name}`
			]))?.trim().split(/\s+/);
			if (counts?.length === 2) {
				behind = Number(counts[0]) || 0;
				ahead = Number(counts[1]) || 0;
			}
			const base = (await git([
				"merge-base",
				`refs/heads/${def}`,
				`refs/heads/${name}`
			]))?.trim();
			if (base) forkDate = (await git([
				"show",
				"-s",
				"--no-ext-diff",
				"--no-textconv",
				"--format=%cI",
				base
			]))?.trim() || null;
		}
		const t = track(tr ?? "");
		return {
			name,
			sha,
			date,
			ahead,
			behind,
			merged: name !== def && merged.has(name),
			upstream: upstream || null,
			upstreamAhead: t.ahead,
			upstreamBehind: t.behind,
			forkDate
		};
	}));
}
async function worktreeFacts(git, owner) {
	const out = await git([
		"worktree",
		"list",
		"--porcelain"
	]);
	const list = [];
	let cur = null;
	for (const l of (out ?? "").split("\n")) if (l.startsWith("worktree ")) {
		cur = {
			path: l.slice(9),
			branch: null,
			sha: "",
			locked: false,
			prunable: false,
			owner: null
		};
		list.push(cur);
	} else if (!cur) continue;
	else if (l.startsWith("HEAD ")) cur.sha = l.slice(5);
	else if (l.startsWith("branch ")) cur.branch = l.slice(7).replace(/^refs\/heads\//, "");
	else if (l.startsWith("locked")) cur.locked = true;
	else if (l.startsWith("prunable")) cur.prunable = true;
	return list.slice(0, LIMITS.worktrees).map((w) => ({
		...w,
		owner: owner(w.path)
	}));
}
/** The last commits with what each changed (from --numstat). */
async function recentCommits(git) {
	return (await git([
		"log",
		`-${LIMITS.recentCommits}`,
		"--no-ext-diff",
		"--no-textconv",
		"--no-renames",
		"--numstat",
		`--format=${F_RS}%H${F_NUL}%cI${F_NUL}%an${F_NUL}%s`,
		"HEAD"
	]) ?? "").split(RS).filter((b) => b.trim()).map((block) => {
		const [head, ...rest] = block.split("\n");
		const [sha, date, author, subject] = head.split(NUL);
		let insertions = 0;
		let deletions = 0;
		const paths = [];
		for (const l of rest) {
			const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(l);
			if (!m) continue;
			insertions += Number(m[1]) || 0;
			deletions += Number(m[2]) || 0;
			paths.push(m[3]);
		}
		return {
			sha,
			date,
			author: author ?? "",
			subject: subject ?? "",
			files: paths.length,
			insertions,
			deletions,
			parts: [],
			paths: paths.slice(0, LIMITS.commitPaths)
		};
	});
}
/** Commits per day over every local branch (each once), and who made them in the last 90 days. */
async function activity(git, now) {
	const out = await git([
		"log",
		"--branches",
		`--since=${LIMITS.heatmapDays + 1}.days`,
		"--no-ext-diff",
		"--no-textconv",
		`--format=%H${F_NUL}%cd${F_NUL}%an`,
		"--date=format-local:%Y-%m-%d"
	]);
	const seen = /* @__PURE__ */ new Set();
	const byDay = {};
	const who = /* @__PURE__ */ new Map();
	const cutoff = (/* @__PURE__ */ new Date(now.getTime() - 7776e6)).toISOString().slice(0, 10);
	for (const l of lines(out)) {
		const [sha, day, name] = l.split(NUL);
		if (!sha || seen.has(sha)) continue;
		seen.add(sha);
		byDay[day] = (byDay[day] ?? 0) + 1;
		if (day >= cutoff && name) {
			const w = who.get(name) ?? {
				commits: 0,
				last: day
			};
			w.commits++;
			if (day > w.last) w.last = day;
			who.set(name, w);
		}
	}
	return {
		byDay,
		contributors: [...who.entries()].map(([name, w]) => ({
			name,
			...w
		})).sort((a, b) => b.commits - a.commits).slice(0, 30)
	};
}
/** Each file's commits in the last 30 days and its last commit date, from HEAD's history. */
async function recentFileCommits(git) {
	const out = await git([
		"log",
		"--since=30.days",
		"--max-count=3000",
		"--no-ext-diff",
		"--no-textconv",
		"--no-renames",
		"--name-only",
		`--format=${F_RS}%cI`,
		"HEAD"
	]);
	const map = /* @__PURE__ */ new Map();
	for (const block of (out ?? "").split(RS)) {
		const [date, ...files] = block.split("\n");
		if (!date) continue;
		for (const f of files) {
			if (!f) continue;
			const e = map.get(f);
			if (!e) map.set(f, {
				n: 1,
				last: date
			});
			else {
				e.n++;
				if (date > e.last) e.last = date;
			}
		}
	}
	return map;
}
/** `git status`, counted: staged, modified, deleted and untracked, and the first paths. */
async function uncommitted(git) {
	const out = await git([
		"status",
		"--porcelain=v1",
		"-z",
		"--untracked-files=normal",
		"--no-renames"
	]);
	const res = {
		staged: 0,
		modified: 0,
		deleted: 0,
		untracked: 0,
		paths: [],
		all: /* @__PURE__ */ new Set()
	};
	for (const entry of (out ?? "").split(NUL)) {
		if (entry.length < 4) continue;
		const x = entry[0];
		const y = entry[1];
		const p = entry.slice(3);
		if (x === "?" && y === "?") res.untracked++;
		else {
			if (x !== " " && x !== "?") res.staged++;
			if (y === "M") res.modified++;
			if (x === "D" || y === "D") res.deleted++;
		}
		res.all.add(p);
		if (res.paths.length < LIMITS.uncommittedPaths) res.paths.push(p);
	}
	return res;
}
async function upstream(git) {
	const ref = (await git([
		"rev-parse",
		"--abbrev-ref",
		"--symbolic-full-name",
		"@{upstream}"
	]))?.trim();
	if (!ref) return null;
	const counts = (await git([
		"rev-list",
		"--left-right",
		"--count",
		"HEAD...@{upstream}"
	]))?.trim().split(/\s+/);
	if (counts?.length !== 2) return null;
	return {
		ahead: Number(counts[0]) || 0,
		behind: Number(counts[1]) || 0,
		ref,
		asOfLastFetch: true
	};
}
async function history(git) {
	return {
		total: Number((await git([
			"rev-list",
			"--count",
			"HEAD"
		]))?.trim()) || 0,
		first: lines(await git([
			"log",
			"--max-parents=0",
			"--no-ext-diff",
			"--no-textconv",
			"--format=%cI",
			"HEAD"
		])).pop() ?? null,
		stashes: lines(await git([
			"stash",
			"list",
			"--format=%H"
		])).length
	};
}
/** How many commits HEAD is past `prev`, or that `prev` isn't in HEAD's history any more. */
async function commitsSince(git, prev) {
	if (!prev || !/^[0-9a-f]{7,64}$/i.test(prev)) return null;
	if (!((await git([
		"cat-file",
		"-t",
		prev
	]))?.trim() === "commit")) return {
		count: 0,
		rewritten: true
	};
	if (await git([
		"merge-base",
		"--is-ancestor",
		prev,
		"HEAD"
	]) === null) return {
		count: 0,
		rewritten: true
	};
	return {
		count: Number((await git([
			"rev-list",
			"--count",
			`${prev}..HEAD`
		]))?.trim()) || 0,
		rewritten: false
	};
}
//#endregion
//#region src/server/rundown/project.ts
var MANIFESTS = [
	[/(^|\/)package\.json$/, "npm"],
	[/(^|\/)pyproject\.toml$/, "pyproject"],
	[/(^|\/)Cargo\.toml$/, "cargo"],
	[/(^|\/)go\.mod$/, "go"],
	[/(^|\/)pom\.xml$/, "maven"],
	[/(^|\/)build\.gradle(\.kts)?$/, "gradle"],
	[/\.(csproj|fsproj)$/, "dotnet"],
	[/(^|\/)composer\.json$/, "composer"],
	[/(^|\/)Gemfile$/, "gem"]
];
var tomlField = (text, key) => new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, "m").exec(text)?.[1] ?? null;
async function manifests(root, paths) {
	const list = [];
	const frameworks = /* @__PURE__ */ new Set();
	const found = paths.filter((p) => p.split("/").length <= 3 && MANIFESTS.some(([re]) => re.test(p))).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)).slice(0, 20);
	for (const p of found) {
		const kind = MANIFESTS.find(([re]) => re.test(p))[1];
		const text = await readSmall(root, p);
		if (text === null) continue;
		const m = {
			path: p,
			kind,
			name: null,
			version: null,
			scripts: {},
			deps: 0,
			devDeps: 0,
			workspaces: []
		};
		if (kind === "npm" || kind === "composer") try {
			const j = JSON.parse(text);
			m.name = typeof j.name === "string" ? j.name : null;
			m.version = typeof j.version === "string" ? j.version : null;
			const scripts = j.scripts && typeof j.scripts === "object" ? j.scripts : {};
			for (const [k, v] of Object.entries(scripts).slice(0, 40)) if (typeof v === "string") m.scripts[k] = v.slice(0, 300);
			const deps = { ...j.dependencies ?? j.require ?? {} };
			const dev = { ...j.devDependencies ?? j["require-dev"] ?? {} };
			m.deps = Object.keys(deps).length;
			m.devDeps = Object.keys(dev).length;
			m.workspaces = (Array.isArray(j.workspaces) ? j.workspaces : Array.isArray(j.workspaces?.packages) ? j.workspaces.packages : []).filter((w) => typeof w === "string").slice(0, 30);
			const all = {
				...deps,
				...dev
			};
			for (const [dep, name] of [
				["vitest", "Vitest"],
				["jest", "Jest"],
				["mocha", "Mocha"],
				["@playwright/test", "Playwright"],
				["cypress", "Cypress"],
				["ava", "AVA"],
				["tap", "tap"],
				["phpunit/phpunit", "PHPUnit"]
			]) if (dep in all) frameworks.add(name);
			if (Object.values(m.scripts).some((s) => /node\b[^&|;]*--test\b/.test(s))) frameworks.add("node:test");
			if ("playwright-core" in all && Object.values(m.scripts).some((s) => /e2e|playwright/.test(s))) frameworks.add("Playwright");
		} catch {}
		else if (kind === "pyproject" || kind === "cargo") {
			m.name = tomlField(text, "name");
			m.version = tomlField(text, "version");
			if (/pytest/.test(text)) frameworks.add("pytest");
			if (kind === "cargo") frameworks.add("cargo test");
		} else if (kind === "go") {
			m.name = /^module\s+(\S+)/m.exec(text)?.[1] ?? null;
			frameworks.add("go test");
		} else if (kind === "maven") {
			m.name = /<artifactId>([^<]+)<\/artifactId>/.exec(text)?.[1] ?? null;
			m.version = /<version>([^<]+)<\/version>/.exec(text)?.[1] ?? null;
			if (/junit/i.test(text)) frameworks.add("JUnit");
		}
		list.push(m);
	}
	return {
		list,
		frameworks: [...frameworks]
	};
}
/** A workflow's name and what starts it, read loosely from its YAML. */
function workflowInfo(text) {
	const name = /^name:\s*["']?([^"'\n#]+)["']?\s*$/m.exec(text)?.[1]?.trim() ?? null;
	const triggers = /* @__PURE__ */ new Set();
	const inline = /^(?:on|"on"|'on'):\s*(.+)$/m.exec(text);
	if (inline && inline[1].trim()) {
		for (const t of inline[1].replace(/[[\]{}]/g, " ").split(/[\s,]+/)) if (/^[a-z_]+$/.test(t)) triggers.add(t);
	} else {
		const block = /^(?:on|"on"|'on'):\s*\n((?:[ \t]+.*\n?)*)/m.exec(text);
		for (const l of (block?.[1] ?? "").split("\n")) {
			const k = /^ {2}([a-z_]+):?/.exec(l);
			if (k) triggers.add(k[1]);
		}
	}
	return {
		name,
		triggers: [...triggers].slice(0, 8)
	};
}
async function pipelines(root, paths) {
	const out = [];
	for (const p of paths) {
		if (out.length >= 20) break;
		if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) {
			const text = await readSmall(root, p, 131072);
			out.push({
				system: "github-actions",
				path: p,
				...workflowInfo(text ?? "")
			});
		} else if (p === ".gitlab-ci.yml") out.push({
			system: "gitlab",
			path: p,
			name: null,
			triggers: []
		});
		else if (p === "azure-pipelines.yml") out.push({
			system: "azure",
			path: p,
			name: null,
			triggers: []
		});
		else if (p === "Jenkinsfile") out.push({
			system: "jenkins",
			path: p,
			name: null,
			triggers: []
		});
		else if (p === ".circleci/config.yml") out.push({
			system: "circleci",
			path: p,
			name: null,
			triggers: []
		});
	}
	return out;
}
function docsOf(paths) {
	const top = new Set(paths.filter((p) => !p.includes("/")).map((p) => p.toLowerCase()));
	const has = (re) => [...top].some((p) => re.test(p));
	const docsDir = [
		"docs",
		"doc",
		"documentation"
	].find((d) => paths.some((p) => p.startsWith(`${d}/`))) ?? null;
	const agentFiles = paths.filter((p) => /^(CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|\.github\/copilot-instructions\.md|\.cursor\/rules\/.+)$/.test(p)).slice(0, 10);
	return {
		readme: has(/^readme(\.|$)/),
		docsDir,
		docsFiles: docsDir ? paths.filter((p) => p.startsWith(`${docsDir}/`)).length : 0,
		changelog: has(/^(changelog|changes|history)(\.|$)/),
		contributing: has(/^contributing(\.|$)/),
		license: has(/^(license|licence|copying)(\.|$)/),
		architecture: has(/^architecture(\.|$)/) || paths.some((p) => /(^|\/)(docs?\/)?architecture[^/]*\.md$/i.test(p)),
		agentFiles,
		adrs: paths.filter((p) => /(^|\/)(adrs?|decisions)\/[^/]+\.md$/i.test(p)).length
	};
}
/** The README's first paragraph of prose (not a heading, badge, list or HTML), 300 characters at most. */
async function readmeDescription(root, paths) {
	const readme = paths.find((p) => /^readme(\.md|\.markdown|\.txt|\.rst)?$/i.test(p));
	if (!readme) return null;
	const text = await readSmall(root, readme, 65536);
	if (!text) return null;
	for (const para of text.split(/\r?\n\s*\r?\n/)) {
		const t = para.trim();
		if (!t || /^(#|!\[|\[!\[|<|[-*+]\s|\d+\.\s|```|>|\||=+$|-+$)/.test(t)) continue;
		const plain = t.replace(/\s+/g, " ").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim();
		if (plain.length < 20) continue;
		return plain.length > 300 ? `${plain.slice(0, 297).trimEnd()}...` : plain;
	}
	return null;
}
//#endregion
//#region src/server/rundown/collect.ts
/** Empty file facts, for a folder git can't list. */
function emptyFileFacts() {
	return {
		total: 0,
		byTopFolder: [],
		languages: {},
		largest: [],
		manifests: [],
		tests: {
			files: 0,
			casesApprox: 0,
			byTopFolder: {},
			frameworks: []
		},
		todo: {
			todo: 0,
			fixme: 0,
			hack: 0,
			byTopFolder: {},
			locations: []
		},
		docs: {
			readme: false,
			docsDir: null,
			docsFiles: 0,
			changelog: false,
			contributing: false,
			license: false,
			architecture: false,
			agentFiles: [],
			adrs: 0
		},
		ci: [],
		skippedSensitive: 0,
		dirs: []
	};
}
/** The facts about the checkout at `root` (its top folder). */
async function collect(root, opts) {
	const started = Date.now();
	const now = opts.now ?? /* @__PURE__ */ new Date();
	const deadline = started + opts.budgetMs;
	const gaps = /* @__PURE__ */ new Set();
	const git = gitRunner(root, (g) => gaps.add(g));
	const isRepo = (await git(["rev-parse", "--is-inside-work-tree"]))?.trim() === "true";
	if (!isRepo) gaps.add("git: not a repository");
	const gitFacts = isRepo ? await gitPart(git, now, opts, gaps) : null;
	const files = isRepo ? await filePart(root, git, gitFacts?.changed ?? /* @__PURE__ */ new Set(), gitFacts?.recent ?? /* @__PURE__ */ new Map(), opts, deadline, gaps) : {
		facts: emptyFileFacts(),
		truncated: false,
		paths: []
	};
	const head = isRepo ? await headInfo(git) : null;
	if (isRepo && !head) {
		const branch = (await git([
			"symbolic-ref",
			"--quiet",
			"--short",
			"HEAD"
		]))?.trim();
		gaps.delete("git: no default branch (no origin/HEAD, main or master)");
		gaps.add(`git: no commits yet${branch ? ` on ${branch}` : ""}`);
	}
	const project = {
		name: files.facts.manifests.find((m) => m.kind === "npm" && !m.path.includes("/"))?.name || path.basename(root),
		root: opts.shownRoot ?? root,
		remote: isRepo ? await remote(git) : null,
		defaultBranch: gitFacts?.def ?? null,
		head,
		description: isRepo ? await readmeDescription(root, files.paths) : null
	};
	if (Date.now() > deadline) gaps.add(`time: the ${Math.round(opts.budgetMs / 1e3)} s budget ran out; the numbers are partial`);
	return {
		facts: {
			collectedAt: now.toISOString(),
			durationMs: Date.now() - started,
			truncated: files.truncated || Date.now() > deadline,
			gaps: [...gaps],
			git: gitFacts?.facts ?? null,
			files: files.facts,
			github: opts.github ?? null
		},
		project
	};
}
async function gitPart(git, now, opts, gaps) {
	const def = await defaultBranch(git);
	const [branches, worktrees, commits, act, unc, up, hist, recent] = await Promise.all([
		branchFacts(git, def),
		worktreeFacts(git, (p) => opts.owner?.(p) ?? null),
		recentCommits(git),
		activity(git, now),
		uncommitted(git),
		upstream(git),
		history(git),
		recentFileCommits(git)
	]);
	if (!def) gaps.add("git: no default branch (no origin/HEAD, main or master)");
	const { all, ...counts } = unc;
	return {
		def,
		changed: all,
		recent,
		facts: {
			branches,
			worktrees,
			recentCommits: commits,
			activityByDay: act.byDay,
			contributors: act.contributors,
			uncommitted: counts,
			upstream: up,
			stashes: hist.stashes,
			totalCommits: hist.total,
			firstCommit: hist.first
		}
	};
}
async function filePart(root, git, changed, recent, opts, deadline, gaps) {
	const listed = await listFiles(git);
	if (!listed) {
		gaps.add("git: could not list files");
		return {
			facts: emptyFileFacts(),
			truncated: true,
			paths: []
		};
	}
	if (listed.truncated) gaps.add(`files: more than ${LIMITS.files.toLocaleString("en-US")}, the rest not counted`);
	const read = await readFiles(root, listed.entries, {
		cache: opts.cache ?? /* @__PURE__ */ new Map(),
		changed,
		isTest: testPath,
		budget: {
			bytes: LIMITS.bytesPerRun,
			deadline
		}
	});
	if (read.truncated) gaps.add("files: the read budget ran out; some files are counted without their lines");
	const paths = read.files.map((f) => f.path);
	const facts = emptyFileFacts();
	facts.total = read.files.length;
	facts.skippedSensitive = read.sensitive;
	const top = /* @__PURE__ */ new Map();
	const buckets = /* @__PURE__ */ new Map();
	const largest = [];
	for (const f of read.files) {
		const folder = topFolder(f.path);
		const t = top.get(folder) ?? {
			folder,
			files: 0,
			lines: 0,
			languages: {}
		};
		top.set(folder, t);
		t.files++;
		const bucketKey = bucketOf(f.path, 4);
		const b = buckets.get(bucketKey) ?? {
			path: bucketKey,
			files: 0,
			lines: 0,
			tests: 0,
			todo: 0,
			fixme: 0,
			commits30d: 0,
			lastCommit: null
		};
		buckets.set(bucketKey, b);
		b.files++;
		const r = recent.get(f.path);
		if (r) {
			b.commits30d += r.n;
			if (!b.lastCommit || r.last > b.lastCommit) b.lastCommit = r.last;
		}
		if (!f.sensitive && testPath(f.path)) {
			facts.tests.files++;
			b.tests++;
			facts.tests.byTopFolder[folder] = (facts.tests.byTopFolder[folder] ?? 0) + 1;
		}
		if (!f.stat || f.skipLines) continue;
		const lang = languageOf(f.path);
		const lines = f.stat.lines;
		t.lines += lines;
		t.languages[lang] = (t.languages[lang] ?? 0) + lines;
		b.lines += lines;
		const l = facts.languages[lang] ??= {
			files: 0,
			lines: 0
		};
		l.files++;
		l.lines += lines;
		facts.tests.casesApprox += f.stat.cases;
		largest.push({
			path: f.path,
			lines,
			bytes: f.bytes
		});
		for (const todo of f.stat.todos) {
			if (todo.tag === "TODO") facts.todo.todo++;
			else if (todo.tag === "FIXME") facts.todo.fixme++;
			else facts.todo.hack++;
			if (todo.tag === "FIXME") b.fixme++;
			else b.todo++;
			facts.todo.byTopFolder[folder] = (facts.todo.byTopFolder[folder] ?? 0) + 1;
			if (facts.todo.locations.length < LIMITS.todoLocations) facts.todo.locations.push({
				path: f.path,
				line: todo.line,
				tag: todo.tag
			});
		}
	}
	facts.byTopFolder = [...top.values()].sort((a, b) => b.lines - a.lines || b.files - a.files);
	facts.largest = largest.sort((a, b) => b.lines - a.lines).slice(0, LIMITS.largest);
	facts.dirs = [...buckets.values()].sort((a, b) => b.lines - a.lines || b.files - a.files).slice(0, LIMITS.dirs);
	if (buckets.size > LIMITS.dirs) gaps.add(`files: ${buckets.size} folders, the smallest left out of the parts' totals`);
	const m = await manifests(root, paths);
	facts.manifests = m.list;
	facts.tests.frameworks = m.frameworks;
	facts.ci = await pipelines(root, paths);
	facts.docs = docsOf(paths);
	return {
		facts,
		truncated: read.truncated || listed.truncated,
		paths
	};
}
//#endregion
//#region src/server/rundown/index-file.ts
var SCHEMA = 1;
var LOCK_WAIT_MS = 5e3;
var LOCK_STALE_MS = 1e4;
/** Where the index lives. A relative RUNDOWN_HOME would give each repo its own index inside it, so it is refused. */
function indexHome(env = process.env) {
	const v = env.RUNDOWN_HOME;
	if (!v) return path.join(os.homedir(), ".claude", "rundown");
	const dir = v === "~" || v.startsWith("~/") ? path.join(os.homedir(), v.slice(1)) : v;
	if (!path.isAbsolute(dir)) throw new Error(`RUNDOWN_HOME must be an absolute path, got "${v}"`);
	return path.resolve(dir);
}
var indexPaths = (dir = indexHome()) => ({
	dir,
	json: path.join(dir, "index.json"),
	html: path.join(dir, "index.html")
});
var devOf = (p) => {
	try {
		return statSync(p).dev;
	} catch {
		return null;
	}
};
var tildify$2 = (p) => {
	const home = os.homedir();
	return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
};
function load(file) {
	try {
		const doc = JSON.parse(readFileSync(file, "utf8"));
		return Array.isArray(doc.projects) ? doc.projects.filter(validEntry).filter((e) => path.isAbsolute(e.htmlPath)) : [];
	} catch {
		return [];
	}
}
var MOUNT_DIR = /^\/(Volumes|mnt|media|run\/media\/[^/]+|media\/[^/]+)$/;
function nearestExisting(p) {
	let d = p;
	while (!existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
	return d;
}
/**
* Keep an entry while its page exists, or while its folder is only out of reach: the nearest folder
* still there sits on another device (an unmounted volume), or, with no device recorded, its parent is
* missing or a mount folder such as /Volumes.
*/
function keepEntry(e) {
	if (existsSync(e.htmlPath)) return true;
	const near = nearestExisting(e.root);
	if (e.dev != null) return devOf(near) !== e.dev;
	const parent = path.dirname(e.root);
	return near !== e.root && (near !== parent || MOUNT_DIR.test(parent));
}
var newestFirst = (a, b) => (Date.parse(b.generatedAt) || 0) - (Date.parse(a.generatedAt) || 0);
var alive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		return e.code === "EPERM";
	}
};
/** A file written whole or not at all; a failed write takes its temp file with it. */
function writeAtomic$1(file, text) {
	const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
	try {
		writeFileSync(tmp, text);
		renameSync(tmp, file);
	} catch (e) {
		rmSync(tmp, { force: true });
		throw e;
	}
}
/** Temp files of index.json and index.html that a killed run left behind; a live run's stay. */
function sweepTmp(dir) {
	for (const f of readdirSync(dir)) {
		const m = /^index\.(json|html)\.(\d+)\.[0-9a-f]+\.tmp$/.exec(f);
		if (m && !alive(Number(m[2]))) rmSync(path.join(dir, f), { force: true });
	}
}
function write(dir, projects, style) {
	const p = indexPaths(dir);
	sweepTmp(dir);
	const list = projects.filter(keepEntry).sort(newestFirst);
	writeAtomic$1(p.json, `${JSON.stringify({
		schemaVersion: SCHEMA,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		projects: list
	}, null, 1)}\n`);
	writeAtomic$1(p.html, renderIndexPage(list.map((e) => ({
		...e,
		href: pathToFileURL(e.htmlPath).href,
		pathLabel: tildify$2(e.root)
	})), style));
	return {
		html: p.html,
		json: p.json,
		count: list.length
	};
}
async function lockStale(file) {
	const [st, text] = await Promise.all([promises.stat(file).catch(() => null), promises.readFile(file, "utf8").catch(() => null)]);
	if (!st || text === null) return null;
	const pid = Number(text.split(" ")[0]);
	return {
		text,
		stale: Date.now() - st.mtimeMs > LOCK_STALE_MS || Number.isInteger(pid) && pid > 0 && !alive(pid)
	};
}
/** Removes `lock` if it is still stale, under a short guard so two runs can't remove each other's fresh lock. */
async function breakStale(lock) {
	const guard = `${lock}.break`;
	let fh;
	try {
		fh = await promises.open(guard, "wx");
	} catch (e) {
		if (e.code !== "EEXIST") throw e;
		if ((await lockStale(guard))?.stale) await promises.rm(guard, { force: true });
		return false;
	}
	try {
		await fh.writeFile(String(process.pid));
		await fh.close();
		if ((await lockStale(lock))?.stale) await promises.rm(lock, { force: true });
		return true;
	} finally {
		await promises.rm(guard, { force: true });
	}
}
async function withLock(dir, fn) {
	try {
		await promises.mkdir(dir, { recursive: true });
	} catch (e) {
		const code = e.code;
		if (code === "EEXIST" || code === "ENOTDIR") throw new Error(`cannot use ${tildify$2(dir)} for the index: ${code === "EEXIST" ? "it is a file, not a folder" : "a folder above it is a file"}`);
		throw e;
	}
	const lock = path.join(dir, "index.lock");
	const token = `${process.pid} ${randomBytes(8).toString("hex")}`;
	const until = Date.now() + LOCK_WAIT_MS;
	let fh = null;
	while (!fh) try {
		fh = await promises.open(lock, "wx");
	} catch (e) {
		if (e.code !== "EEXIST") throw e;
		if ((await lockStale(lock))?.stale && await breakStale(lock)) continue;
		if (Date.now() > until) throw new Error(`index is locked by another run (${tildify$2(lock)}); try again in a moment`);
		await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
	}
	try {
		await fh.writeFile(token);
		await fh.close();
		return fn();
	} finally {
		if ((await lockStale(lock))?.text === token) await promises.rm(lock, { force: true });
	}
}
/** The same folder reached through a symlink is one entry: keyed on the real path. */
async function real(e) {
	const root = await promises.realpath(e.root).catch(() => e.root);
	return root === e.root ? e : {
		...e,
		root,
		htmlPath: path.join(root, path.relative(e.root, e.htmlPath))
	};
}
/** Upserts one project, drops entries whose page is gone, and rewrites both files. */
async function updateIndex(entry, style = {}, dir = indexHome()) {
	const e = await real(entry);
	return withLock(dir, () => write(dir, [e, ...load(indexPaths(dir).json).filter((x) => x.root !== e.root)], style));
}
/** Prunes and rewrites without adding anything (the `index` command). */
async function rebuildIndex(style = {}, dir = indexHome()) {
	return withLock(dir, () => write(dir, load(indexPaths(dir).json), style));
}
/** The index page as a file: URL, for the "All rundowns" link. */
var indexHref = (dir = indexHome()) => pathToFileURL(indexPaths(dir).html).href;
//#endregion
//#region src/server/rundown/install.ts
var tildify$1 = (p) => {
	const home = os.homedir();
	return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
};
/** Every file under `dir`, relative, with '/'. */
function filesUnder(dir, rel = "") {
	if (!existsSync(dir)) return [];
	return readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
		const r = rel ? `${rel}/${e.name}` : e.name;
		return e.isDirectory() ? filesUnder(dir, r) : e.isFile() ? [r] : [];
	});
}
var read$1 = (file) => {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return null;
	}
};
/**
* The version a script carries: the stamp the build writes on its second line, else the constant the
* older builds had (`VERSION = 'x.y.z'`, in rundown.mjs or, for the standalone skill, lib/common.mjs).
*/
function scriptVersion(file) {
	const text = read$1(file);
	if (text === null) return null;
	return /^\/\/ rundown-version: (\d+\.\d+\.\d+)$/m.exec(text.slice(0, 4096))?.[1] ?? /\bVERSION = '(\d+\.\d+\.\d+)'/.exec(text)?.[1] ?? null;
}
/** The version installed in `dir`, or null when there is none or it can't be told. */
function installedVersion(dir) {
	return scriptVersion(path.join(dir, "scripts", "rundown.mjs")) ?? scriptVersion(path.join(dir, "scripts", "lib", "common.mjs"));
}
/** What installing would do to `dir`: nothing is written. */
function planInstall(dir, files) {
	const plan = {
		dir,
		files,
		added: [],
		changed: [],
		same: [],
		stale: []
	};
	for (const [rel, src] of files) {
		const dst = path.join(dir, rel);
		if (!existsSync(dst)) plan.added.push(rel);
		else if (readFileSync(dst).equals(readFileSync(src))) plan.same.push(rel);
		else plan.changed.push(rel);
	}
	plan.stale = filesUnder(dir).filter((rel) => !files.has(rel) && !rel.startsWith("examples/") && !rel.endsWith(".DS_Store"));
	return plan;
}
/**
* The skill's own files beside this script: SKILL.md and README.md one folder up, as the package and
* the plugin ship them (plugins/rundown/skills/rundown/scripts/rundown.mjs). Null when there is no SKILL.md there.
*/
function packagedSkill(self) {
	const dir = path.resolve(path.dirname(self), "..");
	const skill = path.join(dir, "SKILL.md");
	if (!existsSync(skill)) return null;
	const readme = path.join(dir, "README.md");
	return {
		skill,
		...existsSync(readme) ? { readme } : {}
	};
}
/** Puts `self` (the built script), SKILL.md and README.md into `dir`. Returns the exit code. */
function install(a, dir = path.join(os.homedir(), ".claude", "skills", "rundown"), backups = path.join(os.homedir(), ".claude", "backups"), self) {
	const files = /* @__PURE__ */ new Map([["scripts/rundown.mjs", self]]);
	const packaged = packagedSkill(self);
	for (const [rel, src] of [["SKILL.md", a.skill ?? packaged?.skill], ["README.md", a.readme ?? packaged?.readme]]) {
		if (!src) continue;
		if (!existsSync(src)) {
			console.error(`rundown: no such file: ${src}`);
			return 2;
		}
		files.set(rel, path.resolve(src));
	}
	const mine = scriptVersion(self) ?? "1.4.0";
	const theirs = installedVersion(dir);
	const older = theirs !== null && compareVersions(mine, theirs) < 0;
	const plan = planInstall(dir, files);
	const list = (label, xs) => xs.length && console.log(`  ${label}: ${xs.join(", ")}`);
	console.log(`${a.dryRun ? "Would install" : "Installing"} rundown ${mine} into ${tildify$1(dir)}${theirs ? ` (installed now: ${theirs})` : ""}:`);
	list("new", plan.added);
	list("changed", plan.changed);
	list("unchanged", plan.same);
	list("taken out (an older install, kept in the backup)", plan.stale);
	if (older) {
		const msg = `the installed copy is newer (${theirs}) than this one (${mine})`;
		if (!a.force) {
			console.error(`rundown: ${msg}: nothing changed. Add --force to replace it anyway (it is backed up first).`);
			return 3;
		}
		console.log(`Replacing a newer copy (--force): ${msg}.`);
	}
	if (a.dryRun) {
		if (plan.changed.includes("SKILL.md")) {
			const d = spawnSync("diff", [
				"-u",
				path.join(dir, "SKILL.md"),
				files.get("SKILL.md")
			], {
				encoding: "utf8",
				timeout: 1e4
			});
			if (d.stdout) console.log(d.stdout.split("\n").slice(0, 80).join("\n"));
		}
		return 0;
	}
	if (!plan.added.length && !plan.changed.length && !plan.stale.length) {
		console.log("Nothing to change.");
		return 0;
	}
	if (existsSync(dir) && (plan.changed.length || plan.stale.length)) {
		const stamp = path.join(backups, `rundown-${isoLocal(/* @__PURE__ */ new Date()).slice(0, 19).replace(/[-:]/g, "")}`);
		let backup = stamp;
		for (let i = 2; existsSync(backup); i++) backup = `${stamp}-${i}`;
		mkdirSync(backups, { recursive: true });
		cpSync(dir, backup, {
			recursive: true,
			errorOnExist: true,
			force: false
		});
		console.log(`Backed up the old copy to ${tildify$1(backup)}  (diff -ru ${tildify$1(backup)} ${tildify$1(dir)})`);
	}
	for (const [rel, src] of files) {
		mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		copyFileSync(src, path.join(dir, rel));
	}
	for (const rel of plan.stale) unlinkSync(path.join(dir, rel));
	console.log(`Installed rundown ${mine} in ${tildify$1(dir)}`);
	return 0;
}
//#endregion
//#region src/shared/rundown/session-brief.ts
var BRIEF_MAX_BYTES = 1536;
var bytes = (s) => new TextEncoder().encode(s).length;
/** The brief, or null when the rundown is too old (or undated) or was never judged (folder guesses only tell an agent nothing). */
function sessionBrief(r, now = /* @__PURE__ */ new Date(), maxBytes = BRIEF_MAX_BYTES) {
	const at = Date.parse(r.generatedAt);
	if (!Number.isFinite(at) || now.getTime() - at > 6048e5 || !judged(r)) return null;
	const head = `Project rundown for ${cutWords(r.project.name, 60)} (.rundown/, updated ${ago(r.generatedAt, now.getTime())}; /rundown quick refreshes it, .rundown/rundown.html is the full map):`;
	const fixed = [];
	const m = r.milestones.find((x) => x.state === "active");
	if (m) {
		const left = m.items.filter((i) => !i.done);
		fixed.push(`- Milestone: ${m.id} ${cutWords(m.name, 80)}, ${m.items.length - left.length}/${m.items.length} items done${m.due ? `, due ${m.due}` : ""}${left.length ? `. Open: ${left.slice(0, 3).map((i) => cutWords(i.text, 70)).join("; ")}${left.length > 3 ? `; +${left.length - 3} more` : ""}` : ""}`);
	} else if (r.milestones.length) fixed.push("- Milestones: all done");
	if (r.nextStep) fixed.push(`- Next step: ${cutWords(r.nextStep.text, 200)}${r.nextStep.why ? ` (why: ${cutWords(r.nextStep.why, 140)})` : ""}`);
	const q = needsQueue(r);
	const decisions = q.decisions.map((d) => `${d.id} ${cutWords(d.question, 110)} (default: ${cutWords(bestDefault(d) || d.default || "none", 70)})`);
	const stuck = [...q.stuck, ...q.nextPart ? [q.nextPart] : []].map((p) => `${cutWords(p.name, 50)}, waiting on ${cutWords(p.waitingOn || "not stated", 100)}`);
	const tail = "Open decisions run on their defaults until the user answers them in .rundown/decisions.md.";
	const build = (nd, ns) => {
		const L = [head, ...fixed];
		if (decisions.length) L.push(`- Open decisions: ${decisions.slice(0, nd).join("; ")}${decisions.length > nd ? `${nd ? "; " : ""}+${decisions.length - nd} more` : ""}`);
		if (stuck.length) L.push(`- Stuck: ${stuck.slice(0, ns).join("; ")}${stuck.length > ns ? `${ns ? "; " : ""}+${stuck.length - ns} more` : ""}`);
		if (decisions.length) L.push(tail);
		return L.join("\n");
	};
	let nd = decisions.length;
	let ns = stuck.length;
	let text = build(nd, ns);
	while (bytes(text) > maxBytes && (nd > 0 || ns > 0)) {
		if (nd >= ns && nd > 0) nd--;
		else ns--;
		text = build(nd, ns);
	}
	if (bytes(text) <= maxBytes) return text;
	let out = text;
	while (bytes(`${out}...`) > maxBytes) out = out.slice(0, -1);
	return `${out}...`;
}
/** The hook's stdout: Claude Code adds `additionalContext` to the session's context. */
function sessionStartOutput(brief) {
	return JSON.stringify({ hookSpecificOutput: {
		hookEventName: "SessionStart",
		additionalContext: brief
	} });
}
//#endregion
//#region src/server/rundown/session-start.ts
/** rundown.json is read up to this size; the page's model is far smaller. */
var MAX_FILE_BYTES = 8388608;
/**
* Whether the .rundown/ at git top `top` is this machine's own: the script keeps it out of git with a
* line in the common info/exclude when it first renders, and a .rundown/ that the repository tracks
* (one that came with a clone) is never briefed from, so a repository can't put words in the session.
* Reads files only; anything it can't read counts as not ours.
*/
function ownRundown(top) {
	try {
		const dotGit = path.join(top, ".git");
		let gitDir = dotGit;
		if (statSync(dotGit).isFile()) {
			const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, "utf8"));
			if (!m) return false;
			gitDir = path.resolve(top, m[1]);
		}
		const commonFile = path.join(gitDir, "commondir");
		const common = existsSync(commonFile) ? path.resolve(gitDir, readFileSync(commonFile, "utf8").trim()) : gitDir;
		const exclude = path.join(common, "info", "exclude");
		if (!existsSync(exclude) || !/^\/?\.rundown\/?\s*$/m.test(readFileSync(exclude, "utf8"))) return false;
		const index = path.join(gitDir, "index");
		return !existsSync(index) || !readFileSync(index).includes(".rundown/");
	} catch {
		return false;
	}
}
/**
* The .rundown/rundown.json to brief from for a session in `start`: inside a git repository only the one
* at its top (where the script writes it), and only when ownRundown says it is this machine's; outside
* git the nearest at or above `start`, never above the home folder.
*/
function findRundown(start, home = os.homedir()) {
	let dir = path.resolve(start);
	let nearest = null;
	for (;;) {
		const file = path.join(dir, ".rundown", "rundown.json");
		if (existsSync(path.join(dir, ".git"))) return existsSync(file) && ownRundown(dir) ? file : null;
		if (!nearest && existsSync(file)) nearest = file;
		const up = path.dirname(dir);
		if (dir === home || up === dir) return nearest;
		dir = up;
	}
}
/** Just enough shape to brief from; anything else is skipped. */
function looksLikeRundown(x) {
	const r = x;
	return !!r && typeof r.generatedAt === "string" && !!r.project && typeof r.project.name === "string" && Array.isArray(r.parts) && Array.isArray(r.milestones) && Array.isArray(r.decisions);
}
/** The hook's stdout for a session in `cwd`, or '' when there is nothing to say. */
function sessionStart(cwd, now = /* @__PURE__ */ new Date(), home = os.homedir()) {
	try {
		const file = findRundown(cwd, home);
		if (!file || statSync(file).size > MAX_FILE_BYTES) return "";
		const r = JSON.parse(readFileSync(file, "utf8"));
		if (!looksLikeRundown(r)) return "";
		const brief = sessionBrief(r, now);
		return brief ? sessionStartOutput(brief) : "";
	} catch {
		return "";
	}
}
/** The folder the hook input names (`cwd`), else the project dir Claude Code sets, else the process's own. */
function hookCwd(stdin, env = process.env) {
	try {
		const cwd = JSON.parse(stdin).cwd;
		if (typeof cwd === "string" && path.isAbsolute(cwd)) return cwd;
	} catch {}
	return env.CLAUDE_PROJECT_DIR && path.isAbsolute(env.CLAUDE_PROJECT_DIR) ? env.CLAUDE_PROJECT_DIR : process.cwd();
}
/** Reads stdin when it is piped (at most 1 s and 64 KB), else ''. */
function readStdin() {
	if (process.stdin.isTTY) return Promise.resolve("");
	return new Promise((resolve) => {
		let text = "";
		const done = () => {
			clearTimeout(timer);
			process.stdin.removeAllListeners();
			process.stdin.destroy();
			resolve(text);
		};
		const timer = setTimeout(done, 1e3);
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (c) => {
			text += c;
			if (text.length > 65536) done();
		});
		process.stdin.on("end", done);
		process.stdin.on("error", done);
	});
}
//#endregion
//#region src/server/rundown/cli.ts
var VERSION = RUNDOWN_VERSION;
function parseArgs(argv, cwd = process.cwd()) {
	const a = {
		cmd: argv[0] ?? "help",
		root: cwd,
		named: false,
		mode: "full",
		open: false,
		gh: true,
		dryRun: false,
		force: false
	};
	const named = (v) => {
		a.root = path.resolve(cwd, v ?? ".");
		a.named = true;
	};
	for (let i = 1; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--root") named(argv[++i]);
		else if (v === "--mode") a.mode = argv[++i] === "quick" ? "quick" : "full";
		else if (v === "--open") a.open = true;
		else if (v === "--no-gh") a.gh = false;
		else if (v === "--theme") {
			const t = argv[++i];
			if (t === "dark" || t === "light") a.theme = t;
		} else if (v === "--accent") a.accent = argv[++i];
		else if (v === "--skill") a.skill = argv[++i];
		else if (v === "--readme") a.readme = argv[++i];
		else if (v === "--dry-run") a.dryRun = true;
		else if (v === "--force") a.force = true;
		else if (!v.startsWith("-")) named(v);
	}
	return a;
}
/** Why `a.root` can't be mapped, or null when it can: not a folder, or a home or filesystem root nobody named. */
function rootProblem(a, home = os.homedir()) {
	let isDir = false;
	try {
		isDir = statSync(a.root).isDirectory();
	} catch {}
	if (!isDir) return `no such folder: ${a.root}`;
	if ((a.root === path.parse(a.root).root || path.resolve(a.root) === path.resolve(home)) && !a.named) return `${a.root} is your ${a.root === home ? "home folder" : "filesystem root"}, not a project: cd into one, or name it with --root if you really mean it`;
	return null;
}
/** The style shared with the project-map agent, ~/.claude/agent-memory/project-map/style.md, under --theme and --accent. */
function readStyle(a, file = path.join(os.homedir(), ".claude", "agent-memory", "project-map", "style.md")) {
	const text = read(file) ?? "";
	const theme = /^style:\s*(dark|light)\s*$/m.exec(text)?.[1];
	const accent = /^accent:\s*([#\w-]+)\s*$/m.exec(text)?.[1];
	return {
		theme: a.theme ?? theme ?? "dark",
		accent: (a.accent && accentHex(a.accent) ? a.accent : void 0) ?? accent ?? "orange"
	};
}
var tildify = (p) => {
	const home = os.homedir();
	return p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
};
/** The git top of `dir`, or `dir` itself outside a repository. */
async function topOf(dir) {
	const top = (await gitRunner(dir, () => {})(["rev-parse", "--show-toplevel"]))?.trim();
	return top ? {
		root: top,
		repo: true
	} : {
		root: dir,
		repo: false
	};
}
/** .rundown/ out of git for every worktree: one line in the common info/exclude, never .gitignore. */
async function excludeOutput(root) {
	const common = (await gitRunner(root, () => {})(["rev-parse", "--git-common-dir"]))?.trim();
	if (!common) return;
	const info = path.join(path.resolve(root, common), "info");
	const file = path.join(info, "exclude");
	const have = existsSync(file) ? readFileSync(file, "utf8") : "";
	if (/^\/?\.rundown\/?\s*$/m.test(have)) return;
	mkdirSync(info, { recursive: true });
	appendFileSync(file, `${have && !have.endsWith("\n") ? "\n" : ""}# The /rundown skill's project map\n/.rundown/\n`);
}
var read = (file) => {
	try {
		return readFileSync(file, "utf8");
	} catch {
		return null;
	}
};
var readJson = (file) => {
	const t = read(file);
	if (t === null) return null;
	try {
		return JSON.parse(t);
	} catch {
		return null;
	}
};
/** A file written whole or not at all: a failed run leaves the old one. */
function writeAtomic(file, text) {
	const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
	writeFileSync(tmp, text, { flag: "wx" });
	renameSync(tmp, file);
}
/** The first run after the project-map agent: its milestones and decisions come along, once. */
function migrate(root, out) {
	const old = path.join(root, ".project-map");
	if (!existsSync(old) || existsSync(path.join(out, "state.json"))) return;
	for (const f of ["milestones.md", "decisions.md"]) if (existsSync(path.join(old, f)) && !existsSync(path.join(out, f))) copyFileSync(path.join(old, f), path.join(out, f));
}
/** GitHub's open issues and pull requests, if gh is there and signed in (15 s at most). */
function github(root) {
	const gh = (args) => new Promise((resolve) => execFile("gh", args, {
		cwd: root,
		timeout: 15e3,
		maxBuffer: 4194304,
		env: {
			...process.env,
			GH_PROMPT_DISABLED: "1",
			NO_COLOR: "1"
		},
		windowsHide: true
	}, (err, stdout) => resolve(err ? null : stdout)));
	return Promise.all([gh([
		"issue",
		"list",
		"--state",
		"open",
		"--limit",
		"100",
		"--json",
		"number"
	]), gh([
		"pr",
		"list",
		"--state",
		"open",
		"--limit",
		"30",
		"--json",
		"number,title,headRefName,isDraft"
	])]).then(([issues, prs]) => {
		if (issues === null && prs === null) return null;
		try {
			const pr = prs ? JSON.parse(prs) : [];
			return {
				openIssues: issues ? JSON.parse(issues).length : 0,
				openPrs: pr.map((p) => ({
					number: p.number,
					title: String(p.title).slice(0, 200),
					branch: p.headRefName,
					draft: !!p.isDraft
				}))
			};
		} catch {
			return null;
		}
	});
}
async function runCollect(a, root, out) {
	const [c, gh] = await Promise.all([collect(root, {
		budgetMs: LIMITS.skillMs,
		shownRoot: tildify(root)
	}), a.gh ? github(root) : Promise.resolve(null)]);
	if (a.gh && !gh) c.facts.gaps.push("gh: not available or not signed in (issues and pull requests left out)");
	c.facts.github = gh;
	writeAtomic(path.join(out, "facts.json"), `${JSON.stringify(c, null, 1)}\n`);
	return c;
}
function factsSummary(c, out) {
	const f = c.facts;
	const g = f.git;
	const lines = [
		`Facts: ${tildify(path.join(out, "facts.json"))} (${f.durationMs} ms${f.truncated ? ", partial" : ""})`,
		`${c.project.name}${c.project.head ? ` on ${c.project.head.branch ?? "detached"} ${c.project.head.sha.slice(0, 7)}` : ""}: ${plural(f.files.total, "file")}, ${plural(Object.values(f.files.languages).reduce((a, l) => a + l.lines, 0), "line")}, ${plural(f.files.tests.files, "test file")}`,
		`Top folders: ${f.files.byTopFolder.slice(0, 8).map((t) => `${t.folder} ${t.lines.toLocaleString("en-US")}`).join(", ")}`
	];
	if (g) lines.push(`Git: ${plural(g.totalCommits, "commit")}, ${plural(g.branches.length, "branch", "branches")}, ${plural(g.worktrees.length, "worktree")}, ${g.uncommitted.modified + g.uncommitted.untracked + g.uncommitted.staged} uncommitted`);
	if (f.gaps.length) lines.push(`Gaps: ${f.gaps.join("; ")}`);
	return lines.join("\n");
}
/** What Claude reads before judging: compact, never file contents. */
function brief(root, out, c) {
	const f = c.facts;
	const prev = readState(readJson(path.join(out, "state.json")) ?? readJson(path.join(root, ".project-map", "state.json")));
	const judgement = readJson(path.join(out, "judgement.json"));
	const L = [factsSummary(c, out), ""];
	if (c.project.description) L.push(`README: ${c.project.description}`, "");
	L.push("Folders (lines, files, tests, commits 30d):");
	for (const d of f.files.dirs.filter((x) => x.path.split("/").length <= 2).slice(0, 30)) L.push(`  ${d.path || "."}  ${plural(d.lines, "line")}, ${plural(d.files, "file")}, ${plural(d.tests, "test")}, ${plural(d.commits30d, "commit")}`);
	if (prev) L.push("", `Previous run ${prev.generatedAt} at ${prev.head?.slice(0, 7) ?? "?"}: parts ${prev.parts.map((p) => `${p.id}=${p.status}`).join(", ")}`);
	if (judgement && typeof judgement === "object") L.push(`Previous part ids (reuse them): ${(judgement.parts ?? []).map((p) => p.id).join(", ")}`);
	const ms = read(path.join(out, "milestones.md"));
	L.push("", ms ? `milestones.md exists (${ms.split("\n").filter((l) => /^- \[/.test(l.trim())).length} items): edit only by ticking clearly done items` : "No milestones.md yet: propose milestones in judgement.json");
	const dec = read(path.join(out, "decisions.md"));
	L.push(dec ? `decisions.md exists: answers there are the user's; raise only new decisions (new ids)` : "No decisions.md yet");
	if (f.git) {
		L.push("", "Recent commits:");
		for (const cm of f.git.recentCommits.slice(0, 15)) L.push(`  ${cm.sha.slice(0, 7)} ${cm.date.slice(0, 10)} ${cm.subject}`);
		L.push("", `Branches: ${f.git.branches.slice(0, 15).map((b) => `${b.name}${b.merged ? " (merged)" : ` +${b.ahead}/-${b.behind}`}`).join(", ")}`);
	}
	if (f.github) L.push(`GitHub: ${f.github.openIssues} open issues; open PRs: ${f.github.openPrs.map((p) => `#${p.number} ${p.title}`).join("; ") || "none"}`);
	L.push(`TODO ${f.files.todo.todo}, FIXME ${f.files.todo.fixme}, HACK ${f.files.todo.hack}; test frameworks: ${f.files.tests.frameworks.join(", ") || "none found"}`);
	return L.join("\n");
}
async function render(a, root, out, repo, collected) {
	if (a.accent && !accentHex(a.accent)) console.error(`--accent ${a.accent}: not a colour name or #rrggbb, the saved accent is used`);
	const c = collected ?? (readJson(path.join(out, "facts.json")) || await runCollect(a, root, out));
	let judgement = null;
	const raw = readJson(path.join(out, "judgement.json"));
	if (raw) {
		const v = validateJudgement(raw);
		if (v.ok) judgement = v.value;
		else console.error(`judgement.json left out: ${v.error}`);
	}
	const statePath = path.join(out, "state.json");
	const prev = readState(readJson(statePath) ?? readJson(path.join(root, ".project-map", "state.json")));
	const since = repo && prev?.head ? await commitsSince(gitRunner(root, () => {}), prev.head) : null;
	const msPath = path.join(out, "milestones.md");
	const decPath = path.join(out, "decisions.md");
	const r = buildRundown({
		facts: c.facts,
		project: c.project,
		generator: {
			name: "rundown-skill",
			version: VERSION,
			mode: a.mode
		},
		judgement,
		milestonesMd: read(msPath),
		decisionsMd: read(decPath),
		prev,
		since,
		now: /* @__PURE__ */ new Date()
	});
	writeAtomic(path.join(out, "rundown.json"), `${JSON.stringify(r, null, 1)}\n`);
	const style = readStyle(a);
	let judgedAt = null;
	if (judgement) try {
		judgedAt = statSync(path.join(out, "judgement.json")).mtime.toISOString();
	} catch {}
	let href = null;
	try {
		href = indexHref();
	} catch {}
	const htmlPath = path.join(out, "rundown.html");
	const writePage = (indexLink) => {
		const page = renderPage(r, /* @__PURE__ */ new Date(), style, {
			prev,
			judgedAt,
			indexHref: indexLink
		});
		writeAtomic(htmlPath, page);
		writeAtomic(path.join(out, "map.html"), page);
	};
	writePage(href);
	if (!existsSync(msPath) && r.milestones.length) writeAtomic(msPath, writeMilestones(r.milestones, { proposed: r.milestones.some((m) => m.source === "proposed") }));
	const decMd = read(decPath);
	if (decMd === null) {
		if (r.decisions.length) writeAtomic(decPath, writeDecisions(r.decisions));
	} else {
		const next = appendDecisions(decMd, r.decisions.filter((d) => !d.answer));
		if (next !== decMd) writeAtomic(decPath, next);
	}
	if (existsSync(statePath)) {
		const hist = path.join(out, "history");
		mkdirSync(hist, { recursive: true });
		const stamp = isoLocal(/* @__PURE__ */ new Date()).slice(0, 19).replace(/[-:]/g, "");
		renameSync(statePath, path.join(hist, `${stamp}.json`));
		const old = readdirSync(hist).filter((f) => f.endsWith(".json")).sort();
		for (const f of old.slice(0, Math.max(0, old.length - 20))) unlinkSync(path.join(hist, f));
	}
	writeAtomic(statePath, `${JSON.stringify(toState(r), null, 1)}\n`);
	let index = null;
	try {
		index = await updateIndex(indexEntry(r, {
			root,
			htmlPath,
			dev: devOf(root)
		}), style);
	} catch (e) {
		r.facts.gaps.push(`index: ${e instanceof Error ? e.message : String(e)}`);
		let there = false;
		try {
			there = existsSync(indexPaths(indexHome()).html);
		} catch {}
		if (href && !there) writePage(null);
	}
	return {
		r,
		index
	};
}
/** The reply block Claude relays (reply.ts), with the index's path shown from home. */
function summary(r, mapPath, index = null) {
	return replyBlock(r, mapPath, index ? {
		html: tildify(index.html),
		count: index.count
	} : null);
}
function openFile(file) {
	const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
	try {
		spawn(cmd, [file], {
			detached: true,
			stdio: "ignore"
		}).unref();
	} catch {}
}
/** Runs a command; `rendered` hears the map a render or quick run wrote, and where its page is. */
async function main(argv, rendered) {
	const a = parseArgs(argv);
	if (a.cmd === "install") return install(a, void 0, void 0, fileURLToPath(import.meta.url));
	if (a.cmd === "session-start") {
		const text = sessionStart(hookCwd(await readStdin()));
		if (text) console.log(text);
		return 0;
	}
	if (a.cmd === "index") {
		if (a.named) {
			console.error("rundown: index covers every project and takes no --root or path");
			return 2;
		}
		try {
			const ix = await rebuildIndex(readStyle(a));
			console.log(`Index  ${tildify(ix.html)} · ${plural(ix.count, "project")}`);
			if (a.open) openFile(ix.html);
			return 0;
		} catch (e) {
			console.error(`rundown: ${e instanceof Error ? e.message : String(e)}`);
			return 2;
		}
	}
	if (a.cmd === "version" || a.cmd === "--version") {
		console.log(VERSION);
		return 0;
	}
	if (![
		"collect",
		"facts",
		"brief",
		"render",
		"quick"
	].includes(a.cmd)) {
		console.log(`rundown ${VERSION}: collect | facts | brief | render [--mode full|quick] | quick | index | session-start | install [--dry-run] [--force] | version  [--root <dir>] [--open] [--no-gh] [--theme dark|light] [--accent <name|#hex>]`);
		return a.cmd === "help" || a.cmd === "--help" ? 0 : 2;
	}
	const problem = rootProblem(a);
	if (problem) {
		console.error(`rundown: ${problem}`);
		return 2;
	}
	const { root, repo } = await topOf(a.root);
	if (!a.named && rootProblem({
		root,
		named: false
	})) {
		console.error(`rundown: ${rootProblem({
			root,
			named: false
		})}`);
		return 2;
	}
	const out = path.join(root, ".rundown");
	mkdirSync(out, { recursive: true });
	if (repo) await excludeOutput(root);
	migrate(root, out);
	if (a.cmd === "collect" || a.cmd === "facts") {
		console.log(factsSummary(await runCollect(a, root, out), out));
		return 0;
	}
	if (a.cmd === "brief") {
		const c = readJson(path.join(out, "facts.json")) ?? await runCollect(a, root, out);
		console.log(brief(root, out, c));
		return 0;
	}
	const collected = a.cmd === "quick" ? await runCollect(a, root, out) : void 0;
	const { r, index } = await render({
		...a,
		mode: a.cmd === "quick" ? "quick" : a.mode
	}, root, out, repo, collected);
	const map = path.join(out, "rundown.html");
	console.log(summary(r, tildify(map), index));
	rendered?.(r, map);
	if (a.open) openFile(map);
	return 0;
}
//#endregion
//#region src/server/rundown/bin.ts
main(process.argv.slice(2)).then((code) => {
	process.exitCode = code;
}, (err) => {
	console.error(`rundown: ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
});
//#endregion
export {};
