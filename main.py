# main.py - Final Optimized YOLO Backend for Indian Road Scenarios
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from ultralytics import YOLO
import cv2
import numpy as np
import base64
from typing import List, Dict
import time
import logging
import torch

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="VISION.AI - YOLO Detection Backend")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load YOLO model with optimizations
MODEL_PATH = "yolo26n.pt"
try:
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    logger.info(f"Using device: {device}")
    
    model = YOLO(MODEL_PATH)
    model.to(device)
    
    # Optimize model
    if hasattr(model, 'fuse'):
        model.fuse()
    
    logger.info(f"Model loaded successfully: {MODEL_PATH}")
    
    # Warm up
    dummy_img = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
    _ = model(dummy_img, verbose=False)
    
except Exception as e:
    logger.error(f"Error loading model: {e}")
    raise RuntimeError("Failed to load YOLO model")

# Optimized colors for better visibility
CLASS_COLORS = {
    "auto": (0, 255, 255),       # Bright Cyan
    "car": (0, 255, 255),        # Bright Cyan
    "autos": (0, 255, 255),      # Bright Cyan
    "two_wheeler": (0, 255, 100),# Bright Green
    "motorcycle": (0, 255, 100), # Bright Green
    "bicycle": (0, 200, 255),    # Sky Blue
    "number_plate": (255, 50, 255), # Bright Pink
    "license_plate": (255, 50, 255),# Bright Pink
    "bus": (255, 255, 50),       # Bright Yellow
    "truck": (255, 180, 50),     # Orange
    "person": (255, 150, 50),    # Light Orange
    "pedestrian": (255, 150, 50),# Light Orange
    "traffic light": (255, 50, 50), # Bright Red
    "stop sign": (255, 50, 50),  # Bright Red
    "traffic sign": (200, 100, 255), # Purple
    "van": (255, 100, 100),      # Coral
    "train": (100, 255, 255),    # Light Cyan
}

def get_class_color(class_name: str):
    """Get bright color for better visibility"""
    return CLASS_COLORS.get(class_name.lower(), (255, 255, 255))

@app.get("/")
async def root():
    return {
        "status": "online",
        "model": MODEL_PATH,
        "device": device,
        "message": "VISION.AI Backend Ready"
    }

