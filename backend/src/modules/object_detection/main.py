"""
YOLO Object Detection
"""

from pathlib import Path

from ultralytics import YOLO

_MODEL_PATH = Path(__file__).resolve().parent / "yolo26s.pt"
model = YOLO(str(_MODEL_PATH))

def run_yolo(source_path: str):
    results = model(source_path)

    # MARK: Process Results
    # Iterate over the results
    for result in results:
        boxes = result.boxes
        
        print("Detected objects:")
        for box in boxes:
            class_id = int(box.cls[0].item())
            class_name = result.names[class_id]
            confidence = box.conf[0].item()
            print(f"- {class_name}: {confidence:.2f}")
        
        # MARK: Save Result
        # Save prediction visualization to disk
        result.save(filename='yolo_result.jpg')
        print("Saved prediction result to 'yolo_result.jpg'")

if __name__ == "__main__":
    # Feel free to change this URL/path to local or other images
    sample_image = "security_cam.png"
    print(f"Running YOLO inference on {sample_image}...")
    run_yolo(sample_image)