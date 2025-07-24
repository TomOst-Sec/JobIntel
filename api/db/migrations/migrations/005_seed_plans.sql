-- Seed subscription plans
INSERT OR IGNORE INTO subscription_plans (name, price_cents, chat_limit_daily, market_limit, features) VALUES
    ('Free', 0, 10, 1, '["basic_search"]'),
    ('Seeker Pro', 1900, 50, 3, '["basic_search", "cv_analysis", "alerts", "weekly_email"]'),
    ('Recruiter', 9900, 100, 99, '["basic_search", "cv_analysis", "alerts", "weekly_email", "company_deep_dive", "signals"]'),
    ('Pro', 29900, 500, 99, '["basic_search", "cv_analysis", "alerts", "weekly_email", "company_deep_dive", "signals", "api_access"]'),
    ('Agency', 59900, 99999, 99, '["basic_search", "cv_analysis", "alerts", "weekly_email", "company_deep_dive", "signals", "api_access", "multi_seat", "white_label"]');
