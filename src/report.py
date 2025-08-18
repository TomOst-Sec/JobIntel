"""Report generation for JobIntel."""
import json
import os
from datetime import datetime
from typing import Optional
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

from .config import REPORTS_DIR, MARKETS
from .database import JobDatabase
from .analyzer import JobAnalyzer

console = Console()


class ReportGenerator:
    """Generates reports in multiple formats."""

    def __init__(self, db: JobDatabase, analyzer: JobAnalyzer):
        self.db = db
        self.analyzer = analyzer
        os.makedirs(REPORTS_DIR, exist_ok=True)

    def generate_terminal_report(self, market_id: Optional[str] = None):
        """Print a rich terminal report."""
        intel = self.analyzer.generate_market_intelligence(market_id=market_id)

        # Header
        title = f"📊 JobIntel Report — {intel['market_name']}"
        console.print(Panel(title, style="bold cyan", expand=True))
        console.print(f"[dim]Generated: {intel['generated_at']}[/dim]\n")

        # Database stats
        stats = intel["db_stats"]
        console.print(f"[bold]Database:[/bold] {stats['total_jobs']} jobs | {stats['unique_companies']} companies | {stats['with_salary']} with salary data\n")

        # Market Overview
        if intel["overview"]:
            table = Table(title="🌍 Market Overview", show_lines=True)
            table.add_column("Market", style="cyan")
            table.add_column("Jobs", justify="right")
            table.add_column("Companies", justify="right")
            table.add_column("Remote %", justify="right")
            table.add_column("Avg Salary", justify="right", style="green")

            for m in intel["overview"]:
                market_name = MARKETS.get(m["market_id"], {}).get("name", m["market_id"])
                avg_sal = f"${m['avg_salary']:,.0f}" if m.get("avg_salary") else "N/A"
                table.add_row(
                    market_name,
                    str(m["total_jobs"]),
                    str(m["unique_companies"]),
                    f"{m.get('remote_pct', 0)}%",
                    avg_sal,
                )
            console.print(table)
            console.print()

        # Scaling Companies (Hot Signals)
        if intel["scaling_companies"]:
            table = Table(title="🔥 Companies Scaling NOW", show_lines=True)
            table.add_column("Company", style="bold yellow")
            table.add_column("Market", style="cyan")
            table.add_column("Open Roles", justify="right", style="red")
            table.add_column("Categories", style="dim")

            for c in intel["scaling_companies"][:15]:
                market_name = MARKETS.get(c["market_id"], {}).get("name", c["market_id"])
                table.add_row(
                    c["company"],
                    market_name,
                    str(c["total_postings"]),
                    c["categories"][:60],
                )
            console.print(table)
            console.print()

        # Salary Stats
        if intel["salary_stats"]:
            table = Table(title="💰 Salary Ranges by Role", show_lines=True)
            table.add_column("Role", style="cyan")
            table.add_column("Market")
            table.add_column("Avg Min", justify="right")
            table.add_column("Avg Max", justify="right", style="green")
            table.add_column("Highest", justify="right", style="bold green")
            table.add_column("# Jobs", justify="right")

            for s in intel["salary_stats"][:20]:
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
            console.print()

        # Skill Demand
        if intel["skill_demand"]:
            table = Table(title="📈 Skill Demand This Week", show_lines=True)
            table.add_column("Skill", style="cyan")
            table.add_column("Market")
            table.add_column("Demand", justify="right", style="bold")
            table.add_column("Remote", justify="right")
            table.add_column("Avg Salary", justify="right", style="green")

            for s in intel["skill_demand"][:20]:
                market_name = MARKETS.get(s["market_id"], {}).get("name", s["market_id"])
                avg_sal = f"${s['avg_salary']:,.0f}" if s.get("avg_salary") else "N/A"
                table.add_row(
                    s["search_category"],
                    market_name,
                    str(s["demand_count"]),
                    str(s["remote_count"]),
                    avg_sal,
                )
            console.print(table)
            console.print()

        # AI Insights
        insights = intel.get("ai_insights", {})
        if insights and not insights.get("error"):
            console.print(Panel("[bold]🧠 AI-Powered Insights[/bold]", style="magenta"))

            if insights.get("executive_summary"):
                console.print(f"\n[bold]Executive Summary:[/bold] {insights['executive_summary']}\n")

            if insights.get("hot_companies"):
                console.print("[bold]🔥 Hot Companies:[/bold]")
                for hc in insights["hot_companies"]:
                    console.print(f"  • [yellow]{hc['company']}[/yellow] — {hc['signal']}")
                    console.print(f"    [dim]→ {hc['opportunity']}[/dim]")
                console.print()

            if insights.get("salary_insights"):
                console.print("[bold]💰 Salary Insights:[/bold]")
                for si in insights["salary_insights"]:
                    console.print(f"  • {si}")
                console.print()

            if insights.get("trending_roles"):
                console.print("[bold]📈 Trending Roles:[/bold]")
                for tr in insights["trending_roles"]:
                    arrow = "⬆️" if tr["trend"] == "up" else "⬇️" if tr["trend"] == "down" else "➡️"
                    console.print(f"  {arrow} [cyan]{tr['role']}[/cyan] — {tr['detail']}")
                console.print()

            if insights.get("recruiter_action_items"):
                console.print("[bold]🎯 Action Items for Recruiters:[/bold]")
                for ai_item in insights["recruiter_action_items"]:
                    console.print(f"  ✅ {ai_item}")
                console.print()

        return intel

    def generate_json_report(self, market_id: Optional[str] = None) -> str:
        """Generate a JSON report file."""
        intel = self.analyzer.generate_market_intelligence(market_id=market_id)

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        market_suffix = f"_{market_id}" if market_id else "_all"
        filename = f"jobintel_report_{timestamp}{market_suffix}.json"
        filepath = os.path.join(REPORTS_DIR, filename)

        with open(filepath, "w") as f:
            json.dump(intel, f, indent=2, default=str)

        console.print(f"[green]📄 JSON report saved: {filepath}[/green]")
        return filepath

    def generate_markdown_report(self, market_id: Optional[str] = None) -> str:
        """Generate a Markdown report file."""
        intel = self.analyzer.generate_market_intelligence(market_id=market_id)
        insights = intel.get("ai_insights", {})

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        market_suffix = f"_{market_id}" if market_id else "_all"
        filename = f"jobintel_report_{timestamp}{market_suffix}.md"
        filepath = os.path.join(REPORTS_DIR, filename)

        lines = []
        lines.append(f"# 📊 JobIntel Market Report — {intel['market_name']}")
        lines.append(f"*Generated: {intel['generated_at']}*\n")

        # Stats
        stats = intel["db_stats"]
        lines.append(f"**Database:** {stats['total_jobs']} jobs | {stats['unique_companies']} companies | {stats['with_salary']} with salary data\n")

        # Executive Summary
        if insights.get("executive_summary"):
            lines.append(f"## Executive Summary\n{insights['executive_summary']}\n")

        # Market Overview
        if intel["overview"]:
            lines.append("## 🌍 Market Overview\n")
            lines.append("| Market | Jobs | Companies | Remote % | Avg Salary |")
            lines.append("|--------|------|-----------|----------|------------|")
            for m in intel["overview"]:
                market_name = MARKETS.get(m["market_id"], {}).get("name", m["market_id"])
                avg_sal = f"${m['avg_salary']:,.0f}" if m.get("avg_salary") else "N/A"
                lines.append(f"| {market_name} | {m['total_jobs']} | {m['unique_companies']} | {m.get('remote_pct', 0)}% | {avg_sal} |")
            lines.append("")

        # Scaling Companies
        if intel["scaling_companies"]:
            lines.append("## 🔥 Companies Scaling NOW\n")
            for c in intel["scaling_companies"][:15]:
                market_name = MARKETS.get(c["market_id"], {}).get("name", c["market_id"])
                lines.append(f"- **{c['company']}** ({market_name}) — {c['total_postings']} open roles across: {c['categories']}")
            lines.append("")

        # Salary Stats
        if intel["salary_stats"]:
            lines.append("## 💰 Salary Ranges\n")
            lines.append("| Role | Market | Avg Min | Avg Max | Highest |")
            lines.append("|------|--------|---------|---------|---------|")
            for s in intel["salary_stats"][:20]:
                market_name = MARKETS.get(s["market_id"], {}).get("name", s["market_id"])
                lines.append(f"| {s['search_category']} | {market_name} | ${s.get('avg_min_salary', 0):,.0f} | ${s.get('avg_max_salary', 0):,.0f} | ${s.get('highest_salary', 0):,.0f} |")
            lines.append("")

        # AI Insights
        if insights.get("hot_companies"):
            lines.append("## 🔥 Hot Companies (AI Analysis)\n")
            for hc in insights["hot_companies"]:
                lines.append(f"### {hc['company']}")
                lines.append(f"- **Signal:** {hc['signal']}")
                lines.append(f"- **Opportunity:** {hc['opportunity']}\n")

        if insights.get("recruiter_action_items"):
            lines.append("## 🎯 Recruiter Action Items\n")
            for item in insights["recruiter_action_items"]:
                lines.append(f"- [ ] {item}")
            lines.append("")

        if insights.get("market_predictions"):
            lines.append("## 🔮 Market Predictions\n")
            for pred in insights["market_predictions"]:
                lines.append(f"- {pred}")
            lines.append("")

        with open(filepath, "w") as f:
            f.write("\n".join(lines))

        console.print(f"[green]📝 Markdown report saved: {filepath}[/green]")
        return filepath
