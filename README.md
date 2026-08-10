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
