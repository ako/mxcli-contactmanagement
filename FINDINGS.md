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

---

## 2026-08-10 — Building the ContactManagement module

Model built from `scripts/01-contact-management-model.mdl`, then two corrective
scripts (`02-close-popups.mdl`, `03-commit-parent-before-child.mdl`). Everything
below was found by running the app in a real browser, not by reading the model.

### `mxcli check` passes things `mxbuild` rejects — twice

This is the big one. `mxcli check` validates MDL *syntax*; it does not resolve model
references or apply Mendix's consistency rules. Two errors sailed through a clean
`Check passed!` and only appeared at `run --local`, as a hard
`initial build failed: The project cannot be deployed, because it contains errors`:

1. **`CE1613` — nonexistent icon.** `ICON Atlas_Core.Atlas."user-multiple"` is
   well-formed MDL and a plausible Atlas name, but that icon does not exist.
   Find real names with `DESCRIBE ICON COLLECTION Atlas_Core.Atlas;` — the correct
   one here was `Atlas_Core.Atlas.contacts`.
2. **`CE5601` — page URL missing its parameter segment.** A page with a parameter
   must carry it in the URL: `Url: 'contact'` is rejected for a page with
   `Params: { $Contact: ... }`; `Url: 'contact/{Contact}'` is required.

Verified: both failed the build with the model otherwise unchanged, and both booted
clean once fixed. **Treat `mxcli check` as a spell-checker, not a compiler — a real
`run --local` is the only proof.** Fixing the URL after the fact worked with
`ALTER PAGE … { SET Url = 'contact/{Contact}'; }` even though `SET Url` is not in
the documented `page.alter` property list.

### `SAVE_CHANGES` does not close the page — popups stay open

`ACTIONBUTTON (Action: SAVE_CHANGES)` commits the object and leaves the page open.
On a popup that means the dialog just sits there after Save. Verified in a browser:
after clicking Save on the address popup, the new address appeared in the list on
the page *behind* the still-open dialog. Same for `CANCEL_CHANGES` and `DELETE`.

There is no button property to fix it. All four guesses are rejected by `ALTER PAGE`:

```
SET ClosePage   = true ON btnSave;  -- property "ClosePage" not found
SET CloseAction = true ON btnSave;  -- property "CloseAction" not found
SET Close       = true ON btnSave;  -- property "Close" not found
SET CloseOnSave = true ON btnSave;  -- property "CloseOnSave" not found
```

The working pattern is a microflow per button — `COMMIT $Obj; CLOSE PAGE;` for save,
`ROLLBACK $Obj; CLOSE PAGE;` for cancel, `DELETE $Obj; CLOSE PAGE;` for delete — see
`scripts/02-close-popups.mdl`. Worth considering upstream: a `CLOSING` modifier on
these actions would remove the need for eight boilerplate microflows.

*Verified:* before the change the dialog stayed open and the next click failed with
`<div class="mx-underlay"></div> intercepts pointer events`; after it, the full
create-contact → add-address → add-note → save flow runs through.

### `ALTER PAGE`: `SET Action = MICROFLOW …` does not parse — use `REPLACE`

`SET Action = MICROFLOW Module.MF(Param: $x) ON btnSave;` fails with
`extraneous input 'ContactManagement' expecting {DROP, ADD, SET, INSERT, REPLACE, '}'}`.
`SET` takes simple values only. Swap the whole widget instead:

```sql
ALTER PAGE Module.Page {
  REPLACE btnSave WITH {
    ACTIONBUTTON btnSave (Caption: 'Save',
      Action: MICROFLOW Module.ACT_Save(Obj: $Obj), ButtonStyle: Primary)
  };
};
```

*Verified:* the `SET` form fails the syntax check; the `REPLACE` form checks and
executes.

### `CREATE OR REPLACE MICROFLOW` works but is undocumented

`mxcli syntax microflow create` shows only `CREATE MICROFLOW`, and neither
`CREATE OR REPLACE MICROFLOW` nor `ALTER MICROFLOW` appears anywhere in
`mxcli syntax --json`. `CREATE OR REPLACE MICROFLOW` nonetheless works and prints
`Replaced microflow: …`, keeping the pages that call it wired up. That is exactly
what you want for iterating on logic — it deserves a mention in the syntax registry.

*Verified:* used it to rewrite both `ACT_*_New` microflows in place; the buttons
calling them kept working after a rebuild.

### A child of an uncommitted parent commits, but disappears

Design-level, not an mxcli bug, but it bites the obvious first implementation.
`ACT_Address_New` originally did `CREATE Address (Address_Contact = $Contact)` where
`$Contact` was a brand-new, never-committed object. The address committed without
error, and the list on the contact page still said **"No items found"** — the
association could not resolve to an uncommitted parent. Same for notes. Saving the
contact *first* and then adding an address worked correctly.

