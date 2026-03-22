"""
MARK: Auto-Targeting System
Simulated dual-servo turret (pan/tilt) with YOLO person detection.
Detects targets, draws red bounding boxes, and drives servos to center the target.

Usage:
    at = AutoTarget()                       # uses shared object_detection model
    result = at.process_frame(frame)        # numpy BGR image → TargetResult
    at.reset()                              # reset servos to center (0, 0)

TargetResult fields:
    annotated_frame: np.ndarray   — frame with red bbox + crosshair overlay
    pan:  float                   — current pan  angle (degrees, -90..+90)
    tilt: float                   — current tilt angle (degrees, -90..+90)
    error_x: float                — horizontal offset from center (-1..+1, 0=centered)
    error_y: float                — vertical   offset from center (-1..+1, 0=centered)
    locked: bool                  — True if target is near center (|error| < threshold)
    target_bbox: tuple | None     — (x1, y1, x2, y2) of highest-confidence person, or None
    confidence: float             — detection confidence (0 if no target)
"""
if __name__ == "__main__":
    import sys
    sys.path.append("../../")

from pathlib import Path

import cv2
import numpy as np
from pydantic import BaseModel, ConfigDict, Field, PrivateAttr

from modules.object_detection import model as _yolo_model
# MARK: Defaults
_LOCK_THRESHOLD = 0.04  # |error| below this → "locked"


# MARK: Result model
class TargetResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    annotated_frame: np.ndarray
    pan: float = Field(ge=-90, le=90)
    tilt: float = Field(ge=-90, le=90)
    error_x: float = Field(ge=-1, le=1)
    error_y: float = Field(ge=-1, le=1)
    locked: bool
    target_bbox: tuple[int, int, int, int] | None
    confidence: float = Field(ge=0, le=1)


# MARK: PID controller with dt-based computation
class PID(BaseModel):
    """Proportional-Integral-Derivative controller.

    Args:
        kp: Proportional gain — immediate response to error.
        ki: Integral gain — corrects accumulated steady-state error.
        kd: Derivative gain — dampens oscillation / predicts future error.
        integral_limit: Anti-windup clamp for the integral term.
    """
    kp: float = Field(default=0.5, gt=0, description="Proportional gain")
    ki: float = Field(default=0.02, ge=0, description="Integral gain")
    kd: float = Field(default=0.1, ge=0, description="Derivative gain")
    integral_limit: float = Field(default=10.0, gt=0, description="Anti-windup clamp")
    _integral: float = PrivateAttr(default=0.0)
    _prev_error: float = PrivateAttr(default=0.0)

    def step(self, error: float, dt: float = 1.0) -> float:
        """Compute PID output.

        Args:
            error: Current error signal (e.g. normalized offset -1..+1).
            dt: Time delta since last step (seconds). Default 1.0 for frame-based.
        """
        self._integral += error * dt
        self._integral = max(-self.integral_limit, min(self.integral_limit, self._integral))
        derivative = (error - self._prev_error) / dt if dt > 0 else 0.0
        self._prev_error = error
        return self.kp * error + self.ki * self._integral + self.kd * derivative

    def reset(self) -> None:
        self._integral = 0.0
        self._prev_error = 0.0


# MARK: Simulated servo with inertia
class Servo(BaseModel):
    """Simulated servo motor with speed limit and acceleration.

    Args:
        angle: Current angle (degrees).
        min_angle / max_angle: Mechanical limits.
        max_speed: Maximum angular velocity (degrees/step).
        acceleration: Rate of velocity change (degrees/step²). 0 = instant.
    """
    angle: float = Field(default=0.0, ge=-90, le=90)
    min_angle: float = Field(default=-90.0, ge=-180, le=0)
    max_angle: float = Field(default=90.0, ge=0, le=180)
    max_speed: float = Field(default=5.0, gt=0, description="Max angular velocity (deg/step)")
    acceleration: float = Field(default=2.0, ge=0, description="Velocity ramp (deg/step²). 0=instant")
    _velocity: float = PrivateAttr(default=0.0)

    def move(self, target_delta: float) -> None:
        """Move servo toward target delta with acceleration and speed limit."""
        # MARK: Accelerate toward target velocity
        target_vel = max(-self.max_speed, min(self.max_speed, target_delta))
        if self.acceleration > 0:
            diff = target_vel - self._velocity
            step = min(abs(diff), self.acceleration) * (1 if diff > 0 else -1)
            self._velocity += step
        else:
            self._velocity = target_vel
        self.angle = max(self.min_angle, min(self.max_angle, self.angle + self._velocity))

    def reset(self) -> None:
        self.angle = 0.0
        self._velocity = 0.0


