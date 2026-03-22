"""Mountain Service - Entry point. Loads .env, mounts routers and static files."""
from dotenv import load_dotenv
load_dotenv("../ENV/.env")  # Load BEFORE any module imports

import importlib
import os
from pathlib import Path

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from starlette.types import Scope

from middleware import middleware
from middleware import log
# MARK: Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown logic."""
    yield


# Create the FastAPI app for AI routes
app = FastAPI(
    title="Wolf-Eye Service",
    description="Service for Wolf-Eye",
    version="1.0.0",
    lifespan=lifespan,
    # redoc_url=os.getenv("REDOC_URL", None),
    # docs_url=os.getenv("DOCS_URL", None),
    # openapi_url=os.getenv("OPENAPI_URL", None),
)

middleware.add_middlewares(app)


# MARK: Auto-discover routes
_MARKER = "from fastapi import APIRouter"
_SRC = Path(__file__).parent

def include_all_routers(directory: str, prefix: str):
    """Import .py files containing 'from fastapi import APIRouter'."""
    api_dir = _SRC / directory
    for py in sorted(api_dir.rglob("*.py")):
        with open(py, "rb") as f:
            if _MARKER not in f.read(512).decode("utf-8", errors="ignore"):
                continue
        module = ".".join(py.relative_to(_SRC).with_suffix("").parts)
        try:
            app.include_router(importlib.import_module(module).router, prefix=prefix)
        except Exception as e:
            log.error(f"Router error {module}: {e}")

include_all_routers("./api/routes", "/api")
include_all_routers("./api/mcp", "/mcp")


# MARK: MCP SSE mount
from api.mcp.brain_mcp import mount_brain_mcp
mount_brain_mcp(app)


# MARK: Static file on root
class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except (HTTPException, Exception):
            return await super().get_response("index.html", scope)

frontend_directory = "../../frontend/dist"
if Path(frontend_directory).exists():
    app.mount("/", SPAStaticFiles(directory=frontend_directory, html=True), name="spa")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("xMain:app", host="localhost", port=8000, reload=False,
                reload_excludes=["*.pyd", "*.so"])
