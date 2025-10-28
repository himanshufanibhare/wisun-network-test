#!/usr/bin/env python3
"""
CoAP Availability Test
Checks device availability via CoAP and logs results
"""

import subprocess
import time
from tests.logger import get_logger
from tests.ip import FAN11_FSK_IPV6

def check_availability(ip, timeout=120, stop_callback=None):
    """
    Run coap-client-notls command to get availability.
    Returns the response string or None if failed.
    Now supports stop_callback for early termination.
    """
    cmd = [
        "coap-client-notls",
        "-m", "post",
        "-t", "text",
        "-B", str(timeout),
        f"coap://[{ip}]:5683/statistics/app/availability"
    ]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        response = ''
        
        # Loop and periodically check stop_callback
        while True:
            try:
                out, err = proc.communicate(timeout=1)
                response += out or ''
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
                    return None
                # otherwise continue waiting

        # Treat empty response or error messages as failed
        if proc.returncode != 0 or not response or "ERR" in response.upper():
            return None
        return response
    except Exception:
        return None


def check_all_devices(log_file=None, progress_callback=None, stop_callback=None, timeout_val=120, pause_callback=None):
    """Check all devices and log results"""
    logger = get_logger("availability_test", log_file)

    logger.info(f"=== AVAILABILITY TEST STARTED ({len(FAN11_FSK_IPV6)} devices) ===")

    available, unavailable = 0, 0
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
                return available, unavailable
                
        current_device += 1
            
        response = check_availability(ip, timeout_val, stop_callback)
        if response:
            # Try to extract a float/percentage from the response string
            import re
            percent_match = re.search(r"([0-9]+\.?[0-9]*)", response)
            if percent_match:
                try:
                    availability_percent = float(percent_match.group(1))
                except Exception:
                    availability_percent = 100.0
            else:
                availability_percent = 100.0
            status = "AVAILABLE ✅" if availability_percent > 0 else "UNAVAILABLE ❌"
            connection_status = "Available" if availability_percent > 0 else "Unavailable"
            if availability_percent > 0:
                available += 1
            else:
                unavailable += 1
        else:
            status = "UNAVAILABLE ❌"
            response = "No response or CoAP error"
            availability_percent = "No response or CoAP error"
            unavailable += 1
            connection_status = "Unavailable"

        logger.info(f"Device: {device_name} | IP: {ip} | Status: {status}")
        logger.info(f"Response: {response}")
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
                'availability': str(response) if response else '-',
                'availability_percent': availability_percent,
                'status': status,
                'response_time': '-',  # Availability test doesn't measure response time
                'link_status': connection_status,
                'connection_status': connection_status
            }
            progress_callback(current_device, total_devices, f"Testing {device_name}", device_result)

    total = len(FAN11_FSK_IPV6)
    summary = f"SUMMARY: {available}/{total} devices available ({(available/total)*100:.1f}% success rate)"
    logger.info(summary)
    logger.info("=== AVAILABILITY TEST COMPLETED ===")

    return available, unavailable


if __name__ == "__main__":
    check_all_devices("logs/availability.log")