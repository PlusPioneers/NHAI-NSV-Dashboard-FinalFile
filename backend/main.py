from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from typing import List, Optional
import pandas as pd
import numpy as np
import io
import json
import os
import aiofiles
import asyncio
from datetime import datetime
from utils import process_nhai_data, determine_severity, validate_coordinates
from video_utils import process_video_async, create_video_data_sync, get_video_info, validate_video_file
from models import VideoFile, video_store

app = FastAPI(title="NHAI NSV Dashboard API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
os.makedirs("uploads/videos", exist_ok=True)
os.makedirs("uploads/data", exist_ok=True)

# Mount static files for video streaming
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Global variable to store processed data
processed_data = []

@app.get("/")
async def root():
    return {"message": "NHAI NSV Dashboard API with Video Sync", "version": "1.0.0"}

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """
    Process uploaded CSV/Excel files and return processed pavement data
    """
    global processed_data
    processed_data = []
    
    try:
        for file in files:
            if file.filename.lower().endswith(('.csv', '.xlsx', '.xls')):
                content = await file.read()
                
                # Save file
                file_path = f"uploads/data/{file.filename}"
                async with aiofiles.open(file_path, 'wb') as f:
                    await f.write(content)
                
                # Process based on file type
                if file.filename.lower().endswith('.csv'):
                    df = pd.read_csv(io.StringIO(content.decode('utf-8')), header=None)
                else:
                    df = pd.read_excel(io.BytesIO(content), header=None)
                
                # Process the data
                file_data = process_nhai_data(df)
                processed_data.extend(file_data)
            else:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Unsupported file format: {file.filename}"
                )
        
        # Add IDs to processed data for video mapping
        for i, item in enumerate(processed_data):
            item['id'] = i
        
        # Generate statistics
        stats = calculate_statistics(processed_data)
        
        return {
            "success": True,
            "message": f"Successfully processed {len(files)} file(s)",
            "data": processed_data,
            "statistics": stats,
            "total_points": len(processed_data)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing files: {str(e)}")

@app.post("/upload-video")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Upload video file and start background processing
    """
    try:
        # Validate file type
        if not file.filename.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
            raise HTTPException(status_code=400, detail="Unsupported video format")
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{file.filename}"
        file_path = f"uploads/videos/{filename}"
        
        # Save video file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Get video info
        video_info = get_video_info(file_path)
        
        # Create video record
        video = VideoFile.create(
            filename=filename,
            filepath=file_path,
            duration=video_info.get('duration', 0),
            fps=video_info.get('fps', 30),
            size_bytes=len(content)
        )
        
        # Add to store
        video_id = video_store.add_video(video)
        
        # Start background processing
        background_tasks.add_task(process_video_background, video_id, file_path)
        
        return {
            "success": True,
            "message": "Video uploaded successfully. Processing started.",
            "video_id": video_id,
            "video_info": video_info
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading video: {str(e)}")

async def process_video_background(video_id: str, video_path: str):
    """
    Background task to process video and create mappings
    """
    try:
        # Update status to processing
        video_store.update_video_status(video_id, "processing")
        
        # Process video to extract GPS data
        result = await process_video_async(video_path, interval_seconds=1.0)
        
        if not result['success']:
            video_store.update_video_status(video_id, "failed", result['error'])
            return
        
        # Store GPS points
        video_store.add_video_gps_points(video_id, result['gps_data'])
        
        # Create mappings with survey data if available
        if processed_data:
            video_gps_data = result['gps_data']
            sync_result = create_video_data_sync(processed_data, video_gps_data)
            
            if sync_result['success']:
                video_store.add_mappings(video_id, sync_result['mappings'])
        
        # Update status to completed
        video_store.update_video_status(video_id, "completed")
        
    except Exception as e:
        video_store.update_video_status(video_id, "failed", str(e))

@app.get("/videos")
async def get_videos():
    """
    Get all uploaded videos with their processing status
    """
    videos = video_store.get_all_videos()
    return {
        "videos": [video.dict() for video in videos],
        "total": len(videos)
    }

@app.get("/videos/{video_id}")
async def get_video(video_id: str):
    """
    Get specific video information
    """
    video = video_store.get_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return video.dict()

@app.get("/videos/{video_id}/gps-data")
async def get_video_gps_data(video_id: str):
    """
    Get GPS data extracted from video
    """
    gps_points = video_store.get_video_gps_points(video_id)
    return {
        "video_id": video_id,
        "gps_points": [point.dict() for point in gps_points],
        "total": len(gps_points)
    }

@app.get("/videos/{video_id}/mappings")
async def get_video_mappings(video_id: str):
    """
    Get survey data to video timestamp mappings
    """
    mappings = video_store.get_mappings(video_id)
    return {
        "video_id": video_id,
        "mappings": [mapping.dict() for mapping in mappings],
        "total": len(mappings)
    }

@app.get("/survey-point/{point_id}/video-timestamp")
async def get_video_timestamp_for_point(point_id: int):
    """
    Get video timestamp for a specific survey point
    """
    mapping = video_store.get_mapping_by_survey_point(point_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="No video mapping found for this survey point")
    
    return {
        "survey_point_id": point_id,
        "video_id": mapping.video_id,
        "video_timestamp": mapping.video_timestamp,
        "distance_meters": mapping.distance_meters,
        "video_gps": {
            "lat": mapping.video_gps_lat,
            "lng": mapping.video_gps_lng
        }
    }

@app.post("/sync-video-data")
async def sync_video_data(video_id: str):
    """
    Manually sync video data with survey data
    """
    try:
        # Get video info
        video = video_store.get_video(video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # Get video GPS data
        video_gps_points = video_store.get_video_gps_points(video_id)
        if not video_gps_points:
            raise HTTPException(status_code=400, detail="No GPS data found for this video")
        
        # Check if survey data is available
        if not processed_data:
            raise HTTPException(status_code=400, detail="No survey data available. Please upload survey data first.")
        
        # Create sync mappings
        video_gps_data = [point.dict() for point in video_gps_points]
        sync_result = create_video_data_sync(processed_data, video_gps_data)
        
        if not sync_result['success']:
            raise HTTPException(status_code=400, detail=f"Sync failed: {sync_result['error']}")
        
        # Clear existing mappings and add new ones
        video_store.clear_mappings(video_id)
        video_store.add_mappings(video_id, sync_result['mappings'])
        
        return {
            "success": True,
            "message": "Video data synchronized successfully",
            "mappings_created": len(sync_result['mappings']),
            "sync_statistics": sync_result.get('statistics', {})
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error syncing video data: {str(e)}")

@app.get("/data")
async def get_data():
    """
    Get all processed survey data
    """
    global processed_data
    if not processed_data:
        return {"data": [], "total": 0}
    
    return {
        "data": processed_data,
        "total": len(processed_data),
        "statistics": calculate_statistics(processed_data)
    }

@app.get("/data/filtered")
async def get_filtered_data(
    severity: Optional[str] = None,
    min_chainage: Optional[float] = None,
    max_chainage: Optional[float] = None,
    road_name: Optional[str] = None
):
    """
    Get filtered survey data based on parameters
    """
    global processed_data
    if not processed_data:
        return {"data": [], "total": 0}
    
    filtered_data = processed_data.copy()
    
    # Apply filters
    if severity:
        filtered_data = [item for item in filtered_data if item.get('severity') == severity]
    
    if min_chainage is not None:
        filtered_data = [item for item in filtered_data if item.get('chainage', 0) >= min_chainage]
    
    if max_chainage is not None:
        filtered_data = [item for item in filtered_data if item.get('chainage', 0) <= max_chainage]
    
    if road_name:
        filtered_data = [item for item in filtered_data if road_name.lower() in item.get('road_name', '').lower()]
    
    return {
        "data": filtered_data,
        "total": len(filtered_data),
        "filters_applied": {
            "severity": severity,
            "min_chainage": min_chainage,
            "max_chainage": max_chainage,
            "road_name": road_name
        },
        "statistics": calculate_statistics(filtered_data)
    }

@app.get("/statistics")
async def get_statistics():
    """
    Get comprehensive statistics about the survey data
    """
    global processed_data
    if not processed_data:
        return {"message": "No data available"}
    
    return calculate_statistics(processed_data)

@app.delete("/videos/{video_id}")
async def delete_video(video_id: str):
    """
    Delete a video and all associated data
    """
    try:
        video = video_store.get_video(video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        # Delete physical file
        if os.path.exists(video.filepath):
            os.remove(video.filepath)
        
        # Remove from store
        video_store.remove_video(video_id)
        
        return {
            "success": True,
            "message": "Video deleted successfully"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting video: {str(e)}")

@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "data_loaded": len(processed_data) > 0,
        "videos_count": len(video_store.get_all_videos())
    }

def calculate_statistics(data):
    """
    Calculate comprehensive statistics from survey data
    """
    if not data:
        return {}
    
    # Basic counts
    total_points = len(data)
    
    # Severity distribution
    severity_counts = {}
    for item in data:
        severity = item.get('severity', 'Unknown')
        severity_counts[severity] = severity_counts.get(severity, 0) + 1
    
    # Chainage statistics
    chainages = [item.get('chainage', 0) for item in data if item.get('chainage') is not None]
    chainage_stats = {}
    if chainages:
        chainage_stats = {
            'min': min(chainages),
            'max': max(chainages),
            'mean': sum(chainages) / len(chainages),
            'range': max(chainages) - min(chainages)
        }
    
    # Road distribution
    road_counts = {}
    for item in data:
        road = item.get('road_name', 'Unknown')
        road_counts[road] = road_counts.get(road, 0) + 1
    
    # Distress type distribution
    distress_counts = {}
    for item in data:
        distress = item.get('distress_type', 'Unknown')
        distress_counts[distress] = distress_counts.get(distress, 0) + 1
    
    return {
        'total_points': total_points,
        'severity_distribution': severity_counts,
        'chainage_statistics': chainage_stats,
        'road_distribution': road_counts,
        'distress_type_distribution': distress_counts,
        'coordinates_available': len([item for item in data if item.get('latitude') and item.get('longitude')])
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)