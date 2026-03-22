"""
MARK: AI module — config, tools, agents, master router
Usage:
  from ai import Master
  master = Master()
  result = await master.run("analyze cameras")
"""

import sys
import json
import logging
from ollama import AsyncClient
from uvicorn.logging import DefaultFormatter

# MARK: Logger
log = logging.getLogger('local.logger')
if not log.handlers:
  log.setLevel(logging.INFO)
  _h = logging.StreamHandler(sys.stderr)
  _h.setFormatter(DefaultFormatter('[AI] %(levelprefix)s %(message)s', use_colors=None))
  log.addHandler(_h)

# MARK: Config
client = AsyncClient()
MODEL = 'qwen3.5:4b'         # 3.3GB VRAM
NUM_CTX = 8192                # 8K context window
TIMEOUT = 60                  # max seconds per agent LLM call


# MARK: Standard response format for FINAL tools/agents
# All final responses follow: { text: str, attachments?: [{type, data, label}] }
# Types: "image" (data:mime;base64,...), "audio", "file"
def respond(text: str, attachments: list[dict] | None = None) -> str:
  resp: dict = {'text': text}
  if attachments:
    resp['attachments'] = attachments
  return json.dumps(resp, ensure_ascii=False)


# MARK: Re-exports
from .tools import TOOLS
from .agents import AGENTS
from .brain import Brain
