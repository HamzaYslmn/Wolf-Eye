# MARK:Sync with backend/local/src/middleware/middleware.py
"""FastAPI Middleware - CORS and X-Process-Time header."""
import time
from typing import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

ALLOWED_ORIGINS = ["*"]  # TODO: Restrict in production


def add_middlewares(app: FastAPI) -> None:
    """Configure CORS and timing middleware."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def middleware_check_requests(request: Request, call_next: Callable) -> Response:
        """Measure and log request processing time."""
        start_time = time.perf_counter()
        response = await call_next(request)
        process_time = time.perf_counter() - start_time
        response.headers["X-Process-Time"] = f"{process_time:0.4f}"
        return response
