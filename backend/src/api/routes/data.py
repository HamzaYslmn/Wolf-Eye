from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel
from modules.database import drones, humans, comms, cameras, Q, PHOTOS_DIR

router = APIRouter(tags=['Data'])

# MARK: GET endpoints — frontend loads all data from here

@router.get('/drones')
def get_drones():
  return drones.all()

@router.get('/humans')
def get_humans():
  return humans.all()

@router.get('/comms')
def get_comms():
  return comms.all()

# MARK: POST /comms — add tagged communication (civilian, enemy, friend, military)
class CommIn(BaseModel):
  tag: str
  message: str
  sender: str | None = None

@router.post('/comms')
def add_comm(body: CommIn):
  from datetime import datetime, timezone
  doc = {
    'tag': body.tag,
    'from': body.sender or body.tag,
    'message': body.message,
    'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
  }
  comms.insert(doc)
  return doc

@router.get('/cameras')
def get_cameras():
  return cameras.all()

@router.get('/photos/{path:path}')
def get_photo(path: str):
  """Serve a photo file from db/photos/ by relative path."""
  file = (PHOTOS_DIR / path).resolve()
  if not file.is_relative_to(PHOTOS_DIR) or not file.is_file():
    return {'error': 'Not found'}
  return FileResponse(file)

# MARK: Player endpoints — player is humans[name='player']

@router.get('/player')
def get_player():
  doc = humans.search(Q.name == 'player')
  return doc[0] if doc else {}

class TargetIn(BaseModel):
  name: str
  coord: list[float]
  tag: str = ''       # objective description (e.g. "enemy vehicle", "airdrop")
  color: str = ''     # fill color hex (red=threat, green=friendly)

class CoordIn(BaseModel):
  coord: list[float]

@router.put('/player/position')
def update_player_position(body: CoordIn):
  """Update player's GPS position."""
  doc = humans.search(Q.name == 'player')
  if not doc:
    return {'error': 'player not found'}
  humans.update({'coord': body.coord}, Q.name == 'player')
  return {'ok': True}

@router.post('/player/targets')
def add_player_target(t: TargetIn):
  """Append a target to player's objectives."""
  doc = humans.search(Q.name == 'player')
  if not doc:
    return {'error': 'player not found'}
  objs = doc[0].get('objectives', [])
  entry: dict = {'name': t.name, 'coord': t.coord}
  if t.tag: entry['tag'] = t.tag
  if t.color: entry['color'] = t.color
  objs.append(entry)
  humans.update({'objectives': objs}, Q.name == 'player')
  return {'ok': True, 'objectives': objs}

@router.delete('/player/targets/{name}')
def remove_player_target(name: str):
  """Remove a target from player's objectives by name."""
  doc = humans.search(Q.name == 'player')
  if not doc:
    return {'error': 'player not found'}
  objs = [o for o in doc[0].get('objectives', []) if o['name'] != name]
  humans.update({'objectives': objs}, Q.name == 'player')
  return {'ok': True, 'objectives': objs}
