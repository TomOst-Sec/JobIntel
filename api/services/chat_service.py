"""Three-phase LLM conversational search pipeline.

Phase 1: Intent Classification (fast Claude call)
Phase 2: Data Retrieval (SQL against jobintel.db)
Phase 3: Response Synthesis (Claude with data context, streamed)
"""
import json
import sqlite3
from typing import AsyncGenerator

import anthropic

from api.config import get_settings

# Intent → DB method mapping
INTENT_HANDLERS = {
    "market_overview": "_fetch_market_overview",
    "company_intel": "_fetch_company_intel",
    "salary_query": "_fetch_salary_data",
    "skill_demand": "_fetch_skill_demand",
    "job_search": "_fetch_job_search",
    "scaling_companies": "_fetch_scaling_companies",
    "compare_markets": "_fetch_compare_markets",
    "hiring_signals": "_fetch_hiring_signals",
    "cv_match": "_fetch_cv_match_data",
}

INTENT_CLASSIFICATION_PROMPT = """You are an intent classifier for a hiring intelligence platform.
Classify the user's query into one or more intents and extract parameters.

Available intents:
- market_overview: General market stats (params: market_id?)
- company_intel: Info about a specific company (params: company_name)
- salary_query: Salary data for roles/markets (params: role?, market_id?)
- skill_demand: Which skills are in demand (params: market_id?)
- job_search: Find specific jobs (params: query, market_id?, is_remote?)
- scaling_companies: Companies hiring aggressively (params: market_id?, min_postings?)
- compare_markets: Compare different job markets (params: none)
- hiring_signals: Detect hiring trends and signals (params: market_id?)
- cv_match: Match user profile to jobs (params: skills?)

User query: {query}

Return ONLY valid JSON:
{{
    "intents": [
        {{
            "intent": "intent_name",
            "params": {{"key": "value"}}
        }}
    ],
    "summary": "one-line restatement of what user wants"
}}"""

def _build_system_prompt(user_role: str = "seeker") -> str:
    """Build the North Star system prompt customized by user role."""
    role_context = {
        "recruiter": (
            "The user is a RECRUITER. Optimize responses for: talent pipeline insights, "
            "competitive intelligence, compensation benchmarking, market timing, and candidate sourcing strategy. "
            "Frame action items as recruitment plays."
        ),
        "seeker": (
            "The user is a JOB SEEKER. Optimize responses for: opportunity discovery, "
            "salary negotiation leverage, company health assessment, skill gap identification, "
            "and application timing. Frame action items as career moves."
        ),
        "admin": (
            "The user is a PLATFORM ADMIN. Provide full data transparency including "
            "scraper health, data coverage gaps, and system-level insights alongside market intelligence."
        ),
    }

    role_instruction = role_context.get(user_role, role_context["seeker"])

    return f"""You are JobIntel's Senior Hiring Intelligence Analyst — a world-class expert who transforms raw hiring data into actionable intelligence.

ROLE CONTEXT:
{role_instruction}

RESPONSE FRAMEWORK (use this structure for every substantive answer):

1. **Headline Insight** — One bold sentence summarizing the most important finding. Lead with the surprise or the actionable nugget.

2. **Key Numbers** — 3-5 critical data points formatted as a quick-scan list. Always include:
   - Absolute numbers (e.g., "142 open roles")
   - Rates of change (e.g., "up 34% from last month")
   - Comparisons (e.g., "2x the industry average")

3. **Analysis** — 2-3 paragraphs connecting the data to real-world meaning. What story does this data tell? What's the "so what"?

4. **Signals & Anomalies** — Flag anything unusual:
   - Sudden hiring spikes or drops
   - Salary outliers (both high and low)
   - Ghost job patterns
   - Companies behaving differently from peers

5. **Action Items** — 3-5 specific, time-bound recommendations the user can act on TODAY. Every recommendation must be grounded in a specific data point.

RULES:
- Every claim MUST cite a specific number from the provided data. No hand-waving.
- If data is insufficient, say exactly what's missing and what it would take to get a better answer.
- Detect anomalies proactively — what's weird in this data? What doesn't fit the pattern?
- Calibrate confidence: use "high confidence" (large sample, clear trend), "moderate confidence" (decent data, some ambiguity), or "low confidence" (limited data, speculative) labels.
- Never fabricate data. If asked about something not in the data, say so explicitly.
- Format with markdown for readability. Use tables for comparisons, bold for key figures.
- Suggest 2-3 follow-up questions that would deepen the analysis.
- Be opinionated — rank options, call out BS, give your best recommendation. Don't hedge everything."""


