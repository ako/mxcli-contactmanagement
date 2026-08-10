# FINDINGS

Durable notes for the next session. Append, don't rewrite.

**Versions in use**

- Mendix: `11.13.0`
- mxcli: `nightly-20260810-1e1773d3` (built 2026-08-10T00:44:28Z)
- Platform: Linux x86_64, cloud container (Claude Code on the web)

---

## 2026-08-10 — Provisioning

### `mxcli` was not pre-installed in this environment

Expected it on `PATH` per the workflow; `which mxcli` found nothing. Fetched the
nightly prebuilt binary instead:

```bash
curl -fsSL -o ./mxcli https://github.com/mendixlabs/mxcli/releases/download/nightly/mxcli-linux-amd64
chmod +x ./mxcli
```

*Verified:* `./mxcli --version` → `mxcli version nightly-20260810-1e1773d3`.

### `mxcli version` is not a command

`./mxcli version` fails with `unknown command "version" for "mxcli"`. The flag form
`./mxcli --version` works. Minor, but easy to trip over when scripting a version
check — worth aliasing upstream, since nearly every other CLI accepts both.

*Verified:* both invocations run, one errors and one prints the version.

### `mxcli new` into a non-empty git repo — the documented dance works

`mxcli new` refuses a non-empty target, and a git repo always has `.git`. Created in
a subfolder and moved up, as the workflow prescribes:

```bash
./mxcli new ContactManagement --version 11.13.0 --theme ledger
rm -f ContactManagement/mxcli          # hardlink to ./mxcli; mv refuses "same file"
shopt -s dotglob && mv ContactManagement/* . && rmdir ContactManagement
```

Two things worth knowing:

- **No collision with pre-existing root files.** This repo already had `LICENSE` and
  a stub `README.md`; `mxcli new` generates neither (it writes `AGENTS.md` and
  `CLAUDE.md`), so `mv` clobbered nothing. If a future repo starts with an
  `AGENTS.md` or `CLAUDE.md`, that move *would* silently overwrite it.
- **The SessionStart hook survived the move.** `.claude/bootstrap-mxcli.sh` hardcodes
  `MPR='ContactManagement.mpr'` as a bare relative path, so moving the project up one
  level left it correct. It would only need editing if the `.mpr` were renamed.

*Verified:* read `.claude/settings.json` and `.claude/bootstrap-mxcli.sh` after the
move; `ls` confirms `ContactManagement.mpr` at the repo root next to them.

### VS Code MDL extension could not auto-install

`mxcli new` (and `mxcli init`) print a boxed warning that the bundled
`.claude/vscode-mdl.vsix` could not be installed because `code` is not on `PATH`.
Expected and harmless in a headless cloud container — noted only so the box isn't
mistaken for a failure.

### `mxcli init --tool claude` is genuinely idempotent

Re-ran it after the move to confirm the hook, skills and commands were all in place
post-`mv`. Completed cleanly, regenerated 42 widget docs into `.ai-context/skills/`,
no duplicate hook entry appended to `.claude/settings.json`.

*Verified:* `.claude/settings.json` still has exactly one `SessionStart` hook entry.

### `run --local --setup --ensure-db` worked first try

MxBuild 11.13.0 was already cached from the `mxcli new` build step. The command
started local PostgreSQL, created role `mendix` and database `contactmanagement`
(name derived from the `.mpr`), at `127.0.0.1:5432`.

*Verified:* command output `Database ready: contactmanagement (user "mendix")`.

### Blank app boots clean — HTTP 200 on the first `run --local`

`./mxcli run --local -p ContactManagement.mpr` → cold build ~10-15s, web client
bundled in 7.6s, `Runtime started; app serving at http://127.0.0.1:8080/`.

*Verified:* `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/` → `200`,
and the response body is the Mendix index page.

### Security is Off out of the box — matches the brief, but the roles are still there

`SHOW PROJECT SECURITY` reports `Security Level: Off`, which is what this app wants.
Worth knowing that the blank template *still ships* two user roles (`Administrator`,
`User`), demo users enabled, and module roles wired into `MyFirstModule` /
`FeedbackModule`. They are inert while the level is `Off`, so nothing needs deleting
— but do not read "2 user roles" from `SHOW USER ROLES` as "security is on".

Command notes: `SHOW SECURITY;` is **not** valid on its own — it parses as the start
of `SHOW SECURITY MATRIX` and fails with
`Parse error: line 1:52 missing MATRIX at ';'`. The two working forms are
`SHOW PROJECT SECURITY;` (level, strict mode, demo users, password policy) and
`SHOW SECURITY MATRIX;` (page/microflow access per module role).

*Verified:* all three commands run; the error text above is the literal output.

### `SHOW SETTINGS` reports Hsqldb, but the app actually runs on PostgreSQL

`SHOW SETTINGS` prints `Configuration 'Default' | Hsqldb, db=default, http=8080` —
that is the *model's* stored configuration, untouched by `--ensure-db`. The actual
run uses the PostgreSQL database `contactmanagement` that `--ensure-db` provisioned;
`run --local` overrides the connection at boot rather than editing the model. Do not
"fix" the model setting to match — it would just make the checked-in project
environment-specific.

*Verified:* `--ensure-db` created and reported the Postgres database while the model
still reads Hsqldb, and the app boots and serves against it.

### Lint baseline on a blank project is not zero

`./mxcli lint` on the untouched template reports **7 issues: 0 errors, 0 warnings,
7 info** — all against the shipped `MyFirstModule` (page naming convention, missing
documentation, `MyFirstLogic` uncalled and unprefixed). Useful as the "before"
number: new lint output should be compared against 7, not 0.

*Verified:* full lint run, output tail recorded above.

### Hub preview works, and it is GitHub-gated

`MXCLI_HUB_KEY` **is** set in this environment, so step 9 applies. Ran:

```bash
./mxcli run --hub https://hub.mxcli.org -p ContactManagement.mpr
```

It reverse-tunnels :8080 out and derives the subdomain from the `.mpr` name plus the
git branch:
`https://contactmanagement-claude-mendix-app-provisioning-ca06ft.mxcli.org`

Two things to expect:

- The URL is **branch-derived**, so it changes when the branch changes. A long branch
  name makes a long hostname.
- Hitting it unauthenticated returns **302 → `hub.mxcli.org/auth/github/login`**, not
  the app. That is the hub's access gate, not a broken tunnel — a browser session that
  logs in with GitHub gets through. (Following the redirect from inside this container
  ends in a 403 at `github.com/login/oauth/authorize`; that is the agent proxy
  blocking the OAuth page, and says nothing about the preview.)

*Verified:* local `curl` → 200 at the same moment the public URL → 302, so the
runtime is up and the tunnel is carrying traffic.

### Port 8080 must be free before a second `run`

`--hub` implies `--local` and binds the same 8080, so the plain local run has to be
stopped first or the second boot collides. Relevant to a future solution layout —
that is exactly what the `--app-port` / `--admin-port` / `--serve-port` offsets are
for.
