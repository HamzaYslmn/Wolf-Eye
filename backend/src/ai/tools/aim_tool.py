import json
from base64 import b64encode

import cv2

from .. import log
from .data_tool import _fuzzy_cam
from ai import respond
from modules.database import PHOTOS_DIR
from modules.autotarget import AutoTarget

# MARK: Shared AutoTarget instance
_at = AutoTarget()


def aim_at_target(query: str, target: str = "person") -> str:
    """
    [GET/FINAL] Lock onto target using auto-targeting turret. YOLO + PID servo. Result goes directly to user.

    Args:
        query (string): Camera identifier — "drone1", "security_cam1"
        target (string): Object class — "person", "car", "truck", "bus". Default "person".
    """
    # MARK: Find camera from DB (reuses fuzzy match from data_tool)
    found = _fuzzy_cam(query)
    if not found:
        return json.dumps({"error": f'No camera matching "{query}"'})

    image_file = PHOTOS_DIR / found["path"]
    if not image_file.is_file():
        return json.dumps({"error": f"Image file missing: {found['path']}"})

    log.info("Aiming at %s on: %s", target, found["name"])

    # MARK: Run autotarget
    frame = cv2.imread(str(image_file))
    if frame is None:
        return json.dumps({"error": f"Cannot read image: {found['path']}"})

    _at.reset()
    result = _at.process_frame(frame, target_class=target)

    if result.target_bbox is None:
        return respond(text=f'No {target} detected on {found["name"]}')

    # MARK: Encode annotated frame
    _, buf = cv2.imencode(".jpg", result.annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    b64 = b64encode(buf.tobytes()).decode()

    return respond(
        text=f'Locked on {target} — pan:{result.pan:.1f}° tilt:{result.tilt:.1f}° conf:{result.confidence:.0%}',
        attachments=[{'type': 'image', 'data': f'data:image/jpeg;base64,{b64}', 'label': found['name']}]
    )
