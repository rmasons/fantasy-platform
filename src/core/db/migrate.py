"""Plain-SQL migration runner.

Deliberately simple and transparent: numbered ``*.sql`` files in ``migrations/``,
applied in order, tracked in ``public.schema_migrations``. You can read every line
of what runs against the DB — no ORM, no codegen. Swap for yoyo/Alembic later if
the project outgrows it.

Run with:  PYTHONPATH=src python -m core.db.migrate
"""

from pathlib import Path

from core.db.pool import connection

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "migrations"

_CREATE_TRACKING = """
create table if not exists public.schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
);
"""


def _applied(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("select version from public.schema_migrations")
        return {row["version"] for row in cur.fetchall()}


def migrate() -> None:
    files = sorted(p for p in MIGRATIONS_DIR.glob("*.sql") if p.stem[0].isdigit())
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(_CREATE_TRACKING)
        conn.commit()
        done = _applied(conn)
        applied_any = False
        for path in files:
            version = path.stem
            if version in done:
                continue
            print(f"applying {version} ...")
            with conn.cursor() as cur:
                cur.execute(path.read_text())
                cur.execute(
                    "insert into public.schema_migrations (version) values (%s)",
                    (version,),
                )
            conn.commit()
            applied_any = True
        print("migrations up to date" if not applied_any else "done")


if __name__ == "__main__":
    migrate()