@app.post("/detect")
async def detect_objects(
    file: UploadFile = File(...),
    mode: str = "balanced"
):
    """Main detection endpoint"""
    start_time = time.time()
    
    try:
        # Read image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file")
        
        orig_h, orig_w = img.shape[:2]
        logger.info(f"Processing: {file.filename}, Size: {orig_w}x{orig_h}, Mode: {mode}")
        
        # Store original
        original_img = img.copy()
        
        # Convert to RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Mode configurations
        if mode == "speed":
            imgsz = 640
            conf = 0.001
            iou = 0.5
            max_det = 100
        elif mode == "accuracy":
            imgsz = 1280
            conf = 0.001
            iou = 0.4
            max_det = 300
        else:  # balanced
            imgsz = 640
            conf = 0.001
            iou = 0.45
            max_det = 200
        
        # Run inference
        results = model(
            img_rgb,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            max_det=max_det,
            verbose=False
        )
        
        inference_time = time.time() - start_time
        logger.info(f"Inference time: {inference_time:.2f}s")
        
        # Process detections
        detections = []
        for r in results:
            if r.boxes is None:
                continue
                
            boxes = r.boxes
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                class_name = r.names[cls_id]
                
                # Apply confidence filter (25% minimum)
                if conf >= 0.25:
                    detections.append({
                        'bbox': [x1, y1, x2, y2],
                        'confidence': conf,
                        'class_name': class_name
                    })
        
        # Apply NMS
        detections = simple_nms(detections)
        
        logger.info(f"Final detections: {len(detections)}")
        
        # Create annotated image with HIGH QUALITY rendering
        annotated_img = original_img.copy()
        
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            conf = det['confidence']
            class_name = det['class_name']
            
            # Get bright color
            color = get_class_color(class_name)
            
            # HIGH QUALITY BOX - Thicker lines, better resolution
            # Draw outer glow
            for i in range(3, 0, -1):
                glow_color = tuple(max(0, c - i*15) for c in color)
                cv2.rectangle(
                    annotated_img, 
                    (x1-i, y1-i), 
                    (x2+i, y2+i), 
                    glow_color, 
                    2
                )
            
            # Main box - THICKER for better visibility
            box_thickness = max(3, min(6, int(conf * 8)))  # Thicker based on confidence
            cv2.rectangle(
                annotated_img, 
                (x1, y1), 
                (x2, y2), 
                color, 
                box_thickness
            )
            
            # Draw label with HIGH QUALITY
            label = f"{class_name.upper()} {conf:.0%}"
            
            # HIGH RESOLUTION TEXT SETTINGS
            font = cv2.FONT_HERSHEY_DUPLEX
            font_scale = 0.8  # Increased font size
            thickness = 2
            
            # Get text size
            (text_width, text_height), baseline = cv2.getTextSize(
                label, font, font_scale, thickness
            )
            
            # Label background with glow
            label_y = max(y1 - text_height - 10, 0)
            
            # Draw background glow
            for i in range(2, 0, -1):
                cv2.rectangle(
                    annotated_img,
                    (x1-i, label_y-i),
                    (x1 + text_width + 10 + i, y1+i),
                    (0, 0, 0),
                    -1
                )
            
            # Draw main background
            cv2.rectangle(
                annotated_img,
                (x1, label_y),
                (x1 + text_width + 10, y1),
                (0, 0, 0),
                -1
            )
            
            # Draw text with shadow for better readability
            # Shadow
            cv2.putText(
                annotated_img,
                label,
                (x1 + 6, y1 - 6),
                font,
                font_scale,
                (0, 0, 0),
                thickness,
                cv2.LINE_AA
            )
            
            # Main text
            cv2.putText(
                annotated_img,
                label,
                (x1 + 5, y1 - 5),
                font,
                font_scale,
                color,
                thickness,
                cv2.LINE_AA
            )
        
        # HIGH QUALITY JPEG encoding
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, 100]  # MAX QUALITY
        _, buffer = cv2.imencode(".jpg", annotated_img, encode_params)
        annotated_base64 = base64.b64encode(buffer).decode("utf-8")
        
        # Original image
        _, orig_buffer = cv2.imencode(".jpg", original_img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        original_base64 = base64.b64encode(orig_buffer).decode("utf-8")
        
        # Prepare response
        response_data = {
            "detections": [
                [
                    det['bbox'][0],
                    det['bbox'][1],
                    det['bbox'][2],
                    det['bbox'][3],
                    det['confidence'],
                    det['class_name']
                ]
                for det in detections
            ],
            "annotated_image": annotated_base64,
            "original_image": original_base64,
            "stats": {
                "total_detections": len(detections),
                "inference_time": round(inference_time, 3),
                "mode_used": mode,
                "image_size": f"{orig_w}x{orig_h}"
            }
        }
        
        return JSONResponse(content=response_data)
        
    except Exception as e:
        logger.error(f"Detection error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

def simple_nms(detections, iou_threshold=0.45):
    """Simple Non-Max Suppression"""
    if not detections:
        return []
    
    detections.sort(key=lambda x: x['confidence'], reverse=True)
    
    keep = []
    while detections:
        current = detections.pop(0)
        keep.append(current)
        
        detections = [
            det for det in detections 
            if calculate_iou(current['bbox'], det['bbox']) < iou_threshold
        ]
    
    return keep

def calculate_iou(box1, box2):
    """Calculate Intersection over Union"""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    
    inter_area = max(0, x2 - x1) * max(0, y2 - y1)
    box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])
    
    union_area = box1_area + box2_area - inter_area
    
    return inter_area / union_area if union_area > 0 else 0

