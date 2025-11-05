#!/usr/bin/env python3
"""
Hop Count Utilities
Functions to fetch and manage hop count data for network tests
"""

import json
import os
import subprocess
import time
from datetime import datetime
from tests.hopCountTest import get_dodac_properties, run_command

HOP_COUNT_FILE = "hop_counts.json"

def fetch_hop_counts(timeout=30):
    """
    Fetch current hop counts from the network and return as dictionary
    Returns: dict with IP addresses as keys and hop counts as values
    """
    try:
        # Run the wsbrd_cli status command
        command_output = run_command("wsbrd_cli status", timeout=timeout)
        
        if not command_output or not command_output.strip():
            print("No output received from wsbrd_cli status command")
            return {}
        
        # Parse the network topology
        result = get_dodac_properties(command_output, debug=False)
        
        # Extract hop counts dictionary
        hop_counts = result.get('hop_counts', {})
        
        print(f"Successfully fetched hop counts for {len(hop_counts)} devices")
        return hop_counts
        
    except Exception as e:
        print(f"Error fetching hop counts: {e}")
        return {}

def save_hop_counts(hop_counts, file_path=None):
    """
    Save hop counts to a JSON file with timestamp
    """
    if file_path is None:
        file_path = os.path.join(os.path.dirname(__file__), '..', HOP_COUNT_FILE)
    
    try:
        data = {
            'timestamp': datetime.now().isoformat(),
            'hop_counts': hop_counts,
            'total_devices': len(hop_counts)
        }
        
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"Hop counts saved to {file_path}")
        return True
        
    except Exception as e:
        print(f"Error saving hop counts: {e}")
        return False

def load_hop_counts(file_path=None):
    """
    Load hop counts from JSON file
    Returns: dict with full data structure including 'hop_counts' and 'timestamp'
    """
    if file_path is None:
        file_path = os.path.join(os.path.dirname(__file__), '..', HOP_COUNT_FILE)
    
    try:
        if not os.path.exists(file_path):
            print(f"Hop count file not found: {file_path}")
            return {}
        
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        hop_counts = data.get('hop_counts', {})
        timestamp = data.get('timestamp', 'Unknown')
        
        print(f"Loaded hop counts for {len(hop_counts)} devices (updated: {timestamp})")
        return data  # Return full data structure instead of just hop_counts
        
    except Exception as e:
        print(f"Error loading hop counts: {e}")
        return {}

def get_hop_count_for_ip(ip, hop_counts_data=None):
    """
    Get hop count for a specific IP address
    Args:
        ip: IP address to look up
        hop_counts_data: Optional pre-loaded hop counts data. If None, will load from file.
    Returns: int hop count or -1 if not found
    """
    if hop_counts_data is None:
        hop_counts_data = load_hop_counts()
    
    # Handle different data formats
    if isinstance(hop_counts_data, dict):
        if 'hop_counts' in hop_counts_data:
            # New format with metadata - case insensitive lookup
            hop_counts = hop_counts_data['hop_counts']
            # Try exact match first
            if ip in hop_counts:
                return hop_counts[ip]
            # Try case insensitive match
            ip_lower = ip.lower()
            for stored_ip, hop_count in hop_counts.items():
                if stored_ip.lower() == ip_lower:
                    return hop_count
            return -1
        else:
            # Old format - direct IP to hop count mapping
            if ip in hop_counts_data:
                return hop_counts_data[ip]
            # Try case insensitive match
            ip_lower = ip.lower()
            for stored_ip, hop_count in hop_counts_data.items():
                if stored_ip.lower() == ip_lower:
                    return hop_count
            return -1
    
    return -1

def should_skip_device(ip, hop_counts_data=None):
    """
    Check if a device should be skipped based on hop_counts.json
    Args:
        ip: IP address to check
        hop_counts_data: Optional pre-loaded hop counts data. If None, will load from file.
    Returns: True if device should be skipped, False otherwise
    """
    if hop_counts_data is None:
        hop_counts_data = load_hop_counts()
    
    # If no hop counts data available, don't skip any devices
    if not hop_counts_data:
        return False
    
    # Handle different data formats
    if isinstance(hop_counts_data, dict):
        if 'hop_counts' in hop_counts_data:
            # New format with metadata - case insensitive check
            hop_counts = hop_counts_data['hop_counts']
            # Try exact match first
            if ip in hop_counts:
                return False
            # Try case insensitive match
            ip_lower = ip.lower()
            for stored_ip in hop_counts.keys():
                if stored_ip.lower() == ip_lower:
                    return False
            return True  # Skip if not found
        else:
            # Old format - direct IP to hop count mapping
            if ip in hop_counts_data:
                return False
            # Try case insensitive match
            ip_lower = ip.lower()
            for stored_ip in hop_counts_data.keys():
                if stored_ip.lower() == ip_lower:
                    return False
            return True  # Skip if not found
    
    return False

