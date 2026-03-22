import json
from . import _haversine_m, _load_drones


def dispatch_drone(lat: float, lon: float) -> str:
  """
  [ACTION] Send the closest available drone to track a coordinate.

  Args:
    lat (float): Target latitude
    lon (float): Target longitude
  """
  drones = {d['drone']: d['current_location'] for d in _load_drones() if 'current_location' in d}
  if not drones:
    return json.dumps({'error': 'No drones available'})
  closest = min(drones, key=lambda n: _haversine_m(drones[n][0], drones[n][1], lat, lon))
  dist = _haversine_m(drones[closest][0], drones[closest][1], lat, lon)
  return json.dumps({
    'drone': closest,
    'current_location': drones[closest],
    'target': [lat, lon],
    'distance_km': round(dist / 1000, 2),
    'action': 'track',
  })
