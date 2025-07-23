"""Simple versioned SQL migration runner."""
import os
import glob
import sqlite3
from rich.console import Console

console = Console()

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")


def run_migrations(conn: sqlite3.Connection):
    """Run all pending SQL migrations in order."""
    # Create migrations tracking table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY,
            filename TEXT NOT NULL UNIQUE,
            applied_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()

    # Get already-applied migrations
    applied = {
        row[0]
        for row in conn.execute("SELECT filename FROM _migrations").fetchall()
    }

    # Find and sort migration files
    pattern = os.path.join(MIGRATIONS_DIR, "*.sql")
    migration_files = sorted(glob.glob(pattern))

    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename in applied:
            continue

        console.print(f"[cyan]Applying migration: {filename}[/cyan]")
        with open(filepath) as f:
            sql = f.read()

        try:
            conn.executescript(sql)
            conn.execute(
                "INSERT INTO _migrations (filename) VALUES (?)", (filename,)
            )
            conn.commit()
            console.print(f"[green]  Applied: {filename}[/green]")
        except sqlite3.Error as e:
            console.print(f"[red]  Migration failed ({filename}): {e}[/red]")
            raise

    console.print("[green]All migrations up to date.[/green]")
