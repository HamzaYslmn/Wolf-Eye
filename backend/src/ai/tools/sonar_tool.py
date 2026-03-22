import json
from . import _haversine_m, _load_drones, _load_humans
from modules.database import humans as humans_table, Q


# MARK: scan_area — find all entities within radius of player, includes tag/color info
def scan_area(radius_m: int = 500) -> str:
  """
  [QUERY] Scan nearby entities around player. Returns type, tag, color, distance for each.

  Args:
    radius_m (int): Search radius in meters (default 500)
  """
  doc = humans_table.search(Q.name == 'player')
  if not doc or 'coord' not in doc[0]:
    return json.dumps({'error': 'player position unknown'})
  pos = doc[0]['coord']

  nearby = []
  # Drones + their objectives
  for d in _load_drones():
    loc = d.get('current_location')
    if loc:
      dist = _haversine_m(pos[0], pos[1], loc[0], loc[1])
      if dist <= radius_m:
        nearby.append({'type': 'drone', 'name': d.get('drone'), 'dist_m': round(dist, 1), 'coord': loc})
    for obj in d.get('objectives', []):
      dist = _haversine_m(pos[0], pos[1], obj['coord'][0], obj['coord'][1])
      if dist <= radius_m:
        nearby.append({'type': 'objective', 'name': obj['name'], 'source': d.get('drone'),
                       'tag': obj.get('tag', ''), 'color': obj.get('color', ''),
                       'dist_m': round(dist, 1), 'coord': obj['coord']})

  # Non-player humans + player objectives
  for h in humans_table.all():
    if h.get('name') == 'player':
      for obj in h.get('objectives', []):
        dist = _haversine_m(pos[0], pos[1], obj['coord'][0], obj['coord'][1])
        if dist <= radius_m:
          nearby.append({'type': 'objective', 'name': obj['name'], 'source': 'player',
                         'tag': obj.get('tag', ''), 'color': obj.get('color', ''),
                         'dist_m': round(dist, 1), 'coord': obj['coord']})
    else:
      loc = h.get('coord')
      if loc:
        dist = _haversine_m(pos[0], pos[1], loc[0], loc[1])
        if dist <= radius_m:
          nearby.append({'type': 'human', 'name': h.get('name'), 'dist_m': round(dist, 1), 'coord': loc})

  nearby.sort(key=lambda x: x['dist_m'])
  return json.dumps({'player_pos': pos, 'radius_m': radius_m, 'nearby': nearby, 'total': len(nearby)}, ensure_ascii=False)
