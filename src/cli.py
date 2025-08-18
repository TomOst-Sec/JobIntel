"""CLI interface for JobIntel."""
import click
from rich.console import Console

from .config import MARKETS
from .scraper import JobScraper
from .linkedin_scraper import LinkedInScraper
from .free_scraper import RemoteOKScraper, ArbeitnowScraper, USAJobsScraper
from .database import JobDatabase
from .analyzer import JobAnalyzer
from .report import ReportGenerator

console = Console()


@click.group()
def cli():
    """🧠 JobIntel — AI-Powered Job Market Intelligence"""
    pass


@cli.command()
@click.option("--date-posted", default="week", type=click.Choice(["all", "today", "3days", "week", "month"]),
              help="Filter by date posted")
@click.option("--market", default=None, type=click.Choice(list(MARKETS.keys()) + [None]),
              help="Scrape specific market only")
@click.option("--source", default="free", type=click.Choice(["free", "jsearch", "linkedin", "all"]),
              help="Data source (free=RemoteOK+Arbeitnow, no API key needed)")
def scrape(date_posted, market, source):
    """🔍 Scrape job postings from all markets."""
    db = JobDatabase()
    all_jobs = []

    if market:
        from . import config
        original_markets = config.MARKETS.copy()
        config.MARKETS = {market: original_markets[market]}

    # Free APIs — always work, no signup
    if source in ("free", "all"):
        rok = RemoteOKScraper()
        rok_jobs = rok.collect_all()
        all_jobs.extend(rok_jobs)
        db.upsert_jobs(rok_jobs)

        abn = ArbeitnowScraper()
        abn_jobs = abn.collect_all(pages=10)
        all_jobs.extend(abn_jobs)
        db.upsert_jobs(abn_jobs)

        usa = USAJobsScraper()
        usa_jobs = usa.collect_all()
        all_jobs.extend(usa_jobs)
        db.upsert_jobs(usa_jobs)

    # JSearch (requires RapidAPI subscription) — save per market to avoid data loss
    if source in ("jsearch", "all"):
        from .config import MARKETS as all_markets
        scraper = JobScraper()
        target_markets = {k: v for k, v in all_markets.items() 
                         if k in ("silicon_valley", "tel_aviv", "london")}
        for mid, mdata in target_markets.items():
            market_jobs = scraper.collect_market(mid, mdata, date_posted=date_posted)
            if market_jobs:
                db.upsert_jobs(market_jobs)
                console.print(f"[green]  💾 Saved {len(market_jobs)} jobs for {mdata['name']}[/green]")
            all_jobs.extend(market_jobs)

    # LinkedIn (requires RapidAPI subscription)
    if source in ("linkedin", "all"):
        li_date = {"week": "pastWeek", "today": "past24Hours", "month": "pastMonth",
                    "3days": "pastWeek", "all": "pastMonth"}.get(date_posted, "pastWeek")
        li_scraper = LinkedInScraper()
        li_jobs = li_scraper.collect_all(date_posted=li_date)
        all_jobs.extend(li_jobs)

    db.upsert_jobs(all_jobs)

    stats = db.get_stats()
    console.print(f"\n[bold green]📊 Total in DB: {stats['total_jobs']} jobs, {stats['unique_companies']} companies[/bold green]")
    db.close()


@cli.command()
@click.option("--market", default=None, type=click.Choice(list(MARKETS.keys())),
              help="Report for specific market")
@click.option("--format", "fmt", default="terminal", type=click.Choice(["terminal", "json", "markdown", "all"]),
              help="Output format")
def report(market, fmt):
    """📊 Generate market intelligence report."""
    db = JobDatabase()
    analyzer = JobAnalyzer(db)
    reporter = ReportGenerator(db, analyzer)

    if fmt in ("terminal", "all"):
        reporter.generate_terminal_report(market_id=market)
    if fmt in ("json", "all"):
        reporter.generate_json_report(market_id=market)
    if fmt in ("markdown", "all"):
        reporter.generate_markdown_report(market_id=market)

    db.close()