Fix: `COMMIT $Contact;` as the first activity of the create-child microflow
(`scripts/03-commit-parent-before-child.mdl`). Accepted trade-off: cancelling a
brand-new contact after adding an address leaves the contact saved.

*Verified:* before, "No items found" after adding an address to an unsaved contact;
after, the address shows up immediately.

### The popup dialog class is `.mx-window`, not `.mx-dialog`

For anyone writing browser checks against a Mendix 11 React client: the modal root
is `div.modal-dialog.mx-window.mx-window-active`, the backdrop is `div.mx-underlay`,
and every button carries a precise
`data-button-id="p.<Module>.<Page>.<widgetName>"` — much better than matching on
caption text, since Save/Cancel appear on both the popup and the page behind it.

### `playwright-cli` is missing, so `mxcli playwright verify` cannot run here

`mxcli playwright verify` shells out to `playwright-cli`, which is not on `PATH` in
this container. Chromium *is* pre-installed at `/opt/pw-browsers`, but the
`playwright` npm package installed on demand expects build `1234` while the image
ships `1194`, so `chromium.launch()` fails with
`Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1234/…`.
Workaround: launch with an explicit path —
`chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })`.

### `mxcli oql` requires every select column to be named

`SELECT COUNT(*) FROM …` fails with `All OQL select columns must have a name`.
Use `SELECT COUNT(*) AS Total FROM …`. Note the failure also lands a full Java stack
trace in `.mxcli/runtime.log`, which is misleading when you go looking there for an
unrelated problem a few minutes later.

### Lint after the module: 29 issues, 0 errors

Up from the 7-info baseline. The 8 warnings are all expected: `SEC001`/`SEC006`
(entities have no access rules) are unavoidable and meaningless with security `Off`,
and `CONV010` objects to `ACT_` microflows containing logic — noise for a
two-activity create-and-show. Nothing here needs action.

### Retrieve-over-association: `$Var = $Obj/Assoc` is rejected, `RETRIEVE … FROM` works

Assigning an associated object to a variable fails validation at exec time (not at
check time):

```
$Contact = $Address/ContactManagement.Address_Contact;
-- Error: microflow 'ACT_Address_Save' has validation errors:
--   - variable 'Contact' is not declared
--   Example: declare $Contact Boolean = true;  -- or String, Integer, Decimal, DateTime
```

The suggested fix in that message is misleading — `DECLARE` is documented for
primitives only, and the real answer is a different statement:

```sql
RETRIEVE $Contact FROM $Address/ContactManagement.Address_Contact;
```

That form works but appears nowhere in `mxcli syntax --json`, which documents only
`RETRIEVE $Var FROM Module.Entity [WHERE …]`. Retrieve-by-association is worth adding
to `microflow.retrieve` — it is one of the most common activities in real Mendix
logic.

*Verified:* the assignment form fails `mxcli exec`; the `RETRIEVE … FROM $Obj/Assoc`
form creates the microflow and runs correctly against the running app.

### A committed child does not refresh the parent's list — commit the parent with REFRESH

Third and last layer of the same story. With the popup closing and the child
committed and correctly associated, the address/note list on the contact page *still*
showed "No items found" until the contact was closed and reopened. The client has no
reason to re-query an association it already fetched.

Fix, in each child-save/delete microflow (`scripts/04-refresh-parent-on-save.mdl`):

```sql
COMMIT $Address;
RETRIEVE $Contact FROM $Address/ContactManagement.Address_Contact;
COMMIT $Contact REFRESH;
CLOSE PAGE;
```

Taken together, a working "add a child from a popup" in MDL needs four things that
none of `mxcli check`, `mxcli lint` or the syntax reference will tell you: commit the
parent before creating the child, close the page explicitly, retrieve the parent by
association, and commit it with `REFRESH`.

### Inline text + link concatenates too — not just two dynamictexts

`MDL-WIDGET15` warns about two adjacent inline `dynamictext` widgets. The same thing
happens with a `dynamictext` followed by a `linkbutton`, and that pair is **not**
flagged. It rendered as `…, London United KingdomEdit` and `…re: Menabrea.Edit`.
Same fix — wrap the text in its own container (`scripts/05-…`). The checker's rule
would be more useful if it covered any inline widget following a dynamictext, not
only another dynamictext.

*Verified:* browser screenshots before and after; the "Edit" link now sits on its own
line.

### Working practice that came out of this

