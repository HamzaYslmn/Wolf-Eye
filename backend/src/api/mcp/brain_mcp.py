import httpx

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel, Field

from fastapi_mcp import FastApiMCP
from ai.brain import Brain
from middleware import log

OP_RUN = 'brain_run'

router = APIRouter(prefix='/brain', tags=['Brain MCP'])
_brain = Brain()


class BrainRequest(BaseModel):
  message: str = Field(min_length=1, description='Natural-language request for the AI brain')


@router.post('/chat', operation_id=OP_RUN, summary='Chat with AI Brain')
async def run_brain(payload: BrainRequest) -> dict[str, str]:
  log.info('Brain received message: %s', payload.message)
  return {'result': await _brain.run(payload.message)}


def mount_brain_mcp(app: FastAPI) -> FastApiMCP:
  mcp = FastApiMCP(
    app,
    http_client=httpx.AsyncClient(timeout=20),
    name='Wolf-Eye Brain MCP',
    include_operations=[OP_RUN],
  )
  mcp.mount_http()
  app.state.brain_mcp = mcp
  return mcp
