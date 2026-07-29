"""Forward-only migration runner.

Build spec: `docs/build/01-foundation.md` section 7.

Applies numbered `*.sql` files from `migrations/` in filename order, recording
each in a tracking table so it runs exactly once. Independent of the API — it
imports settings and nothing else, and can be built and tested on its own day.

Run it: ``PYTHONPATH=src python -m core.db.migrate``

**There is no lifespan here.** The pool is constructed with `open=False`, so
this module has to open it itself; borrowing from an unopened pool raises
`PoolClosed`, not `PoolTimeout`, which is a confusing error to debug backwards
from.

Why plain SQL and not Alembic: you can read every line that touches the
database, and the schema is the thing you are trying to learn. Swap in Alembic
if this outgrows itself — it will be obvious when.
"""

from pathlib import Path

import psycopg
from psycopg.rows import DictRow

# repo root: src/core/db/migrate.py -> db -> core -> src -> root
MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "migrations"

TRACKING_TABLE = "public.schema_migrations"


def ensure_tracking_table(conn: psycopg.Connection[DictRow]) -> None:
    """Create `public.schema_migrations` if it does not exist.

    TODO(spec 01 section 7): `version` text PRIMARY KEY, `applied_at`
    timestamptz DEFAULT now(). Must be safe to run against a database that has
    already been migrated — this is called on every run.
    """
    raise NotImplementedError


def applied_versions(conn: psycopg.Connection[DictRow]) -> set[str]:
    """Return the versions already recorded in the tracking table.

    TODO(spec 01 section 7): a set, because the only question asked of it is
    membership.
    """
    raise NotImplementedError


def discover_migrations() -> list[Path]:
    """Return the migration files in `MIGRATIONS_DIR`, in filename order.

    TODO(spec 01 section 7): glob `*.sql` and sort. **Skip any file whose stem
    does not start with a digit** — that is what excludes `ROLES.sql`, which
    grants least-privilege roles and is applied out-of-band because managed
    hosts provision roles differently (Neon does not hand you superuser). See
    spec 02 for the ownership split it enforces.
    """
    raise NotImplementedError


def apply_migration(conn: psycopg.Connection[DictRow], path: Path) -> None:
    """Apply one migration and record it, in a single transaction.

    TODO(spec 01 section 7): execute the file's SQL and insert its version
    (the filename stem, e.g. `0001_init`) **in the same transaction**. That is
    the whole point: a failure halfway through a set leaves the earlier
    migrations applied and the failing one *not* recorded, so fixing the SQL
    and re-running does the right thing.
    """
    raise NotImplementedError


def main() -> None:
    """Open the pool, apply anything pending, report what happened.

    TODO(spec 01 section 7): open the pool (see the module docstring), ensure
    the tracking table, diff `discover_migrations()` against
    `applied_versions()`, apply each pending file in order, and close the pool.

    Print what it applies, and say so explicitly when there is nothing to do —
    a silent no-op is indistinguishable from a runner that failed to find the
    directory at all.

    There are no numbered migrations yet (spec 02 writes the first), so
    "reports nothing to apply" is the entire test here. It feels anticlimactic
    and it is correct. Closes criteria 6 and 7.
    """
    raise NotImplementedError


if __name__ == "__main__":
    main()
