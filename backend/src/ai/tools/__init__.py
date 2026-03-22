import math
from modules.database import drones as drones_table, humans as humans_table


# MARK: Shared helpers
def _haversine_m(lat1, lon1, lat2, lon2) -> float:
  R = 6_371_000.0
  dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
  a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
  return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def _load_drones():
  return drones_table.all()

def _load_humans():
  return humans_table.all()

# MARK: Registry
from .data_tool import query_data, get_camera_feed
from .drone_tool import dispatch_drone
from .sonar_tool import scan_area
from .aim_tool import aim_at_target
from .comms_tool import send_comms

TOOLS = {'query_data': query_data, 'get_camera_feed': get_camera_feed, 'dispatch_drone': dispatch_drone, 'scan_area': scan_area, 'aim_at_target': aim_at_target, 'send_comms': send_comms}

# MARK: Final tools — return result directly to user, skip LLM rewrite
aim_at_target.final = True
get_camera_feed.final = True
