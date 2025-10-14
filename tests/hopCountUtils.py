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
    Returns: dict with IP addresses as keys and hop counts as values
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
        return hop_counts
        
    except Exception as e:
        print(f"Error loading hop counts: {e}")
        return {}

def get_hop_count_for_ip(ip_address, hop_counts_dict=None):
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
    Get a summary of current hop count data
    """
    hop_counts = load_hop_counts()
    
    if not hop_counts:
        return "No hop count data available"
    
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
        hop_counts = load_hop_counts()
        if hop_counts:
            test_ip = list(hop_counts.keys())[0]
            hop_count = get_hop_count_for_ip(test_ip)
            print(f"\nTest IP {test_ip} has hop count: {hop_count}")
    else:
        print("Failed to refresh hop counts")