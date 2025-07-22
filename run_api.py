#!/usr/bin/env python3
"""Entry point for JobIntel API server."""
import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        workers=1,  # workers must be 1 when reload=True; concurrency comes from threadpool
    )