@cli.command()
@click.option("--market", default=None, type=click.Choice(list(MARKETS.keys())),
              help="Signals for specific market")
def signals(market):
    """🚨 Detect hiring signals (companies scaling fast)."""
    db = JobDatabase()
    analyzer = JobAnalyzer(db)

    sigs = analyzer.detect_signals()

    if not sigs:
        console.print("[yellow]No strong hiring signals detected. Try scraping more data first.[/yellow]")
        db.close()
        return

    from rich.table import Table
    table = Table(title="🚨 Hiring Signals", show_lines=True)
    table.add_column("Company", style="bold yellow")
    table.add_column("Market", style="cyan")
    table.add_column("Signal", style="red")
    table.add_column("Strength", justify="right")
    table.add_column("Detail")

    for s in sigs:
        if market and s["market_id"] != market:
            continue
        strength_bar = "🟢" * int(s["signal_strength"] * 5)
        table.add_row(
            s["company"],
            s["market_name"],
            s["signal_type"],
            strength_bar,
            s["detail"],
        )

    console.print(table)
    db.close()


@cli.command()
def stats():
    """📈 Show database statistics."""
    db = JobDatabase()
    s = db.get_stats()

    console.print(f"""
[bold cyan]📈 JobIntel Database Stats[/bold cyan]
  Total Jobs:      {s['total_jobs']}
  Companies:       {s['unique_companies']}
  Markets:         {s['markets']}
  With Salary:     {s['with_salary']}
""")
    db.close()


@cli.command()
@click.option("--market", default=None, type=click.Choice(list(MARKETS.keys())))
@click.option("--min-postings", default=3, help="Minimum postings to flag")
def scaling(market, min_postings):
    """🔥 Find companies that are scaling (posting many jobs)."""
    db = JobDatabase()
    companies = db.get_scaling_companies(market_id=market, min_postings=min_postings)

    if not companies:
        console.print("[yellow]No scaling companies found. Run 'scrape' first.[/yellow]")
        db.close()
        return

    from rich.table import Table
    table = Table(title=f"🔥 Companies with {min_postings}+ postings this week", show_lines=True)
    table.add_column("Company", style="bold")
    table.add_column("Market", style="cyan")
    table.add_column("Postings", justify="right", style="red")
    table.add_column("Categories")

    for c in companies:
        market_name = MARKETS.get(c["market_id"], {}).get("name", c["market_id"])
        table.add_row(c["company"], market_name, str(c["total_postings"]), c["categories"][:80])

    console.print(table)
    db.close()


@cli.command()
@click.option("--market", default=None, type=click.Choice(list(MARKETS.keys())))
def salaries(market):
    """💰 Show salary statistics by role and market."""
    db = JobDatabase()
    stats = db.get_salary_stats(market_id=market)

    if not stats:
        console.print("[yellow]No salary data found. Run 'scrape' first.[/yellow]")
        db.close()
        return

    from rich.table import Table
    table = Table(title="💰 Salary Stats", show_lines=True)
    table.add_column("Role", style="cyan")
    table.add_column("Market")
    table.add_column("Avg Min", justify="right")
    table.add_column("Avg Max", justify="right", style="green")
    table.add_column("Highest", justify="right", style="bold green")
    table.add_column("Jobs", justify="right")

    for s in stats:
        market_name = MARKETS.get(s["market_id"], {}).get("name", s["market_id"])
        table.add_row(
            s["search_category"],
            market_name,
            f"${s['avg_min_salary']:,.0f}" if s.get("avg_min_salary") else "N/A",
            f"${s['avg_max_salary']:,.0f}" if s.get("avg_max_salary") else "N/A",
            f"${s['highest_salary']:,.0f}" if s.get("highest_salary") else "N/A",
            str(s["job_count"]),
        )

    console.print(table)
    db.close()


def main():
    cli()


if __name__ == "__main__":
    main()
