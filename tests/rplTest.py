#!/usr/bin/env python3
"""
CoAP RPL Rank Fetcher
Fetches 'rpl_rank' from a CoAP endpoint and logs results
"""

import subprocess
import json
import time
from tests.logger import get_logger
from tests.ip import FAN11_FSK_IPV6
from tests.hopCountUtils import get_hop_count_for_ip, should_skip_device, create_skipped_result, load_hop_counts

def get_rpl_rank(ip, timeout=100, stop_callback=None):
    """
    Run coap-client-notls to fetch JSON and extract rpl_rank.
    Returns rpl_rank int or None if failed.
    Now supports stop_callback for early termination.
    """
    cmd = [
        "coap-client-notls",
        "-m", "post",
        "-N",           # Non-confirmable
        "-B", str(timeout),
        "-t", "text",
        f"coap://[{ip}]:5683/om2m"
    ]

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        output = ''
        
        # Loop and periodically check stop_callback
        while True:
            try:
                out, err = proc.communicate(timeout=1)
                output += out or ''
                break
            except subprocess.TimeoutExpired:
                # CoAP command still running; check stop flag
                if stop_callback and stop_callback():
                    # terminate process and return None
                    try:
                        proc.terminate()
                        try:
                            proc.communicate(timeout=2)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                            proc.communicate(timeout=1)
                    except Exception as e:
                        # Process cleanup failed, but continue
                        pass
                    return None
                # otherwise continue waiting
            except Exception as e:
                # Unexpected error in communicate, terminate and return None
                try:
                    if proc.poll() is None:  # Process still running
                        proc.terminate()
                        proc.communicate(timeout=2)
                except Exception:
                    pass
                return None

        if proc.returncode != 0 or not output:
            return None

        # Parse JSON
        data = json.loads(output)
        return data.get("rpl_rank", None)
    except Exception as e:
        # Catch any other unexpected errors
        return None


def fetch_rpl_for_all(log_file=None, progress_callback=None, stop_callback=None, timeout_val=100, pause_callback=None):
    # Load hop counts data once for efficiency
    hop_counts_data = load_hop_counts()
    
    logger = get_logger("rpl_rank_test", log_file)
    logger.info(f"=== RPL RANK TEST STARTED ({len(FAN11_FSK_IPV6)} devices) ===")

    success, fail, skipped = 0, 0, 0
    total_devices = len(FAN11_FSK_IPV6)
    current_device = 0

    for device_name, ip in FAN11_FSK_IPV6.items():
        if stop_callback and stop_callback():
            logger.info("Test stopped by user")
            break
            
        # Check for pause
        while pause_callback and pause_callback():
            time.sleep(0.5)  # Wait while paused
            if stop_callback and stop_callback():  # Check stop while paused
                logger.info("Test stopped by user while paused")
                return success, fail, skipped
        
        current_device += 1
        
        # Check if device should be skipped
        if should_skip_device(ip, hop_counts_data):
            skipped += 1
            hop_count = get_hop_count_for_ip(ip) if hop_counts_data else -1
            
            # Log the skip
            logger.info(f"SKIPPED: {device_name} ({ip}) - Not in hop_counts.json")
            
            # Send skipped result to progress callback
            if progress_callback:
                device_result = {
                    'ip': ip,
                    'label': device_name,
                    'hop_count': hop_count,
                    'rank': '-',
                    'rpl_rank': '-',
                    'connection_status': 'Skipped'
                }
                progress_callback(current_device, total_devices, f"Skipped {device_name}", device_result)
            
            continue
        logger.info(f"Testing device {current_device}/{total_devices}: {device_name} ({ip})")
            
        rpl_rank = get_rpl_rank(ip, timeout_val, stop_callback)
        
        # Check if stopped during get_rpl_rank call
        if stop_callback and stop_callback():
            logger.info("Test stopped by user during CoAP call")
            break
            
        if rpl_rank is not None:
            status = "SUCCESS ✅"
            success += 1
            connection_status = "Connected"
        else:
            status = "FAILED ❌"
            rpl_rank = "No response / error"
            fail += 1
            connection_status = "Disconnected"

        logger.info(f"Device: {device_name} | IP: {ip} | Status: {status}")
        logger.info(f"RPL Rank: {rpl_rank}")
        logger.info("-" * 50)

        # Send device result to frontend
        if progress_callback:
            # Get hop count for the device
            from tests.hopCountUtils import get_hop_count_for_ip
            hop_count = get_hop_count_for_ip(ip)
            
            device_result = {
                'sr_no': current_device,
                'ip': ip,
                'label': device_name,
                'hop_count': hop_count,
                'rpl_data': str(rpl_rank) if rpl_rank is not None else '-',
                'status': connection_status,  # Use 'status' instead of 'connection_status' for frontend
                'connection_status': connection_status  # Keep this for report generation
            }
            progress_callback(current_device, total_devices, f"Testing {device_name}", device_result)

    total = len(FAN11_FSK_IPV6)
    tested = success + fail  # Only devices actually tested (not skipped)
    if skipped > 0:
        summary = f"SUMMARY: {success}/{tested} devices responded ({(success/tested)*100 if tested > 0 else 0:.1f}% success rate), {skipped} skipped"
    else:
        summary = f"SUMMARY: {success}/{tested} devices responded ({(success/tested)*100 if tested > 0 else 0:.1f}% success rate)"
    logger.info(summary)
    logger.info("=== RPL RANK TEST COMPLETED ===")
    return success, fail, skipped


if __name__ == "__main__":
    fetch_rpl_for_all("logs/rpl_rank.log")