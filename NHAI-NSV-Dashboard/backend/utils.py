import pandas as pd
import numpy as np
from typing import List, Dict, Any
from datetime import datetime

def process_nhai_data(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Process NHAI specific data format from DataFrame
    """
    processed_data = []
    
    
    if len(df) > 2:
        data_rows = df.iloc[2:]
    else:
        data_rows = df
    
    for index, row in data_rows.iterrows():
        try:
    
            nh_number = str(row.iloc[0]) if pd.notna(row.iloc[0]) else 'N/A'
            start_chainage = str(row.iloc[1]) if pd.notna(row.iloc[1]) else 'N/A'
            end_chainage = str(row.iloc[2]) if pd.notna(row.iloc[2]) else 'N/A'
            length = str(row.iloc[3]) if pd.notna(row.iloc[3]) else 'N/A'
            structure_details = str(row.iloc[4]) if pd.notna(row.iloc[4]) else 'N/A'
            
    
            lane_coordinates = extract_lane_coordinates(row)
            
    
            measurements = extract_measurements(row)
            
    
            for lane_data in lane_coordinates:
                if lane_data['start_lat'] and lane_data['start_lng']:
    
                    for measurement in measurements:
                        lane_value = measurement['values'].get(lane_data['lane'])
                        if lane_value is not None and not pd.isna(lane_value) and lane_value != '':
                            severity = determine_severity(
                                measurement['type'], 
                                float(lane_value), 
                                measurement['limit']
                            )
                            
                            processed_data.append({
                                'lat': float(lane_data['start_lat']),
                                'lng': float(lane_data['start_lng']),
                                'highway': nh_number,
                                'lane': lane_data['lane'],
                                'startChainage': start_chainage,
                                'endChainage': end_chainage,
                                'structure': structure_details,
                                'type': measurement['type'],
                                'value': float(lane_value),
                                'unit': measurement['unit'],
                                'severity': severity,
                                'limit': measurement['limit'],
                                'datetime': datetime.now().isoformat()
                            })
        except Exception as e:
            print(f"Error processing row {index}: {str(e)}")
            continue
    
    return processed_data

def extract_lane_coordinates(row: pd.Series) -> List[Dict[str, Any]]:
    """
    Extract lane coordinates from row data
    """
    lanes = []
    
    
    lane_mapping = [
        {'lane': 'L1', 'start_lat_idx': 5, 'start_lng_idx': 6, 'end_lat_idx': 7, 'end_lng_idx': 8},
        {'lane': 'L2', 'start_lat_idx': 9, 'start_lng_idx': 10, 'end_lat_idx': 11, 'end_lng_idx': 12},
        {'lane': 'L3', 'start_lat_idx': 13, 'start_lng_idx': 14, 'end_lat_idx': 15, 'end_lng_idx': 16},
        {'lane': 'L4', 'start_lat_idx': 17, 'start_lng_idx': 18, 'end_lat_idx': 19, 'end_lng_idx': 20},
        {'lane': 'R1', 'start_lat_idx': 21, 'start_lng_idx': 22, 'end_lat_idx': 23, 'end_lng_idx': 24},
        {'lane': 'R2', 'start_lat_idx': 25, 'start_lng_idx': 26, 'end_lat_idx': 27, 'end_lng_idx': 28},
        {'lane': 'R3', 'start_lat_idx': 29, 'start_lng_idx': 30, 'end_lat_idx': 31, 'end_lng_idx': 32},
        {'lane': 'R4', 'start_lat_idx': 33, 'start_lng_idx': 34, 'end_lat_idx': 35, 'end_lng_idx': 36}
    ]
    
    for mapping in lane_mapping:
        try:
            start_lat = row.iloc[mapping['start_lat_idx']] if len(row) > mapping['start_lat_idx'] else None
            start_lng = row.iloc[mapping['start_lng_idx']] if len(row) > mapping['start_lng_idx'] else None
            end_lat = row.iloc[mapping['end_lat_idx']] if len(row) > mapping['end_lat_idx'] else None
            end_lng = row.iloc[mapping['end_lng_idx']] if len(row) > mapping['end_lng_idx'] else None
            
            if (start_lat is not None and start_lng is not None and 
                not pd.isna(start_lat) and not pd.isna(start_lng) and
                validate_coordinates(float(start_lat), float(start_lng))):
                
                lanes.append({
                    'lane': mapping['lane'],
                    'start_lat': start_lat,
                    'start_lng': start_lng,
                    'end_lat': end_lat,
                    'end_lng': end_lng
                })
        except (ValueError, IndexError):
            continue
    
    return lanes

def extract_measurements(row: pd.Series) -> List[Dict[str, Any]]:
    """
    Extract measurements from row data
    """
    measurements = []
    
    try:
    
        roughness_limit = float(row.iloc[38]) if len(row) > 38 and pd.notna(row.iloc[38]) else 2400
        roughness_values = {}
        for i, lane in enumerate(['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4']):
            idx = 39 + i
            if len(row) > idx and pd.notna(row.iloc[idx]):
                roughness_values[lane] = float(row.iloc[idx])
        
        if roughness_values:
            measurements.append({
                'type': 'Roughness',
                'values': roughness_values,
                'limit': roughness_limit,
                'unit': 'mm/km'
            })
        
    
        rut_depth_limit = float(row.iloc[47]) if len(row) > 47 and pd.notna(row.iloc[47]) else 5
        rut_depth_values = {}
        for i, lane in enumerate(['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4']):
            idx = 48 + i
            if len(row) > idx and pd.notna(row.iloc[idx]):
                rut_depth_values[lane] = float(row.iloc[idx])
        
        if rut_depth_values:
            measurements.append({
                'type': 'Rutting',
                'values': rut_depth_values,
                'limit': rut_depth_limit,
                'unit': 'mm'
            })
        
    
        cracking_limit = float(row.iloc[56]) if len(row) > 56 and pd.notna(row.iloc[56]) else 5
        cracking_values = {}
        for i, lane in enumerate(['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4']):
            idx = 57 + i
            if len(row) > idx and pd.notna(row.iloc[idx]):
                cracking_values[lane] = float(row.iloc[idx])
        
        if cracking_values:
            measurements.append({
                'type': 'Cracking',
                'values': cracking_values,
                'limit': cracking_limit,
                'unit': '% area'
            })
        
    
        ravelling_limit = float(row.iloc[65]) if len(row) > 65 and pd.notna(row.iloc[65]) else 1
        ravelling_values = {}
        for i, lane in enumerate(['L1', 'L2', 'L3', 'L4', 'R1', 'R2', 'R3', 'R4']):
            idx = 66 + i
            if len(row) > idx and pd.notna(row.iloc[idx]):
                ravelling_values[lane] = float(row.iloc[idx])
        
        if ravelling_values:
            measurements.append({
                'type': 'Ravelling',
                'values': ravelling_values,
                'limit': ravelling_limit,
                'unit': '% area'
            })
    
    except Exception as e:
        print(f"Error extracting measurements: {str(e)}")
    
    return measurements

def determine_severity(measurement_type: str, value: float, limit: float) -> str:
    """
    Determine severity based on measurement type and value
    """
    if not value or not limit:
        return 'Low'
    
    ratio = value / limit
    
    if ratio >= 1.5:
        return 'High'
    elif ratio >= 0.8:
        return 'Medium'
    else:
        return 'Low'

def validate_coordinates(lat: float, lng: float) -> bool:
    """
    Validate coordinates
    """
    return (not np.isnan(lat) and not np.isnan(lng) and 
            -90 <= lat <= 90 and -180 <= lng <= 180)

def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate distance between two coordinates using Haversine formula
    """
    from math import radians, cos, sin, asin, sqrt
    
    
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    
    
    dlng = lng2 - lng1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
    c = 2 * asin(sqrt(a))
    
    
    r = 6371
    
    return c * r

def get_severity_color(severity: str) -> str:
    """
    Get color code for severity level
    """
    color_map = {
        'High': '#dc3545',
        'Medium': '#fd7e14',
        'Low': '#28a745'
    }
    return color_map.get(severity, '#6c757d')

def aggregate_data_by_location(data: List[Dict[str, Any]], radius_km: float = 1.0) -> List[Dict[str, Any]]:
    """
    Aggregate data points that are within a specified radius
    """
    aggregated = []
    processed_indices = set()
    
    for i, point in enumerate(data):
        if i in processed_indices:
            continue
        
    
        nearby_points = [point]
        nearby_indices = {i}
        
        for j, other_point in enumerate(data[i+1:], i+1):
            if j in processed_indices:
                continue
            
            distance = calculate_distance(
                point['lat'], point['lng'],
                other_point['lat'], other_point['lng']
            )
            
            if distance <= radius_km:
                nearby_points.append(other_point)
                nearby_indices.add(j)
        
    
        if len(nearby_points) > 1:
    
            severity_order = {'High': 3, 'Medium': 2, 'Low': 1}
            representative = max(nearby_points, key=lambda p: severity_order.get(p['severity'], 0))
            
    
            representative['point_count'] = len(nearby_points)
            representative['aggregated_points'] = nearby_points
            
            aggregated.append(representative)
        else:
            point['point_count'] = 1
            aggregated.append(point)
        
        processed_indices.update(nearby_indices)
    
    return aggregated