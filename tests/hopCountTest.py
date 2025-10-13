#!/usr/bin/env python3
"""
Hop Count Test - Extract network topology and calculate hop counts
Integrated with Wi-SUN Network Test Framework
"""

import re
import subprocess
import sys
import time
from pprint import pprint
from tests.logger import get_logger

def get_ipv6(string):
    ipv6_pattern = r'(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:)*(?:::)?(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}(?:::)?(?:[0-9a-fA-F]{1,4}:)*(?:[0-9a-fA-F]{1,4})?'
    match = re.search(ipv6_pattern, string)
    if match:
        return match.group(0)
    return None

def generate_pattern(string): 
    return f"(?<={string}: ).*"

def get_properties(input_string: str) -> dict:
    key = re.findall("(\w+)\: ", input_string)
    value = re.findall(generate_pattern("\w"), input_string)
    return dict(zip(key, value))

def get_groups(input_string: str) -> list:
    key = re.findall("(?:GAK|GTK|LGAK|LGTK)\\[\\d\\]", input_string)
    value = re.findall(generate_pattern("\S{3}\[\d\]"), input_string)
    return list(zip(key, value))

def get_tree(input_string: str):
    groups = get_groups(input_string)
    if not groups:
        raise Exception("Cannot get groups")
    
    top, bottom = input_string.split(f"{groups[-1][0]}: {groups[-1][1]}\n")
    bottom_lines = bottom.splitlines()
    border_router = bottom_lines.pop(0)
    parent_list = []
    tree = []
    prev_len = 0
    prev_node = border_router
    parent_list = [border_router]
    for line in bottom_lines:
        if not line.strip():
            continue  
        current_len = len(re.findall("[|]|[`]|[ ]", line))
        current_node = get_ipv6(line)
        if not current_node:
            continue
        
        while len(parent_list) > current_len // 4:  
            parent_list.pop()
            
        if parent_list:
            tree.append([parent_list[-1], current_node])
        if '`-' not in line:
            parent_list.append(current_node)
        prev_len = current_len
        prev_node = current_node   
    return tree

def compute_hop_counts(tree_edges, root_node):
    """
    Compute hop count (distance) from root node to all other nodes in the tree.
    
    Args:
        tree_edges: List of [parent, child] relationships
        root_node: The border router node (starting point, hop count 0)
    
    Returns:
        Dictionary mapping each node to its hop count from root
    """
    from collections import deque
    
    # Build adjacency list from tree edges
    children = {}
    all_nodes = set()
    
    for parent, child in tree_edges:
        if parent not in children:
            children[parent] = []
        children[parent].append(child)
        all_nodes.add(parent)
        all_nodes.add(child)
    
    # BFS to calculate hop counts
    hop_counts = {}
    queue = deque([(root_node, 0)])  # (node, hop_count)
    hop_counts[root_node] = 0
    
    while queue:
        current_node, current_hops = queue.popleft()
        
        # Process all children of current node
        for child in children.get(current_node, []):
            if child not in hop_counts:
                hop_counts[child] = current_hops + 1
                queue.append((child, current_hops + 1))
    
    return hop_counts

def get_dodac_properties(output_string: str) -> dict:
    meta_data = get_properties(output_string)
    tree = get_tree(output_string)
    
    # Find the root node (border router) - first node that appears as parent
    root_node = None
    if tree:
        root_node = tree[0][0]  # First parent in the tree
    
    # Calculate hop counts
    hop_counts = {}
    if root_node:
        hop_counts = compute_hop_counts(tree, root_node)
    
    return {**meta_data, "tree": tree, "hop_counts": hop_counts, "root_node": root_node}

def run_command(command, timeout=30, stop_callback=None):
    """Run a shell command and return its output with stop callback support"""
    try:
        proc = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        output = ''
        
        # Loop and periodically check stop_callback
        while True:
            try:
                out, err = proc.communicate(timeout=1)
                output += out or ''
                break
            except subprocess.TimeoutExpired:
                # Command still running; check stop flag
                if stop_callback and stop_callback():
                    # terminate process and return None
                    try:
                        proc.terminate()
                        proc.communicate(timeout=2)
                    except Exception:
                        try:
                            proc.kill()
                        except Exception:
                            pass
                    return None
                # otherwise continue waiting
                
        if proc.returncode == 0:
            return output
        else:
            return None
    except Exception as e:
        return None

# Global cache for hop counts to avoid repeated network topology queries
_hop_count_cache = {}
_cache_timestamp = 0
_cache_ttl = 300  # Cache for 5 minutes

