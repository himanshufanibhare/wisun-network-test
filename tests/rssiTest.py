#!/usr/bin/env python3
"""
CoAP RSL Fetcher
Fetches 'rsl_in' and 'rsl_out' from a CoAP endpoint and logs results
"""

import subprocess
import json
from tests.logger import get_logger
from tests.ip import FAN11_FSK_IPV6
from tests.hopCountTest import get_hop_count_for_ip

def get_rsl(ip, timeout=100, stop_callback=None):
    """
    Run coap-client-notls to fetch JSON and extract rsl_in and rsl_out.
    Returns tuple (rsl_in, rsl_out) or (None, None) if failed.
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
                        proc.communicate(timeout=2)
                    except Exception:
                        try:
                            proc.kill()
                        except Exception:
                            pass
                    return None, None
                # otherwise continue waiting

        if proc.returncode != 0 or not output:
            return None, None

        # Parse JSON
        data = json.loads(output)
        rsl_in = data.get("rsl_in", None)
        rsl_out = data.get("rsl_out", None)
        return rsl_in, rsl_out
    except Exception:
        return None, None


def fetch_rsl_for_all(log_file=None, progress_callback=None, stop_callback=None, timeout_val=100, pause_callback=None):
    logger = get_logger("rsl_test", log_file)
    logger.info(f"=== RSL TEST STARTED ({len(FAN11_FSK_IPV6)} devices) ===")

    success, fail = 0, 0
    total_devices = len(FAN11_FSK_IPV6)
    current_device = 0

    for device_name, ip in FAN11_FSK_IPV6.items():
        if stop_callback and stop_callback():
            logger.info("Test stopped by user")
            break
            
        # Handle pause functionality
        if pause_callback:
            while pause_callback():
                logger.info("Test paused, waiting...")
                import time
                time.sleep(1)
                if stop_callback and stop_callback():
                    logger.info("Test stopped while paused")
                    return success, fail
            
        current_device += 1
        rsl_in, rsl_out = get_rsl(ip, timeout_val, stop_callback)
        
        if rsl_in is not None and rsl_out is not None:
            status = "SUCCESS ✅"
            success += 1
            connection_status = "Success"
        else:
            status = "FAILED ❌"
            rsl_in = rsl_out = "No response / error"
            fail += 1
            connection_status = "Failed"

        logger.info(f"Device: {device_name} | IP: {ip} | Status: {status}")
        logger.info(f"RSL In: {rsl_in} | RSL Out: {rsl_out}")
        logger.info("-" * 50)
        
        # Prepare device result for frontend display
        if progress_callback:
            # Get hop count for this IP
            hop_count = get_hop_count_for_ip(ip, stop_callback)
            
            device_result = {
                'ip': ip,
                'label': device_name,
                'hop_count': str(hop_count),
                'rsl_in': str(rsl_in) if rsl_in is not None else '-',
                'rsl_out': str(rsl_out) if rsl_out is not None else '-',
                'signal_quality': 'Good' if rsl_in is not None and rsl_out is not None else 'Poor',
                'response_time': '-',  # RSL test doesn't measure response time
                'link_status': 'Connected' if rsl_in is not None else 'Disconnected',
                'connection_status': connection_status
            }
            progress_callback(current_device, total_devices, f"Testing {device_name}", device_result)

    total = len(FAN11_FSK_IPV6)
    summary = f"SUMMARY: {success}/{total} devices responded ({(success/total)*100:.1f}% success rate)"
    logger.info(summary)
    logger.info("=== RSL TEST COMPLETED ===")
    return success, fail


if __name__ == "__main__":
    fetch_rsl_for_all("logs/rsl.log")