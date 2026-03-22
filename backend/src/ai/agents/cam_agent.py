import json
from base64 import b64encode
from typing import Literal
from pydantic import BaseModel, Field
from .. import log
from . import _norm, ask
from modules.database import cameras as cameras_table, PHOTOS_DIR
from ai import respond


class DetectedObject(BaseModel):
  name: str = Field(description='Object name')
  confidence: float = Field(ge=0.0, le=100.0, description='Detection confidence 0-100')
  description: str = Field(description='Brief object description')

class CamAnalysis(BaseModel):
  source: str = Field(description='Camera image path analyzed')
  summary: str = Field(description='1-2 sentence summary')
  threat_level: Literal[1, 2, 3, 4, 5] = Field(description='5=armed vehicle, 1=safe')
  objects: list[DetectedObject] = Field(default=[], description='Detected objects in frame')


async def analyze_camera(query: str) -> str:
  """
  [AGENT/FINAL] Analyze a camera feed with AI vision. Returns threat assessment + detected objects.

  Args:
    query (string): Camera identifier — "drone1", "drone3", "security_cam1"
  """
  # MARK: Find camera image from TinyDB
  all_cams = cameras_table.all()
  if not all_cams:
    return json.dumps({'error': 'No cameras in database'})
  q = _norm(query)
  found = next((c for c in all_cams if q in _norm(c['name']) or _norm(c['name']) in q), None)
  if not found:
    return json.dumps({'error': f'No camera matching "{query}"', 'available': [c['path'] for c in all_cams]})

  source = found['path']
  image_file = PHOTOS_DIR / source
  if not image_file.is_file():
    return json.dumps({'error': f'Image file missing: {source}'})
  log.info('Analyzing camera: %s', source)

  # MARK: Analyze with LLM
  INST = (
    'Military surveillance analyst. Output ONLY JSON:\n'
    '{"source":"path/to/image","summary":"...","threat_level":1-5,"objects":[{"name":"...","confidence":0-100,"description":"..."}]}\n'
    'threat_level: 5=armed vehicle, 4=armed person, 3=soldier, 2=suspicious, 1=safe.'
  )
  msg = {'role': 'user', 'content': f'Source: {source}\n\nAnalyze this image. Summarize, rate threat 1-5, list objects.'}
  raw_bytes = image_file.read_bytes()
  msg['images'] = [b64encode(raw_bytes).decode()]
  analysis = await ask([msg], CamAnalysis, instruction=INST)

  # MARK: Build standardized response with image attachment
  ext = source.rsplit('.', 1)[-1].lower()
  mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg'}.get(ext, 'image/jpeg')
  b64 = b64encode(raw_bytes).decode()
  try:
    parsed = json.loads(analysis)
    text = f'[{found["name"]}] {parsed.get("summary", "Analysis complete")} — Threat: {parsed.get("threat_level", "?")}/5'
  except Exception:
    text = analysis
  return respond(
    text=text,
    attachments=[{'type': 'image', 'data': f'data:{mime};base64,{b64}', 'label': found['name']}]
  )
