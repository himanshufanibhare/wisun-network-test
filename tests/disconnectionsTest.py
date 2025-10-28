#!/usr/bin/env python3
"""
CoAP Disconnected Total Test
Checks 'disconnected_total' via CoAP and logs results
"""

import subprocess
import time
from tests.logger import get_logger
from tests.ip import FAN11_FSK_IPV6

def check_disconnected_total(ip, timeout=120, stop_callback=None):
    """
    Run coap-client-notls command to get disconnected_total.
    Returns the response string or None if failed.
    Now supports stop_callback for early termination.
    """
    cmd = [
        "coap-client-notls",
        "-m", "post",
        "-N",            # Non-confirmable
        "-B", str(timeout),
        "-t", "text",
        f"coap://[{ip}]:5683/statistics/app/disconnected_total"
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
    logger = get_logger("disconnected_total_test", log_file)

    logger.info(f"=== DISCONNECTED_TOTAL TEST STARTED ({len(FAN11_FSK_IPV6)} devices) ===")

    success_count, fail_count = 0, 0
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
                return success_count, fail_count
                
        current_device += 1
            
        response = check_disconnected_total(ip, timeout_val, stop_callback)
        if response:
            status = "RESPONSE ✅"
            success_count += 1
            connection_status = "Connected"
        else:
            status = "NO RESPONSE ❌"
            response = "No response or CoAP error"
            fail_count += 1
            connection_status = "Disconnected"

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
                'disconnected_total': str(response) if response else '-',
                'status': status,
                'response_time': '-',  # Disconnections test doesn't measure response time
                'link_status': connection_status,
                'connection_status': connection_status
            }
            progress_callback(current_device, total_devices, f"Testing {device_name}", device_result)

    total = len(FAN11_FSK_IPV6)
    summary = f"SUMMARY: {success_count}/{total} devices responded ({(success_count/total)*100:.1f}% success rate)"
    logger.info(summary)
    logger.info("=== DISCONNECTED_TOTAL TEST COMPLETED ===")

    return success_count, fail_count


if __name__ == "__main__":
    check_all_devices("logs/disconnected.log")