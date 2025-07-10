from typing import List, Dict, Optional
from datetime import datetime
from pydantic import BaseModel
import json
import uuid

class VideoFile(BaseModel):
    id: str
    filename: str
    filepath: str
    duration: float
    fps: float
    size_bytes: int
    upload_time: datetime
    processed: bool = False
    processing_status: str = "pending"  # pending, processing, completed, failed
    error_message: Optional[str] = None
    
    @classmethod
    def create(cls, filename: str, filepath: str, duration: float, fps: float, size_bytes: int):
        return cls(
            id=str(uuid.uuid4()),
            filename=filename,
            filepath=filepath,
            duration=duration,
            fps=fps,
            size_bytes=size_bytes,
            upload_time=datetime.now()
        )

class VideoGPSPoint(BaseModel):
    video_id: str
    timestamp: float
    lat: float
    lng: float
    extracted_timestamp: Optional[str] = None
    raw_text: Optional[str] = None
    
class SurveyVideoMapping(BaseModel):
    id: str
    survey_point_id: int
    video_id: str
    video_timestamp: float
    distance_meters: float
    video_gps_lat: float
    video_gps_lng: float
    created_at: datetime
    
    @classmethod
    def create(cls, survey_point_id: int, video_id: str, video_timestamp: float, 
               distance_meters: float, video_gps_lat: float, video_gps_lng: float):
        return cls(
            id=str(uuid.uuid4()),
            survey_point_id=survey_point_id,
            video_id=video_id,
            video_timestamp=video_timestamp,
            distance_meters=distance_meters,
            video_gps_lat=video_gps_lat,
            video_gps_lng=video_gps_lng,
            created_at=datetime.now()
        )

# In-memory storage (replace with database in production)
class VideoDataStore:
    def __init__(self):
        self.videos: Dict[str, VideoFile] = {}
        self.video_gps_points: Dict[str, List[VideoGPSPoint]] = {}
        self.mappings: Dict[str, List[SurveyVideoMapping]] = {}
        
    def add_video(self, video: VideoFile) -> str:
        """Add a video file to the store"""
        self.videos[video.id] = video
        self.video_gps_points[video.id] = []
        return video.id
    
    def get_video(self, video_id: str) -> Optional[VideoFile]:
        """Get video by ID"""
        return self.videos.get(video_id)
    
    def get_all_videos(self) -> List[VideoFile]:
        """Get all videos"""
        return list(self.videos.values())
    
    def update_video_status(self, video_id: str, status: str, error_message: Optional[str] = None):
        """Update video processing status"""
        if video_id in self.videos:
            self.videos[video_id].processing_status = status
            self.videos[video_id].processed = (status == "completed")
            if error_message:
                self.videos[video_id].error_message = error_message
    
    def add_video_gps_points(self, video_id: str, gps_points: List[Dict]):
        """Add GPS points for a video"""
        if video_id not in self.video_gps_points:
            self.video_gps_points[video_id] = []
        
        for point in gps_points:
            gps_point = VideoGPSPoint(
                video_id=video_id,
                timestamp=point['video_timestamp'],
                lat=point['lat'],
                lng=point['lng'],
                extracted_timestamp=point.get('extracted_timestamp'),
                raw_text=point.get('raw_text')
            )
            self.video_gps_points[video_id].append(gps_point)
    
    def get_video_gps_points(self, video_id: str) -> List[VideoGPSPoint]:
        """Get GPS points for a video"""
        return self.video_gps_points.get(video_id, [])
    
    def add_mappings(self, video_id: str, mappings: List[Dict]):
        """Add survey-video mappings"""
        if video_id not in self.mappings:
            self.mappings[video_id] = []
        
        for mapping in mappings:
            survey_mapping = SurveyVideoMapping.create(
                survey_point_id=mapping['survey_point_id'],
                video_id=video_id,
                video_timestamp=mapping['video_timestamp'],
                distance_meters=mapping['distance_meters'],
                video_gps_lat=mapping['video_gps']['lat'],
                video_gps_lng=mapping['video_gps']['lng']
            )
            self.mappings[video_id].append(survey_mapping)
    
    def get_mappings(self, video_id: str) -> List[SurveyVideoMapping]:
        """Get mappings for a video"""
        return self.mappings.get(video_id, [])
    
    def get_mapping_by_survey_point(self, survey_point_id: int) -> Optional[SurveyVideoMapping]:
        """Get mapping by survey point ID"""
        for video_id, mappings in self.mappings.items():
            for mapping in mappings:
                if mapping.survey_point_id == survey_point_id:
                    return mapping
        return None
    
    def clear_all(self):
        """Clear all data"""
        self.videos.clear()
        self.video_gps_points.clear()
        self.mappings.clear()

# Global store instance
video_store = VideoDataStore()