`mxcli check` → `mxcli exec` → **`mxcli run --local` (the real build)** → **look at it
in a browser**. Steps 3 and 4 are where every single defect in this session was found;
steps 1 and 2 caught none of them. Budget for that.

---

## 2026-08-10 — Runtime observability: where the time actually goes

Method (from `.ai-context/skills/analyze-runtime.md`): seed realistic data, run with
`--metrics`, diff the Prometheus counters around each interaction, raise
`ConnectionBus_Queries`/`_Retrieve` to TRACE to get the actual SQL, then
`EXPLAIN (ANALYZE, BUFFERS)` the statements that matter. Load: **5,001 contacts,
10,305 addresses, 17,003 notes** (`scripts/seed-perf-data.sql`), plus one deliberately
"fat" contact with 300 addresses and 2,003 notes.

### Measurement gotcha that invalidated my first run

The first harness used fixed `waitForTimeout` sleeps between steps, so every reported
duration was mostly my own sleep (a "3,062 ms" contact open was ~60 ms of work plus a
3,000 ms sleep). Timings below wait on real signals — a field visible, a list row
present, the dialog detached. Anyone repeating this: **never time a step that contains
a fixed sleep.**

### The headline: association reads are unbounded

The contact detail page renders **20** addresses and **20** notes (Mendix listviews
page at 20 with a "Load more" button). The server retrieves **all of them**:

```sql
SELECT … FROM "contactmanagement$note"
 WHERE id IN (SELECT x.id FROM "contactmanagement$note" x
              WHERE x."contactmanagement$note_contact" = ? AND NOT … IS NULL)
-- no LIMIT, no ORDER BY
```

Measured on the fat contact: `rows=2003`, **6,051 shared buffer hits**, 3.74 ms in
Postgres — to display 20 rows. The index is used correctly; the waste is in *what is
asked for*, not how it is executed. Browser-side, the child lists render in **443 ms**
for the fat contact vs **178 ms** for a normal one, on identical page structure.

This is O(children), so it degrades without limit: a contact with 50,000 notes
retrieves 50,000 objects into runtime memory on every page view.

Verified: `child queries: 2, of which carry a LIMIT: 0` on both fat and normal
contacts, from the TRACE log.

### Every child save re-reads the sibling list that did not change

`COMMIT $Contact REFRESH` in `ACT_Address_Save` (added in `scripts/04-…` to fix a
stale list) refreshes the whole contact, so **saving an address re-queries all the
notes**. Confirmed in the trace: one save produces 24–27 statements including exactly
one full note re-read and two address re-reads. On the fat contact that is 2,003 notes
re-read because one address changed. Correctness fix with a scaling cost — worth
knowing before this app meets a real dataset.

### The overview is paged, but the offset scan grows

`SELECT … FROM "contactmanagement$contact" ORDER BY id ASC LIMIT ? OFFSET ?`,
one query per "Load more", 21 rows each. Efficient per click, but offset paging scans
everything it skips:

| Page | Plan | Execution |
|---|---|---|
| offset 0 | Index Scan, `rows=21`, 3 buffers | **0.079 ms** |
| offset 4,980 | Index Scan, `rows=5001`, 100 buffers | **1.781 ms** (22×) |

Reaching the end of 5,001 contacts takes **~250 clicks**.

### The LastName index I created has never been used

```
idx_contactmanagement$contact_lastname_asc | idx_scan = 2
contactmanagement$contact_pkey             | idx_scan = 27410
```

Both of those 2 scans were my own `EXPLAIN` statements. The listview declares no sort
order, so Mendix sorts by `id` — meaning contacts appear in **insertion order, not
alphabetically** (wrong for an address book), and the index is pure write-side cost.
`INDEX (LastName)` in the entity does not make anything sort by LastName; the *widget*
has to ask for it.

### What is NOT a bottleneck

- **Postgres.** Every statement measured is under 4 ms, most under 0.2 ms, all using
  indexes. At this scale the database is nowhere near the constraint.
- **The overview's 5,001 rows.** It never loads them — `LIMIT 21` from the first paint.
- **Session bootstrap.** The `system$user` / `userrole` / `grantableroles` / `language`
  / `timezone` reads on first page load are once per session, not per page.

### Metric names differ from the skill's example

`analyze-runtime.md` greps `connectionbus_|handler_requests|sessions_`; the actual
families are prefixed **`mx_runtime_stats_`** (e.g.
`mx_runtime_stats_connectionbus_selects_total`). An anchored regex on the documented
names matches nothing. Jetty request timing is separate:
`jetty_connections_request_seconds_{sum,count,max}` — and it measures *connection*
lifetime, so a "2.7 s max" on a keep-alive connection is not a 2.7 s request; do not
read it as latency.
