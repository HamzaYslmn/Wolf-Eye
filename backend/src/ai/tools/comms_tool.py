import json
from datetime import datetime, timezone
from modules.database import comms as comms_table


# MARK: send_comms — AI writes tagged messages into the comms channel
def send_comms(tag: str, message: str, recipient: str = "") -> str:
  """
  [ACTION] Send a tagged communication. Sender is always WOLF-EYE.

  Args:
    tag (str): Message category — "civilian", "enemy", "friend", "military"
    message (str): The message content to transmit
    recipient (str): Recipient callsign. Empty means broadcast to ALL.
  """
  body = f"[TO:{recipient or 'ALL'}] {message}" if recipient else message
  doc = {
    'tag': tag,
    'from': 'WOLF-EYE',
    'message': body,
    'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
  }
  comms_table.insert(doc)
  return json.dumps({'status': 'sent', **doc}, ensure_ascii=False)
