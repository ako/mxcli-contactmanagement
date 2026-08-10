# ContactManagement

A Mendix app developed with [mxcli](https://github.com/mendixlabs/mxcli).

## The brief

*(the answers this app was provisioned from — in the owner's words)*

- **One app**, not a solution. Everything lives in this repo at the root.
- **What it is for:** a contact management app.
- **What it keeps track of:** contacts and their address info, and short notes.
- **Who logs in:** nobody — **no security**. There are no user roles; the app runs
  with project security off.

## Setup

| | |
|---|---|
| App name | `ContactManagement` (`ContactManagement.mpr`) |
| Mendix version | `11.13.0` |
| Theme | `ledger` (warm paper, hairline rules, serif headings, 30px rows) |
| Security | Off — no user roles |
| Database | local PostgreSQL, database `contactmanagement` |

## The model

Everything the app does lives in the **`ContactManagement`** module. (The template's
`MyFirstModule` is left as it shipped and is not used.)

**Entities**

| Entity | Holds | Relates |
|---|---|---|
| `Contact` | FirstName, LastName (required), Company, JobTitle, Email, Phone, Mobile | the root |
| `Address` | AddressType (Home/Work/Postal/Other), Street, HouseNumber, PostalCode, City, Region, Country, IsPrimary | many per `Contact`, cascade-deleted |
| `Note` | NoteText (max 500 chars) | many per `Contact`, cascade-deleted, ordered by system `createdDate` |

**Pages**

- `Contact_Overview` — the home page: every contact, with a *New contact* button.
- `Contact_NewEdit` (`/contact/{Contact}`) — the details, with the contact's
  addresses and notes listed underneath and *Add address* / *Add note* buttons.
- `Address_NewEdit`, `Note_NewEdit` — popups.

**Microflows.** Each popup button is backed by an `ACT_` microflow rather than the
built-in save/cancel/delete actions, because those commit but do not close the page.
The create-child microflows commit the contact first, and the save/delete microflows
commit the contact with `REFRESH` afterwards, so the lists on the contact page update
immediately. `FINDINGS.md` explains why each of those is necessary.

**Rebuilding it.** The MDL that produced all of the above is in `scripts/`, numbered
in the order it was applied. `01` is the model; `02`–`05` are corrections found by
running the app in a browser. They are kept as a record — the `.mpr` is the source of
truth, and re-running them on the current model would fail on the `CREATE` statements.

## Running it

The repo self-bootstraps: the Claude Code `SessionStart` hook in
`.claude/settings.json` runs `.claude/bootstrap-mxcli.sh`, which downloads the
`mxcli` binary (git-ignored, ~85 MB) if missing, then caches MxBuild + the runtime
and provisions the database.

Manually:

```bash
# one-time prerequisites (MxBuild, runtime, Postgres, database)
./mxcli run --local --setup --ensure-db -p ContactManagement.mpr

# boot the warm dev loop -> http://localhost:8080/
./mxcli run --local -p ContactManagement.mpr
```

See `AGENTS.md` / `CLAUDE.md` for the full mxcli command reference, and
`FINDINGS.md` for notes on anything that surprised or broke along the way.