class ChatService:
    def __init__(self, db: sqlite3.Connection):
        self.db = db
        self._client = None

    @property
    def client(self) -> anthropic.Anthropic:
        if self._client is None:
            settings = get_settings()
            if not settings.anthropic_api_key:
                raise ValueError("AI chat is not configured — set ANTHROPIC_API_KEY to enable the career coach.")
            self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        return self._client

    def classify_intent(self, query: str) -> dict:
        """Phase 1: Classify user intent with a fast Claude call."""
        response = self.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": INTENT_CLASSIFICATION_PROMPT.format(query=query),
            }],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"intents": [{"intent": "job_search", "params": {"query": query}}], "summary": query}

    def retrieve_data(self, intents: list[dict]) -> dict:
        """Phase 2: Execute data retrieval for each classified intent."""
        results = {}
        for intent_info in intents:
            intent = intent_info["intent"]
            params = intent_info.get("params", {})
            handler_name = INTENT_HANDLERS.get(intent)
            if handler_name:
                handler = getattr(self, handler_name, None)
                if handler:
                    results[intent] = handler(params)
        return results

    async def synthesize_stream(
        self, query: str, data: dict, conversation_history: list[dict],
        user_role: str = "seeker",
    ) -> AsyncGenerator[str, None]:
        """Phase 3: Stream a Claude response grounded in retrieved data."""
        data_context = json.dumps(data, indent=2, default=str)

        messages = []
        for msg in conversation_history[-10:]:  # Last 10 messages for context
            messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({
            "role": "user",
            "content": f"{query}\n\n---\nDATA FROM JOBINTEL DATABASE:\n{data_context}",
        })

        with self.client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=_build_system_prompt(user_role),
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text

    def synthesize_sync(
        self, query: str, data: dict, conversation_history: list[dict],
        user_role: str = "seeker",
    ) -> str:
        """Non-streaming version for quick queries."""
        data_context = json.dumps(data, indent=2, default=str)

        messages = []
        for msg in conversation_history[-10:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({
            "role": "user",
            "content": f"{query}\n\n---\nDATA FROM JOBINTEL DATABASE:\n{data_context}",
        })

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=_build_system_prompt(user_role),
            messages=messages,
        )
        return response.content[0].text

    # --- Data fetchers (Phase 2 handlers) ---

    def _fetch_market_overview(self, params: dict) -> list[dict]:
        sql = """
            SELECT market_id, COUNT(*) as total_jobs,
                COUNT(DISTINCT company) as unique_companies,
                SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) as remote_jobs,
                ROUND(AVG(CASE WHEN salary_min > 0 THEN (salary_min + COALESCE(salary_max, salary_min)) / 2.0 END), 0) as avg_salary
            FROM jobs
        """
        args = []
        if params.get("market_id"):
            sql += " WHERE market_id = ?"
            args.append(params["market_id"])
        sql += " GROUP BY market_id"
        return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def _fetch_company_intel(self, params: dict) -> list[dict]:
        name = params.get("company_name", "")
        rows = self.db.execute("""
            SELECT company, COUNT(*) as total_jobs,
                GROUP_CONCAT(DISTINCT market_id) as markets,
                GROUP_CONCAT(DISTINCT search_category) as categories,
                ROUND(AVG(CASE WHEN salary_min > 0 THEN salary_min END), 0) as avg_salary_min,
                ROUND(AVG(CASE WHEN salary_max > 0 THEN salary_max END), 0) as avg_salary_max,
                MIN(posted_at) as earliest_post, MAX(posted_at) as latest_post
            FROM jobs WHERE company LIKE ?
            GROUP BY company
        """, (f"%{name}%",)).fetchall()
        return [dict(r) for r in rows]

    def _fetch_salary_data(self, params: dict) -> list[dict]:
        sql = """
            SELECT search_category, market_id, COUNT(*) as job_count,
                ROUND(AVG(salary_min), 0) as avg_min,
                ROUND(AVG(salary_max), 0) as avg_max,
                MAX(salary_max) as highest
            FROM jobs WHERE salary_min IS NOT NULL AND salary_min > 0
        """
        args = []
        if params.get("market_id"):
            sql += " AND market_id = ?"
            args.append(params["market_id"])
        if params.get("role"):
            sql += " AND search_category LIKE ?"
            args.append(f"%{params['role']}%")
        sql += " GROUP BY search_category, market_id ORDER BY avg_max DESC"
        return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def _fetch_skill_demand(self, params: dict) -> list[dict]:
        sql = """
            SELECT search_category, market_id, COUNT(*) as demand_count,
                SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) as remote_count,
                ROUND(AVG(CASE WHEN salary_min > 0 THEN salary_min END), 0) as avg_salary
            FROM jobs WHERE posted_at >= datetime('now', '-7 days')
        """
        args = []
        if params.get("market_id"):
            sql += " AND market_id = ?"
            args.append(params["market_id"])
        sql += " GROUP BY search_category, market_id ORDER BY demand_count DESC"
        return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def _fetch_job_search(self, params: dict) -> list[dict]:
        sql = "SELECT job_id, title, company, location, market_id, salary_min, salary_max, posted_at, source FROM jobs WHERE 1=1"
        args = []
        if params.get("query"):
            sql += " AND (title LIKE ? OR description LIKE ?)"
            args.extend([f"%{params['query']}%"] * 2)
        if params.get("market_id"):
            sql += " AND market_id = ?"
            args.append(params["market_id"])
        if params.get("is_remote"):
            sql += " AND is_remote = 1"
        sql += " ORDER BY posted_at DESC LIMIT 20"
        return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def _fetch_scaling_companies(self, params: dict) -> list[dict]:
        sql = """
            SELECT company, market_id, COUNT(*) as total_postings,
                COUNT(DISTINCT search_category) as unique_categories,
                GROUP_CONCAT(DISTINCT search_category) as categories
            FROM jobs WHERE posted_at >= datetime('now', '-7 days')
        """
        args = []
        if params.get("market_id"):
            sql += " AND market_id = ?"
            args.append(params["market_id"])
        min_p = params.get("min_postings", 3)
        sql += f" GROUP BY company, market_id HAVING COUNT(*) >= ? ORDER BY total_postings DESC"
        args.append(min_p)
        return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def _fetch_compare_markets(self, params: dict) -> list[dict]:
        return [dict(r) for r in self.db.execute("""
            SELECT market_id, COUNT(*) as total_jobs,
                COUNT(DISTINCT company) as companies,
                ROUND(AVG(CASE WHEN salary_min > 0 THEN (salary_min + COALESCE(salary_max, salary_min)) / 2.0 END), 0) as avg_salary,
                ROUND(100.0 * SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) / COUNT(*), 1) as remote_pct
            FROM jobs GROUP BY market_id ORDER BY total_jobs DESC
        """).fetchall()]

    def _fetch_hiring_signals(self, params: dict) -> list[dict]:
        sql = """
            SELECT company, market_id, COUNT(*) as postings,
                COUNT(DISTINCT search_category) as breadth,
                GROUP_CONCAT(DISTINCT search_category) as categories,
                CASE
                    WHEN COUNT(*) >= 10 THEN 'mass_hiring'
                    WHEN COUNT(DISTINCT search_category) >= 3 THEN 'broad_expansion'
                    ELSE 'scaling'
                END as signal_type
            FROM jobs WHERE posted_at >= datetime('now', '-7 days')
        """
        args = []
        if params.get("market_id"):
            sql += " AND market_id = ?"
            args.append(params["market_id"])
        sql += " GROUP BY company, market_id HAVING COUNT(*) >= 3 ORDER BY postings DESC LIMIT 20"
        return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def _fetch_cv_match_data(self, params: dict) -> list[dict]:
        skills = params.get("skills", [])
        if not skills:
            return []
        conditions = " OR ".join(["required_skills LIKE ?" for _ in skills])
        args = [f"%{s}%" for s in skills]
        return [dict(r) for r in self.db.execute(f"""
            SELECT job_id, title, company, location, salary_min, salary_max, required_skills
            FROM jobs WHERE {conditions}
            ORDER BY posted_at DESC LIMIT 20
        """, args).fetchall()]
