#!/bin/bash
# Daily scrape — run via cron or launchd
cd /Users/talperez/clawd/jobintel
source venv/bin/activate

echo "$(date): Starting daily scrape..."

# Free sources first (no rate limits)
python run.py scrape --source free

# JSearch (use sparingly — 500/mo limit, ~60/day budget)
python run.py scrape --source jsearch --date-posted today

echo "$(date): Daily scrape complete."
python run.py stats
