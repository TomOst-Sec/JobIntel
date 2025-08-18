"""AI-powered analysis of job market data."""
import json
from datetime import datetime
from typing import Optional
from rich.console import Console

from .config import ANTHROPIC_API_KEY, MARKETS
from .database import JobDatabase

console = Console()


class JobAnalyzer:
    """Analyzes job data using Claude for insights."""

    def __init__(self, db: JobDatabase):
        self.db = db
        self._client = None

    @property
    def client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        return self._client

    def generate_market_intelligence(self, market_id: Optional[str] = None) -> dict:
        """Generate comprehensive market intelligence report data."""
        console.print("[bold cyan]🧠 Analyzing market data...[/bold cyan]")

        # Gather all data points
        report_data = {
            "generated_at": datetime.utcnow().isoformat(),
            "market_id": market_id,
            "market_name": MARKETS.get(market_id, {}).get("name", "All Markets") if market_id else "All Markets",
            "overview": self.db.get_market_overview(),
            "scaling_companies": self.db.get_scaling_companies(market_id=market_id, min_postings=3),
            "salary_stats": self.db.get_salary_stats(market_id=market_id),
            "skill_demand": self.db.get_skill_demand(market_id=market_id),
            "db_stats": self.db.get_stats(),
        }

        # Use Claude to generate insights
        insights = self._generate_ai_insights(report_data)
        report_data["ai_insights"] = insights

        return report_data

    def _generate_ai_insights(self, data: dict) -> dict:
        """Use Claude to analyze the data and produce actionable insights."""
        console.print("[dim]  Calling Claude for insights...[/dim]")

        prompt = f"""You are a job market intelligence analyst. Analyze this data and produce actionable insights for recruiting agencies.

DATA:
{json.dumps(data, indent=2, default=str)}

Produce a JSON response with these sections:
{{
    "executive_summary": "2-3 sentence overview of the market right now",
    "hot_companies": [
        {{
            "company": "name",
            "signal": "what they're doing (e.g., 'Posted 12 roles in 3 days across engineering and product')",
            "opportunity": "why a recruiter should care"
        }}
    ],
    "salary_insights": [
        "Key salary finding 1",
        "Key salary finding 2",
        "Key salary finding 3"
    ],
    "trending_roles": [
        {{
            "role": "role name",
            "trend": "up/down/stable",
            "detail": "brief explanation"
        }}
    ],
    "market_predictions": [
        "Prediction 1 based on the data",
        "Prediction 2 based on the data"
    ],
    "recruiter_action_items": [
        "Specific action a recruiter should take this week",
        "Another specific action"
    ]
}}

Be specific and data-driven. No fluff. Recruiters pay for actionable intel, not platitudes.
Return ONLY valid JSON, no markdown."""

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            # Try to parse JSON
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
        except json.JSONDecodeError:
            console.print("[yellow]  Warning: AI response wasn't valid JSON, returning raw text[/yellow]")
            return {"raw_insights": text}
        except Exception as e:
            console.print(f"[red]  AI analysis error: {e}[/red]")
            return {"error": str(e)}

    def detect_signals(self) -> list[dict]:
        """Detect hiring signals across all markets."""
        signals = []

        for market_id, market in MARKETS.items():
            scaling = self.db.get_scaling_companies(market_id=market_id, min_postings=3)

            for company in scaling:
                signal_type = "scaling"
                if company["total_postings"] >= 10:
                    signal_type = "mass_hiring"
                elif company["unique_categories"] >= 3:
                    signal_type = "broad_expansion"

                signal_strength = min(1.0, company["total_postings"] / 20.0)

                signals.append({
                    "company": company["company"],
                    "market_id": market_id,
                    "market_name": market["name"],
                    "signal_type": signal_type,
                    "signal_strength": round(signal_strength, 2),
                    "total_postings": company["total_postings"],
                    "categories": company["categories"],
                    "detail": f"{company['company']} posted {company['total_postings']} jobs across {company['unique_categories']} categories in {market['name']}",
                })

        signals.sort(key=lambda x: x["signal_strength"], reverse=True)
        console.print(f"[green]🚨 Detected {len(signals)} hiring signals[/green]")
        return signals

    def compare_markets(self) -> dict:
        """Compare hiring activity across markets."""
        overview = self.db.get_market_overview()
        salary_by_market = {}

        for market_id in MARKETS:
            salary_by_market[market_id] = self.db.get_salary_stats(market_id=market_id)

        return {
            "overview": overview,
            "salary_comparison": salary_by_market,
        }
