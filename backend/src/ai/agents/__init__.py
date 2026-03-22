import asyncio
from pydantic import BaseModel
from .. import client, MODEL, NUM_CTX, TIMEOUT, log


# MARK: Shared helpers
def _clean(text: str) -> str:
  return text.strip().strip('`').removeprefix('json').strip('`').strip()

def _norm(s: str) -> str:
  return s.lower().replace(' ', '').replace('_', '').replace('-', '').replace('\\', '/')

async def ask(messages: list[dict], schema: type[BaseModel] | None = None, *, think: str | bool = 'low', instruction: str = '') -> str:
  fmt = schema.model_json_schema() if (schema and think) else ('json' if schema else None)
  if instruction:
    messages = [{'role': 'system', 'content': instruction}, *messages]
  try:
    resp = await asyncio.wait_for(
      client.chat(
        model=MODEL,
        messages=messages,
        format=fmt,
        think=think,
        options={'temperature': 0, 'num_ctx': NUM_CTX}),
      timeout=TIMEOUT,
    )
  except TimeoutError:
    log.error('LLM timed out (%ds)', TIMEOUT)
    return '{"error": "Agent timed out"}'
  raw = _clean(resp.message.content or '')
  if not schema:
    return raw
  try:
    return schema.model_validate_json(raw).model_dump_json(indent=2)
  except Exception as e:
    log.error('Validation failed: %s', e)
    return raw


# MARK: Registry
from .cam_agent import analyze_camera
from .sitrep_agent import analyze_sitrep

AGENTS = {'analyze_camera': analyze_camera, 'analyze_sitrep': analyze_sitrep}
for fn in AGENTS.values():
  fn.final = True
