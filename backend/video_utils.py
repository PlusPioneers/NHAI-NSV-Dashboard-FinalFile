import cv2
import pytesseract
import numpy as np
import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import json
from geopy.distance import geodesic
import ffmpeg
import os
import asyncio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self, video_path: str):
        self.video_path = video_path
        self.cap = None
        self.fps = None
        self.total_frames = None
        self.duration = None
        self.gps_data = []
        
    def __enter__(self):
        self.cap = cv2.VideoCapture(self.video_path)
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.duration = self.total_frames / self.fps
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.cap:
            self.cap.release()
            
    def extract_gps_from_overlay(self, frame: np.ndarray, timestamp: float) -> Optional[Dict]:
        """
        Extract GPS coordinates from video overlay using OCR
        """
        try:
            # Convert frame to grayscale for better OCR
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Focus on bottom region where GPS info is typically displayed
            height, width = gray.shape
            roi = gray[int(height * 0.7):height, 0:width]
            
            # Enhance text for better OCR
            roi = cv2.resize(roi, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            roi = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
            
            # Extract text using OCR
            text = pytesseract.image_to_string(roi, config='--psm 6')
            
            # Parse GPS coordinates and timestamp from text
            gps_info = self.parse_gps_text(text, timestamp)
            
            return gps_info
            
        except Exception as e:
            logger.error(f"Error extracting GPS from frame at {timestamp}s: {e}")
            return None
    
    def parse_gps_text(self, text: str, video_timestamp: float) -> Optional[Dict]:
        """
        Parse GPS coordinates and timestamp from extracted text
        """
        try:
            # Common patterns for GPS coordinates in video overlays
            patterns = [
                # Pattern 1: LAT: 28.7041° N, LON: 77.1025° E
                r'LAT:\s*([0-9.]+)°?\s*([NS])\s*,?\s*LON:\s*([0-9.]+)°?\s*([EW])',
                # Pattern 2: 28.7041N, 77.1025E
                r'([0-9.]+)([NS])\s*,?\s*([0-9.]+)([EW])',
                # Pattern 3: N28.7041 E77.1025
                r'([NS])([0-9.]+)\s+([EW])([0-9.]+)',
                # Pattern 4: 28.7041, 77.1025
                r'([0-9.]+\.[0-9]+)\s*,\s*([0-9.]+\.[0-9]+)',
            ]
            
            # Time pattern: HH:MM:SS or HH:MM:SS.mmm
            time_pattern = r'(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?'
            
            lat, lng = None, None
            timestamp_str = None
            
            # Try to extract coordinates
            for pattern in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    if len(match.groups()) == 4:
                        if pattern == patterns[0]:  # LAT: xx° N, LON: xx° E
                            lat = float(match.group(1))
                            if match.group(2).upper() == 'S':
                                lat = -lat
                            lng = float(match.group(3))
                            if match.group(4).upper() == 'W':
                                lng = -lng
                        elif pattern == patterns[1]:  # xx.xxN, xx.xxE
                            lat = float(match.group(1))
                            if match.group(2).upper() == 'S':
                                lat = -lat
                            lng = float(match.group(3))
                            if match.group(4).upper() == 'W':
                                lng = -lng
                        elif pattern == patterns[2]:  # Nxx.xx Exx.xx
                            lat = float(match.group(2))
                            if match.group(1).upper() == 'S':
                                lat = -lat
                            lng = float(match.group(4))
                            if match.group(3).upper() == 'W':
                                lng = -lng
                    elif len(match.groups()) == 2:  # Simple lat, lng
                        lat = float(match.group(1))
                        lng = float(match.group(2))
                    break
            
            # Try to extract timestamp
            time_match = re.search(time_pattern, text)
            if time_match:
                hours = int(time_match.group(1))
                minutes = int(time_match.group(2))
                seconds = int(time_match.group(3))
                milliseconds = int(time_match.group(4) or 0)
                
                # Convert to datetime (using today's date as base)
                base_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                timestamp_dt = base_date + timedelta(
                    hours=hours, 
                    minutes=minutes, 
                    seconds=seconds, 
                    milliseconds=milliseconds
                )
                timestamp_str = timestamp_dt.isoformat()
            
            if lat is not None and lng is not None:
                return {
                    'video_timestamp': video_timestamp,
                    'lat': lat,
                    'lng': lng,
                    'extracted_timestamp': timestamp_str,
                    'raw_text': text.strip()
                }
            
        except Exception as e:
            logger.error(f"Error parsing GPS text: {e}")
        
        return None
    
    def process_video_gps(self, interval_seconds: float = 1.0) -> List[Dict]:
        """
        Process entire video to extract GPS coordinates at regular intervals
        """
        gps_data = []
        frame_interval = int(self.fps * interval_seconds)
        
        logger.info(f"Processing video: {self.video_path}")
        logger.info(f"Duration: {self.duration:.2f}s, FPS: {self.fps}, Total frames: {self.total_frames}")
        
        frame_count = 0
        processed_frames = 0
        
        while True:
            ret, frame = self.cap.read()
            if not ret:
                break
                
            # Process frame at intervals
            if frame_count % frame_interval == 0:
                timestamp = frame_count / self.fps
                gps_info = self.extract_gps_from_overlay(frame, timestamp)
                
                if gps_info:
                    gps_data.append(gps_info)
                    processed_frames += 1
                    
                    if processed_frames % 10 == 0:
                        logger.info(f"Processed {processed_frames} frames, current timestamp: {timestamp:.2f}s")
            
            frame_count += 1
        
        logger.info(f"Video processing complete. Extracted {len(gps_data)} GPS points")
        return gps_data

class VideoDataMatcher:
    def __init__(self, survey_data: List[Dict], video_gps_data: List[Dict]):
        self.survey_data = survey_data
        self.video_gps_data = video_gps_data
        self.matches = []
        
    def calculate_distance(self, point1: Tuple[float, float], point2: Tuple[float, float]) -> float:
        """
        Calculate distance between two GPS points using geodesic distance
        """
        return geodesic(point1, point2).meters
    
    def find_closest_video_point(self, survey_point: Dict, max_distance: float = 50.0) -> Optional[Dict]:
        """
        Find the closest video GPS point to a survey data point
        """
        survey_coords = (survey_point['lat'], survey_point['lng'])
        closest_point = None
        min_distance = float('inf')
        
        for video_point in self.video_gps_data:
            video_coords = (video_point['lat'], video_point['lng'])
            distance = self.calculate_distance(survey_coords, video_coords)
            
            if distance < min_distance and distance <= max_distance:
                min_distance = distance
                closest_point = video_point
        
        if closest_point:
            return {
                'video_point': closest_point,
                'distance': min_distance,
                'survey_point': survey_point
            }
        
        return None
    
    def create_data_video_mapping(self, max_distance: float = 50.0) -> List[Dict]:
        """
        Create mapping between survey data points and video timestamps
        """
        mappings = []
        
        logger.info(f"Matching {len(self.survey_data)} survey points with {len(self.video_gps_data)} video points")
        
        for i, survey_point in enumerate(self.survey_data):
            match = self.find_closest_video_point(survey_point, max_distance)
            
            if match:
                mapping = {
                    'survey_point_id': i,
                    'survey_data': survey_point,
                    'video_timestamp': match['video_point']['video_timestamp'],
                    'distance_meters': match['distance'],
                    'video_gps': {
                        'lat': match['video_point']['lat'],
                        'lng': match['video_point']['lng']
                    }
                }
                mappings.append(mapping)
                
                if (i + 1) % 10 == 0:
                    logger.info(f"Processed {i + 1}/{len(self.survey_data)} survey points")
        
        logger.info(f"Created {len(mappings)} data-video mappings")
        return mappings

def get_video_info(video_path: str) -> Dict:
    """
    Get basic video information using ffmpeg
    """
    try:
        probe = ffmpeg.probe(video_path)
        video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
        
        if video_stream:
            return {
                'duration': float(probe['format']['duration']),
                'fps': eval(video_stream['r_frame_rate']),
                'width': int(video_stream['width']),
                'height': int(video_stream['height']),
                'codec': video_stream['codec_name'],
                'size_bytes': int(probe['format']['size'])
            }
    except Exception as e:
        logger.error(f"Error getting video info: {e}")
    
    return {}

def validate_video_file(video_path: str) -> bool:
    """
    Validate if video file is readable and has required format
    """
    try:
        # Check if file exists
        if not os.path.exists(video_path):
            return False
        
        # Check if OpenCV can read the file
        cap = cv2.VideoCapture(video_path)
        ret, frame = cap.read()
        cap.release()
        
        return ret and frame is not None
    except:
        return False

async def process_video_async(video_path: str, interval_seconds: float = 1.0) -> Dict:
    """
    Asynchronously process video to extract GPS data
    """
    try:
        # Validate video file
        if not validate_video_file(video_path):
            raise ValueError("Invalid video file")
        
        # Get video info
        video_info = get_video_info(video_path)
        
        # Process video in a separate thread to avoid blocking
        loop = asyncio.get_event_loop()
        
        def process_video_sync():
            with VideoProcessor(video_path) as processor:
                return processor.process_video_gps(interval_seconds)
        
        gps_data = await loop.run_in_executor(None, process_video_sync)
        
        return {
            'success': True,
            'video_info': video_info,
            'gps_data': gps_data,
            'total_gps_points': len(gps_data)
        }
        
    except Exception as e:
        logger.error(f"Error processing video: {e}")
        return {
            'success': False,
            'error': str(e)
        }

def create_video_data_sync(survey_data: List[Dict], video_gps_data: List[Dict]) -> Dict:
    """
    Create synchronization mapping between survey data and video
    """
    try:
        matcher = VideoDataMatcher(survey_data, video_gps_data)
        mappings = matcher.create_data_video_mapping()
        
        return {
            'success': True,
            'mappings': mappings,
            'total_mappings': len(mappings),
            'match_rate': len(mappings) / len(survey_data) if survey_data else 0
        }
        
    except Exception as e:
        logger.error(f"Error creating video-data sync: {e}")
        return {
            'success': False,
            'error': str(e)
        }