def get_network_hop_counts(stop_callback=None, timeout=30):
    """
    Get hop counts for all nodes in the network by querying Wi-SUN border router
    Returns dictionary mapping IPv6 addresses to their hop counts
    """
    global _hop_count_cache, _cache_timestamp
    
    # Check cache validity
    current_time = time.time()
    if _hop_count_cache and (current_time - _cache_timestamp) < _cache_ttl:
        return _hop_count_cache
    
    # Default command to get network topology
    command = "wsbrd_cli status"
    
    try:
        command_output = run_command(command, timeout, stop_callback)
        
        if not command_output or not command_output.strip():
            return {}
        
        result = get_dodac_properties(command_output)
        
        if result.get('hop_counts'):
            _hop_count_cache = result['hop_counts']
            _cache_timestamp = current_time
            return _hop_count_cache
        else:
            return {}
            
    except Exception as e:
        return {}

def get_hop_count_for_ip(ip_address, stop_callback=None):
    """
    Get hop count for a specific IP address
    Returns hop count as integer, or '-' if not found
    """
    hop_counts = get_network_hop_counts(stop_callback)
    return hop_counts.get(ip_address, '-')

def clear_hop_count_cache():
    """Clear the hop count cache to force refresh"""
    global _hop_count_cache, _cache_timestamp
    _hop_count_cache = {}
    _cache_timestamp = 0

def pretty_print_hop_counts(hop_counts, root_node):
    """Print hop counts in a nice formatted way"""
    print(f"\nHop Counts from Border Router ({root_node}):")
    print("=" * 60)
    
    # Sort by hop count, then by node name
    sorted_hops = sorted(hop_counts.items(), key=lambda x: (x[1], x[0]))
    
    for node, hops in sorted_hops:
        print(f"Hop {hops:2d}: {node}")

def fetch_hop_counts_for_all(log_file=None, progress_callback=None, stop_callback=None, timeout_val=30, pause_callback=None):
    """
    Fetch hop counts for all devices in the network
    This function follows the same pattern as other tests for consistency
    """
    from tests.ip import FAN11_FSK_IPV6
    
    logger = get_logger("hop_count_test", log_file)
    logger.info(f"=== HOP COUNT TEST STARTED ({len(FAN11_FSK_IPV6)} devices) ===")

    success, fail = 0, 0
    total_devices = len(FAN11_FSK_IPV6)
    current_device = 0

    # Get all hop counts at once
    hop_counts = get_network_hop_counts(stop_callback, timeout_val)
    
    for device_name, ip in FAN11_FSK_IPV6.items():
        if stop_callback and stop_callback():
            logger.info("Test stopped by user")
            break
            
        # Handle pause functionality
        if pause_callback:
            while pause_callback():
                logger.info("Test paused, waiting...")
                time.sleep(1)
                if stop_callback and stop_callback():
                    logger.info("Test stopped while paused")
                    return success, fail
            
        current_device += 1
        hop_count = hop_counts.get(ip, '-')
        
        if hop_count != '-':
            status = "FOUND ✅"
            success += 1
            connection_status = "Success"
        else:
            status = "NOT FOUND ❌"
            hop_count = "Unknown"
            fail += 1
            connection_status = "Failed"

        logger.info(f"Device: {device_name} | IP: {ip} | Hop Count: {hop_count} | Status: {status}")
        logger.info("-" * 50)
        
        # Prepare device result for frontend display
        if progress_callback:
            device_result = {
                'ip': ip,
                'label': device_name,
                'hop_count': str(hop_count),
                'status': status,
                'connection_status': connection_status
            }
            progress_callback(current_device, total_devices, f"Analyzing {device_name}", device_result)

    total = len(FAN11_FSK_IPV6)
    summary = f"SUMMARY: {success}/{total} devices found in topology ({(success/total)*100:.1f}% success rate)"
    logger.info(summary)
    logger.info("=== HOP COUNT TEST COMPLETED ===")
    return success, fail

if __name__ == "__main__":
    # Default command to run
    DEFAULT_COMMAND = "wsbrd_cli status"
    
    print(f"Running command: '{DEFAULT_COMMAND}'")
    command_output = run_command(DEFAULT_COMMAND)
    
    if not command_output or not command_output.strip():
        print("No output received. Please check your command.")
        sys.exit(1)
    
    print("Parsing network topology...")
    
    try:
        result = get_dodac_properties(command_output)
        
        print("\nNetwork Properties:")
        pprint({k: v for k, v in result.items() if k not in ['tree', 'hop_counts', 'root_node']})
        
        print(f"\nTree Structure ({len(result['tree'])} connections):")
        pprint(result['tree'])
        
        if result['hop_counts']:
            pretty_print_hop_counts(result['hop_counts'], result['root_node'])
        else:
            print("No hop counts calculated - check if tree parsing was successful.")
            
    except Exception as e:
        print(f"Error parsing command output: {e}")
        print("\nRaw command output:")
        print(command_output)
        sys.exit(1)