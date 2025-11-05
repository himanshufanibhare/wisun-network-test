"""
Hop Count Utility for Wi-SUN Network Tests
Provides functions to check device connectivity and optimize test execution
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Tuple, Optional

class HopCountManager:
    def __init__(self, hop_counts_file='hop_counts.json'):
        self.hop_counts_file = hop_counts_file
        self.hop_counts_data = None
        self.connected_devices = set()
        self.all_devices = set()
        self.load_hop_counts()
    
    def load_hop_counts(self):
        """Load hop counts from JSON file"""
        try:
            if os.path.exists(self.hop_counts_file):
                with open(self.hop_counts_file, 'r') as f:
                    self.hop_counts_data = json.load(f)
                    if 'hop_counts' in self.hop_counts_data:
                        # Normalize IP addresses to lowercase for consistent comparison
                        self.connected_devices = set(ip.lower() for ip in self.hop_counts_data['hop_counts'].keys())
                        self.all_devices = self.connected_devices.copy()
            else:
                self.hop_counts_data = {"hop_counts": {}, "total_devices": 0}
        except Exception as e:
            print(f"Error loading hop counts: {e}")
            self.hop_counts_data = {"hop_counts": {}, "total_devices": 0}
    
    def is_device_connected(self, ip_address: str) -> bool:
        """Check if a device is currently connected based on hop counts"""
        # Normalize IP address to lowercase for comparison
        ip_normalized = ip_address.lower()
        return ip_normalized in self.connected_devices
    
    def get_hop_count(self, ip_address: str) -> Optional[int]:
        """Get hop count for a specific device"""
        if self.hop_counts_data and 'hop_counts' in self.hop_counts_data:
            # Normalize IP address to lowercase for comparison
            ip_normalized = ip_address.lower()
            return self.hop_counts_data['hop_counts'].get(ip_normalized)
        return None
    
    def get_connected_devices(self) -> List[str]:
        """Get list of all connected devices"""
        return list(self.connected_devices)
    
    def get_all_devices(self) -> List[str]:
        """Get list of all known devices (for display purposes)"""
        return list(self.all_devices)
    
    def add_known_device(self, ip_address: str):
        """Add a device to the known devices list (for display even if not connected)"""
        # Normalize IP address to lowercase
        ip_normalized = ip_address.lower()
        self.all_devices.add(ip_normalized)
    
    def get_device_status(self, ip_address: str) -> Dict:
        """Get comprehensive device status"""
        is_connected = self.is_device_connected(ip_address)
        hop_count = self.get_hop_count(ip_address)
        
        return {
            'ip_address': ip_address,
            'is_connected': is_connected,
            'hop_count': hop_count,
            'status': 'Connected' if is_connected else 'Disconnected',
            'should_test': is_connected  # Only test connected devices
        }
    
    def filter_devices_for_testing(self, device_list: List[str]) -> Tuple[List[str], List[str]]:
        """
        Filter devices into connected (to test) and disconnected (to skip)
        Returns: (devices_to_test, devices_to_skip)
        """
        devices_to_test = []
        devices_to_skip = []
        
        for device in device_list:
            if self.is_device_connected(device):
                devices_to_test.append(device)
            else:
                devices_to_skip.append(device)
        
        return devices_to_test, devices_to_skip
    
    def get_timestamp(self) -> str:
        """Get timestamp of hop counts data"""
        if self.hop_counts_data and 'timestamp' in self.hop_counts_data:
            return self.hop_counts_data['timestamp']
        return datetime.now().isoformat()
    
    def get_total_connected(self) -> int:
        """Get total number of connected devices"""
        return len(self.connected_devices)
    
    def refresh_hop_counts(self):
        """Reload hop counts from file"""
        self.load_hop_counts()

# Global instance for easy access
hop_manager = HopCountManager()

def get_device_connectivity_info(device_list: List[str]) -> Dict:
    """
    Get connectivity information for a list of devices
    """
    hop_manager.refresh_hop_counts()  # Ensure we have latest data
    
    connected_devices = []
    disconnected_devices = []
    device_info = {}
    
    for device in device_list:
        hop_manager.add_known_device(device)  # Add to known devices
        status = hop_manager.get_device_status(device)
        device_info[device] = status
        
        if status['is_connected']:
            connected_devices.append(device)
        else:
            disconnected_devices.append(device)
    
    return {
        'connected_devices': connected_devices,
        'disconnected_devices': disconnected_devices,
        'device_info': device_info,
        'total_connected': len(connected_devices),
        'total_disconnected': len(disconnected_devices),
        'total_devices': len(device_list),
        'hop_counts_timestamp': hop_manager.get_timestamp()
    }

def should_test_device(ip_address: str) -> bool:
    """
    Simple function to check if a device should be tested
    """
    hop_manager.refresh_hop_counts()
    return hop_manager.is_device_connected(ip_address)

def get_device_label_with_status(ip_address: str, base_label: str = None) -> str:
    """
    Get device label with connectivity status
    """
    hop_manager.refresh_hop_counts()
    status = hop_manager.get_device_status(ip_address)
    
    if base_label is None:
        # Extract last part of IP for label
        base_label = ip_address.split("::")[-1][:8]
    
    return base_label