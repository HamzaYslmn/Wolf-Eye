import json
from typing import Literal
from pydantic import BaseModel, Field
from .. import log
from . import ask
from modules.database import comms as comms_table
from ai import respond


class ThreatEntry(BaseModel):
  code: str = Field(description='e.g. CONTACT, IED, AMBUSH')
  location: str = Field(description='Location name or area')
  coordinates: list[float] = Field(description='[lat, lon] or empty')
  severity: Literal[1, 2, 3, 4, 5] = Field(description='5=active combat, 1=routine')
  description: str = Field(description='Brief threat description')

class SitrepAnalysis(BaseModel):
  source: str = Field(default='tinydb:comms', description='Data source')
  summary: str = Field(description='1-3 sentence intel summary')
  threat_level: Literal[1, 2, 3, 4, 5] = Field(description='5=critical, 1=low')
  threats: list[ThreatEntry] = Field(description='Identified threat entries')
  recommended_action: str = Field(description='Suggested course of action')


def _format_comms(entries: list[dict]) -> str:
  return '\n'.join(
    f"[{c.get('timestamp', '')}] {c.get('from', '?')}: {c.get('message', '')}"
    for c in entries if isinstance(c, dict)
  ) or '(no valid comms)'


async def analyze_sitrep(message: str) -> str:
  """
  [AGENT/FINAL] Analyze field communications for threats and intel.

  Args:
    message (string): Natural language query — "any active threats?", "tehdit var mı?"
  """
  entries = comms_table.all()
  if not entries:
    return json.dumps({'error': 'No comms data found'})

  INST = (
    'Military intel analyst. Output ONLY JSON:\n'
    '{"summary":"...","threat_level":1-5,"threats":[{"code":"...","location":"...","coordinates":[lat,lon],"severity":1-5,"description":"..."}],"recommended_action":"..."}'
  )
  analysis = await ask([{'role': 'user', 'content': f'Comms Log:\n{_format_comms(entries)}\n\nQuery:\n{message}'}], SitrepAnalysis, think=False, instruction=INST)

  # MARK: Standardized response
  try:
    parsed = json.loads(analysis)
    text = f'SITREP — Threat: {parsed.get("threat_level", "?")}/5 — {parsed.get("summary", "")}'
  except Exception:
    text = analysis
  return respond(text=text)
