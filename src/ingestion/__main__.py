"""CLI entry: PYTHONPATH=src python -m ingestion [daily|backfill <league_id>]"""

import sys

from ingestion import backfill, daily

_USAGE = "usage: python -m ingestion [daily | backfill <league_id>]"


def main(argv: list[str]) -> int:
    if not argv:
        print(_USAGE)
        return 1
    cmd, rest = argv[0], argv[1:]
    if cmd == "daily":
        daily.run()
        return 0
    if cmd == "backfill":
        if not rest:
            print("backfill needs a league_id")
            return 1
        backfill.run(rest[0])
        return 0
    print(_USAGE)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