# MARK: AutoTarget main class
class AutoTarget:
    """Simulated auto-targeting turret with person detection.
    Uses the shared object_detection module for YOLO inference.

    Args:
        pid_kp: PID proportional gain.
        pid_ki: PID integral gain.
        pid_kd: PID derivative gain.
        servo_speed: Max servo angular velocity (degrees/step).
        servo_accel: Servo acceleration (degrees/step²). 0 = instant.
        conf_threshold: Minimum detection confidence.
    """

    def __init__(
        self,
        pid_kp: float = 0.5,
        pid_ki: float = 0.02,
        pid_kd: float = 0.1,
        servo_speed: float = 5.0,
        servo_accel: float = 2.0,
        conf_threshold: float = 0.35,
    ):
        self._conf_threshold = conf_threshold

        # MARK: Dual servos (configurable)
        self.pan_servo = Servo(max_speed=servo_speed, acceleration=servo_accel)
        self.tilt_servo = Servo(max_speed=servo_speed, acceleration=servo_accel)

        # MARK: PID controllers (configurable)
        self._pid_x = PID(kp=pid_kp, ki=pid_ki, kd=pid_kd)
        self._pid_y = PID(kp=pid_kp, ki=pid_ki, kd=pid_kd)

    # ── Public API ──────────────────────────────────────────

    def process_frame(self, frame: np.ndarray, target_class: str = "person") -> TargetResult:
        """Run detection + servo update on a single BGR frame."""
        h, w = frame.shape[:2]
        cx, cy = w / 2, h / 2

        # MARK: YOLO inference (shared model)
        results = _yolo_model(frame, verbose=False)
        best_box, best_conf = self._pick_target(results, target_class)

        annotated = frame.copy()
        error_x = error_y = 0.0
        target_cx = target_cy = None  # pixel center of detected target

        if best_box is not None:
            x1, y1, x2, y2 = best_box
            # MARK: Draw red bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 0, 255), 2)
            cv2.putText(annotated, f"{target_class} {best_conf:.0%}",
                        (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

            # MARK: Compute normalized error (-1..+1)
            tx, ty = (x1 + x2) / 2, (y1 + y2) / 2
            target_cx, target_cy = int(tx), int(ty)
            error_x = (tx - cx) / cx   # positive = target right of center
            error_y = (ty - cy) / cy   # positive = target below center

            # MARK: PID → servo movement
            delta_pan = self._pid_x.step(error_x)
            delta_tilt = self._pid_y.step(error_y)
            self.pan_servo.move(delta_pan)
            self.tilt_servo.move(delta_tilt)
        else:
            # No target — hold position, decay PID integral
            self._pid_x.step(0.0)
            self._pid_y.step(0.0)

        locked = abs(error_x) < _LOCK_THRESHOLD and abs(error_y) < _LOCK_THRESHOLD and best_box is not None

        # MARK: Draw crosshair overlay (always)
        self._draw_crosshair(annotated, cx, cy, locked)

        # MARK: Draw aim indicator at target center (red ⊕ + line from crosshair)
        if target_cx is not None:
            self._draw_aim_indicator(annotated, int(cx), int(cy), target_cx, target_cy, locked)

        # MARK: Draw servo HUD
        self._draw_servo_hud(annotated, w, h, locked,
                             self.pan_servo.angle, self.tilt_servo.angle)

        return TargetResult(
            annotated_frame=annotated,
            pan=self.pan_servo.angle,
            tilt=self.tilt_servo.angle,
            error_x=error_x,
            error_y=error_y,
            locked=locked,
            target_bbox=best_box,
            confidence=best_conf,
        )

    def reset(self) -> None:
        """Reset servos and PID to center."""
        self.pan_servo.reset()
        self.tilt_servo.reset()
        self._pid_x.reset()
        self._pid_y.reset()

    # ── Internals ───────────────────────────────────────────

    def _pick_target(self, results, target_class: str) -> tuple[tuple[int, int, int, int] | None, float]:
        """Select highest-confidence detection of given class."""
        best_box = None
        best_conf = 0.0

        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0].item())
                conf = box.conf[0].item()
                name = result.names[cls_id]
                if name == target_class and conf > self._conf_threshold and conf > best_conf:
                    x1, y1, x2, y2 = box.xyxy[0].int().tolist()
                    best_box = (x1, y1, x2, y2)
                    best_conf = conf

        return best_box, best_conf

    @staticmethod
    def _draw_crosshair(frame: np.ndarray, cx: float, cy: float, locked: bool) -> None:
        """Draw center crosshair — green when locked, white otherwise."""
        color = (0, 255, 0) if locked else (255, 255, 255)
        icx, icy = int(cx), int(cy)
        gap = 12
        length = 30
        thickness = 1
        # horizontal lines
        cv2.line(frame, (icx - length, icy), (icx - gap, icy), color, thickness)
        cv2.line(frame, (icx + gap, icy), (icx + length, icy), color, thickness)
        # vertical lines
        cv2.line(frame, (icx, icy - length), (icx, icy - gap), color, thickness)
        cv2.line(frame, (icx, icy + length), (icx, icy + gap), color, thickness)
        # center dot
        cv2.circle(frame, (icx, icy), 2, color, -1)

        if locked:
            cv2.putText(frame, "LOCKED", (icx - 30, icy - length - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

    @staticmethod
    def _draw_aim_indicator(frame: np.ndarray, cx: int, cy: int,
                            tx: int, ty: int, locked: bool) -> None:
        """Draw ⊕ aim indicator at target center + red line from crosshair to target."""
        color = (0, 255, 0) if locked else (0, 0, 255)
        # MARK: Red line from crosshair center to target center
        cv2.line(frame, (cx, cy), (tx, ty), color, 1, cv2.LINE_AA)
        # MARK: ⊕ indicator — circle + X at target center
        r = 16
        cv2.circle(frame, (tx, ty), r, color, 1, cv2.LINE_AA)
        d = int(r * 0.7)
        cv2.line(frame, (tx - d, ty - d), (tx + d, ty + d), color, 1, cv2.LINE_AA)
        cv2.line(frame, (tx - d, ty + d), (tx + d, ty - d), color, 1, cv2.LINE_AA)

    @staticmethod
    def _draw_servo_hud(frame: np.ndarray, w: int, h: int, locked: bool,
                        pan_angle: float = 0.0, tilt_angle: float = 0.0) -> None:
        """Draw servo angle gauges in bottom-left corner."""
        # MARK: Background panel
        panel_w, panel_h = 160, 50
        x0, y0 = 10, h - panel_h - 10
        overlay = frame.copy()
        cv2.rectangle(overlay, (x0, y0), (x0 + panel_w, y0 + panel_h), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

        color = (0, 255, 0) if locked else (200, 200, 200)
        bar_x = x0 + 40
        bar_w = 110
        mid = bar_x + bar_w // 2

        for i, (label, angle) in enumerate([("PAN", pan_angle), ("TILT", tilt_angle)]):
            by = y0 + 10 + i * 20
            cv2.putText(frame, label, (x0 + 5, by + 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
            # background bar
            cv2.rectangle(frame, (bar_x, by), (bar_x + bar_w, by + 8), (40, 40, 40), -1)
            # center tick
            cv2.line(frame, (mid, by), (mid, by + 8), (100, 100, 100), 1)
            # angle indicator (map -90..+90 → 0..bar_w)
            pos = int(bar_x + (angle + 90) / 180 * bar_w)
            pos = max(bar_x, min(bar_x + bar_w, pos))
            cv2.rectangle(frame, (pos - 2, by), (pos + 2, by + 8), color, -1)
            # angle text
            cv2.putText(frame, f"{angle:+.1f}", (bar_x + bar_w + 4, by + 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1)


# MARK: Quick demo (run standalone)
if __name__ == "__main__":
    import sys

    source = sys.argv[1] if len(sys.argv) > 1 else str(
        Path(__file__).resolve().parent.parent / "object_detection" / "security_cam.png"
    )

    at = AutoTarget()
    frame = cv2.imread(source)
    if frame is None:
        print(f"Cannot read: {source}")
        sys.exit(1)

    result = at.process_frame(frame)
    print(f"Pan: {result.pan:.1f}° | Tilt: {result.tilt:.1f}° | "
          f"Error: ({result.error_x:.3f}, {result.error_y:.3f}) | "
          f"Locked: {result.locked} | Conf: {result.confidence:.0%}")

    cv2.imwrite("autotarget_result.jpg", result.annotated_frame)
    print("Saved → autotarget_result.jpg")
