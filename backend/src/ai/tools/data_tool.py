import json
import re
from base64 import b64encode
from typing import Literal
from modules.database import drones, humans, comms, cameras, PHOTOS_DIR


# MARK: Fuzzy camera match — handles "kamera2", "cam2", "drone kamera 1" etc.
def _fuzzy_cam(name: str):
  q = name.lower()
  all_cams = cameras.all()
  # 1. Exact substring
  hit = next((c for c in all_cams if q in c.get('name', '').lower()), None)
  if hit: return hit
  # 2. Extract digits, match any camera containing that number
  digits = re.findall(r'\d+', q)
  if digits:
    for c in all_cams:
      if digits[-1] in c.get('name', ''):
        # Prefer drone cams when query mentions drone/kamera/cam
        if any(k in q for k in ('drone', 'iha', 'hava')):
          if 'drone' in c.get('category', ''):
            return c
        elif any(k in q for k in ('güvenlik', 'security', 'sec')):
          if 'security' in c.get('category', ''):
            return c
    # Fallback: first camera with matching digit
    hit = next((c for c in all_cams if digits[-1] in c.get('name', '')), None)
    if hit: return hit
  return None

def query_data(
    table: Literal["drones", "humans", "comms", "cameras"], 
    name: str = ""
  ) -> str:
  """
  [QUERY] Database lookup. Use for data gathering before answering.

  Args:
    table (str): Table name — "drones", "humans", "comms", "cameras"
    name (str): Optional filter. For drones: drone name. For humans: person name. For comms: callsign. For cameras: camera name. Empty returns summary.
  """
  TABLES = {'drones': drones, 'humans': humans, 'comms': comms, 'cameras': cameras}
  tbl = TABLES.get(table)
  if not tbl:
    return json.dumps({'error': f'Unknown table: {table}', 'available': list(TABLES.keys())})

  if not name:
    return json.dumps({f'{table}_count': len(tbl.all()), 'hint': 'Provide a name to filter'})

  q = name.lower()
  if table == 'drones':
    results = [d for d in tbl.all() if q in d.get('drone', '').lower()]
  elif table == 'humans':
    results = [h for h in tbl.all() if q in h.get('name', '').lower()]
  elif table == 'comms':
    results = [c for c in tbl.all() if q in c.get('from', '').lower() or q in c.get('message', '').lower()]
  elif table == 'cameras':
    # Try fuzzy match for cameras (handles kamera2, cam1 etc.)
    cam = _fuzzy_cam(name)
    results = [cam] if cam else []
  else:
    results = []

  if not results:
    return json.dumps({'error': f'No {table} matching "{name}"'})
  return json.dumps({'source': f'tinydb:{table}', 'results': results}, ensure_ascii=False)


def get_camera_feed(name: str) -> str:
  """
  [GET/FINAL] Retrieve raw camera image as base64. Result goes directly to user.

  Args:
    name (str): Camera name — "drone1", "drone2", "security_cam1"
  """
  from ai import respond
  cam = _fuzzy_cam(name)
  if not cam:
    available = [c['name'] for c in cameras.all()]
    return json.dumps({'error': f'No camera matching "{name}"', 'available': available})

  image_file = PHOTOS_DIR / cam['path']
  if not image_file.is_file():
    return json.dumps({'error': f'Image file missing: {cam["path"]}'})

  ext = cam['path'].rsplit('.', 1)[-1].lower()
  mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg'}.get(ext, 'image/jpeg')
  b64 = b64encode(image_file.read_bytes()).decode()
  return respond(
    text=f'Camera feed: {cam["name"]} ({cam["category"]})',
    attachments=[{'type': 'image', 'data': f'data:{mime};base64,{b64}', 'label': cam['name']}]
  )
