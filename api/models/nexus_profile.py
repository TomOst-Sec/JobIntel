from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class PoWProfileResponse(BaseModel):
    id: int
    user_id: int
    github_username: str
    github_id: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    public_repos: int = 0
    followers: int = 0
    total_stars: int = 0
    total_commits_last_year: int = 0
    top_languages: Optional[str] = None
    skills_extracted: Optional[str] = None
    build_score: Optional[float] = None
    build_score_breakdown: Optional[str] = None
    profile_url: Optional[str] = None
    last_synced_at: Optional[str] = None

class GitHubOAuthCallback(BaseModel):
    code: str
