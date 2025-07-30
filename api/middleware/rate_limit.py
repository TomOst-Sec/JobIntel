"""Token-bucket rate limiting middleware per user tier."""
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
import redis

from api.db.redis import get_redis

# Rate limits: requests per minute by plan
TIER_LIMITS = {
    "Free": 30,
    "Seeker Pro": 60,
    "Recruiter": 120,
    "Pro": 300,
    "Agency": 600,
    "anonymous": 20,
}

# Simple lua script for token bucket in Redis
# KEYS[1] = bucket key
# ARGV[1] = capacity
# ARGV[2] = refill rate per second
# ARGV[3] = current timestamp (seconds)
LUA_TOKEN_BUCKET = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local bucket = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if not tokens or not last_refill then
    tokens = capacity
    last_refill = now
else
    local elapsed = now - last_refill
    tokens = math.min(capacity, tokens + (elapsed * refill_rate))
end

if tokens >= 1 then
    tokens = tokens - 1
    last_refill = now
    redis.call("HMSET", key, "tokens", tokens, "last_refill", last_refill)
    redis.call("EXPIRE", key, 3600)
    return 1
else
    return 0
end
"""

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks and webhooks
        path = request.url.path
        if path in ("/api/v1/health", "/api/v1/webhooks/stripe"):
            return await call_next(request)

        # Identify client
        client_ip = request.client.host if request.client else "unknown"
        key = f"rate_limit:ip:{client_ip}"

        # Try to get plan from JWT (lightweight check)
        tier = "anonymous"
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            try:
                import jwt
                from api.config import get_settings
                settings = get_settings()
                payload = jwt.decode(
                    auth[7:], settings.jwt_secret,
                    algorithms=[settings.jwt_algorithm],
                )
                user_id = payload.get("sub")
                key = f"rate_limit:user:{user_id}"
                role = payload.get("role", "")
                tier = "Recruiter" if role == "recruiter" else "Seeker Pro"
            except Exception:
                pass

        capacity = TIER_LIMITS.get(tier, TIER_LIMITS["anonymous"])
        refill_rate = capacity / 60.0

        try:
            r = get_redis()
            current_time = time.time()
            allowed = r.eval(LUA_TOKEN_BUCKET, 1, key, capacity, refill_rate, current_time)
            
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Please slow down or upgrade your plan."},
                )
        except redis.RedisError as e:
            # If Redis is down, fail open but log it
            import logging
            logging.getLogger(__name__).warning(f"Redis rate limiting failed: {e}")

        return await call_next(request)