def create_skipped_result(test_type, ip, device_name, hop_count=None):
    """
    Create a standardized result object for skipped devices
    Args:
        test_type: Type of test (ping, rssi, rpl, etc.)
        ip: IP address of the device
        device_name: Label/name of the device
        hop_count: Hop count if available, otherwise -1
    Returns: dict with standardized skipped result format
    """
    base_result = {
        'ip': ip,
        'label': device_name,
        'device_label': device_name,
        'hop_count': hop_count if hop_count is not None else -1,
        'connection_status': 'Skipped',
        'status': 'Skipped'
    }
    
    if test_type == 'ping':
        base_result.update({
            'packets_transmitted': 0,
            'packets_received': 0,
            'packets_tx': 0,
            'packets_rx': 0,
            'packet_loss': 0.0,
            'loss_percent': 0.0,
            'min_rtt': 0.0,
            'max_rtt': 0.0,
            'avg_rtt': 0.0,
            'mdev': 0.0,
            'min_time': '-',
            'max_time': '-',
            'avg_time': '-',
            'mdev_time': '-'
        })
    elif test_type in ['rssi', 'rssl']:
        base_result.update({
            'rsl_in': '-',
            'rsl_out': '-',
            'signal_quality': 'Skipped',
            'response_time': '-',
            'link_status': 'Skipped'
        })
    elif test_type == 'rpl':
        base_result.update({
            'rank': '-',
            'rpl_rank': '-'
        })
    elif test_type == 'disconnections':
        base_result.update({
            'disconnected_total': 0,
            'disconnections_count': 0
        })
    elif test_type == 'availability':
        base_result.update({
            'availability_status': 'Skipped',
            'available': False
        })
    
    return base_result
    """
    Get hop count for a specific IP address
    Returns: hop count as integer or '-' if not found
    """
    if hop_counts_dict is None:
        hop_counts_dict = load_hop_counts()
    
    # Normalize IP address to lowercase for comparison
    normalized_ip = ip_address.lower()
    
    # Try exact match first
    if normalized_ip in hop_counts_dict:
        return hop_counts_dict[normalized_ip]
    
    # Try to find partial match (in case of different IPv6 formats)
    for stored_ip, hop_count in hop_counts_dict.items():
        if normalized_ip in stored_ip.lower() or stored_ip.lower() in normalized_ip:
            return hop_count
    
    return '-'

def refresh_hop_counts():
    """
    Fetch fresh hop counts and save them
    Returns: True if successful, False otherwise
    """
    print("Refreshing hop counts...")
    hop_counts = fetch_hop_counts()
    
    if hop_counts:
        return save_hop_counts(hop_counts)
    else:
        print("Failed to fetch hop counts")
        return False

def get_hop_count_summary():
    """
    Get a summary of hop count distribution
    Returns: String with hop count statistics
    """
    hop_counts_data = load_hop_counts()
    
    if not hop_counts_data:
        return "No hop count data available"
    
    # Extract hop counts from the data structure
    hop_counts = hop_counts_data.get('hop_counts', {}) if isinstance(hop_counts_data, dict) else hop_counts_data
    
    # Count devices by hop level
    hop_levels = {}
    for ip, hop_count in hop_counts.items():
        if isinstance(hop_count, int):
            hop_levels[hop_count] = hop_levels.get(hop_count, 0) + 1
    
    summary_lines = [f"Total devices: {len(hop_counts)}"]
    for hop_level in sorted(hop_levels.keys()):
        summary_lines.append(f"Hop {hop_level}: {hop_levels[hop_level]} devices")
    
    return "\n".join(summary_lines)

if __name__ == "__main__":
    # Test the hop count utilities
    print("Testing hop count utilities...")
    
    # Fetch and save hop counts
    if refresh_hop_counts():
        print("\nHop count summary:")
        print(get_hop_count_summary())
        
        # Test getting hop count for specific IP
        hop_counts_data = load_hop_counts()
        if hop_counts_data and 'hop_counts' in hop_counts_data:
            hop_counts = hop_counts_data['hop_counts']
            test_ip = list(hop_counts.keys())[0]
            hop_count = get_hop_count_for_ip(test_ip, hop_counts_data)
            print(f"\nTest IP {test_ip} has hop count: {hop_count}")
    else:
        print("Failed to refresh hop counts")