@app.post("/detect_base64")
async def detect_objects_base64(
    request: dict,
    mode: str = "balanced"
):
    """Endpoint for mode changes with base64 images"""
    start_time = time.time()
    
    try:
        # Get base64 image
        image_base64 = request.get('image', '')
        filename = request.get('filename', 'image.jpg')
        
        if not image_base64:
            raise HTTPException(status_code=400, detail="No image data")
        
        # Decode base64
        image_bytes = base64.b64decode(image_base64)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        orig_h, orig_w = img.shape[:2]
        logger.info(f"Base64 processing: {filename}, Size: {orig_w}x{orig_h}, Mode: {mode}")
        
        # Store original
        original_img = img.copy()
        
        # Convert to RGB
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Mode configurations (same as /detect)
        if mode == "speed":
            imgsz = 640
            conf = 0.001
            iou = 0.5
            max_det = 100
        elif mode == "accuracy":
            imgsz = 1280
            conf = 0.001
            iou = 0.4
            max_det = 300
        else:  # balanced
            imgsz = 640
            conf = 0.001
            iou = 0.45
            max_det = 200
        
        # Run inference
        results = model(
            img_rgb,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            max_det=max_det,
            verbose=False
        )
        
        inference_time = time.time() - start_time
        
        # Process detections
        detections = []
        for r in results:
            if r.boxes is None:
                continue
                
            boxes = r.boxes
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                class_name = r.names[cls_id]
                
                if conf >= 0.25:
                    detections.append({
                        'bbox': [x1, y1, x2, y2],
                        'confidence': conf,
                        'class_name': class_name
                    })
        
        # Apply NMS
        detections = simple_nms(detections)
        
        # Create annotated image with HIGH QUALITY
        annotated_img = original_img.copy()
        
        for det in detections:
            x1, y1, x2, y2 = det['bbox']
            conf = det['confidence']
            class_name = det['class_name']
            
            color = get_class_color(class_name)
            
            # High quality box
            box_thickness = max(3, min(6, int(conf * 8)))
            cv2.rectangle(annotated_img, (x1, y1), (x2, y2), color, box_thickness)
            
            # High quality label
            label = f"{class_name.upper()} {conf:.0%}"
            font = cv2.FONT_HERSHEY_DUPLEX
            font_scale = 0.8
            thickness = 2
            
            (text_width, text_height), _ = cv2.getTextSize(label, font, font_scale, thickness)
            label_y = max(y1 - text_height - 10, 0)
            
            # Background
            cv2.rectangle(
                annotated_img,
                (x1, label_y),
                (x1 + text_width + 10, y1),
                (0, 0, 0),
                -1
            )
            
            # Text
            cv2.putText(
                annotated_img,
                label,
                (x1 + 5, y1 - 5),
                font,
                font_scale,
                color,
                thickness,
                cv2.LINE_AA
            )
        
        # Encode with high quality
        _, buffer = cv2.imencode(".jpg", annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 100])
        annotated_base64 = base64.b64encode(buffer).decode("utf-8")
        
        response_data = {
            "detections": [
                [
                    det['bbox'][0],
                    det['bbox'][1],
                    det['bbox'][2],
                    det['bbox'][3],
                    det['confidence'],
                    det['class_name']
                ]
                for det in detections
            ],
            "annotated_image": annotated_base64,
            "stats": {
                "total_detections": len(detections),
                "inference_time": round(inference_time, 3),
                "mode_used": mode
            }
        }
        
        return JSONResponse(content=response_data)
        
    except Exception as e:
        logger.error(f"Base64 detection error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/model_info")
async def get_model_info():
    """Get model information"""
    try:
        info = {
            "model": MODEL_PATH,
            "device": device,
            "classes": list(model.names.values()) if hasattr(model, 'names') else [],
            "optimized": True,
            "high_quality": "Yes (100% JPEG quality)"
        }
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")