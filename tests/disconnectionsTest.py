#!/usr/bin/env python3
"""
CoAP Disconnected Total Test
Checks 'disconnected_total' via CoAP and logs results
"""

import subprocess
import time
from tests.logger import get_logger
from tests.ip import FAN11_FSK_IPV6
from tests.hopCountUtils import get_hop_count_for_ip, should_skip_device, create_skipped_result, load_hop_counts

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
        
        # For single device retest (no stop_callback), use direct communicate with timeout
        if stop_callback is None:
            try:
                out, err = proc.communicate(timeout=timeout)
                response = out or ''
                
                # Treat empty response or error messages as failed
                if proc.returncode != 0 or not response or "ERR" in response.upper():
                    return None
                return response
            except subprocess.TimeoutExpired:
                # Command timed out, kill the process
                try:
                    proc.terminate()
                    proc.communicate(timeout=2)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                return None
        else:
            # For full test with stop_callback, use the periodic check loop
            import time
            start_time = time.time()
            
            while True:
                try:
                    out, err = proc.communicate(timeout=1)
                    response += out or ''
                    break
                except subprocess.TimeoutExpired:
                    # Check if overall timeout exceeded
                    if time.time() - start_time > timeout:
                        # Overall timeout exceeded, kill process
                        try:
                            proc.terminate()
                            proc.communicate(timeout=2)
                        except Exception:
                            try:
                                proc.kill()
                            except Exception:
                                pass
                        return None
                    
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
    # Track test start time
    import time
    test_start_time = time.time()
    
    # Load hop counts data once for efficiency  
    hop_counts_data = load_hop_counts()
    
    logger = get_logger("disconnected_total_test", log_file)

    logger.info(f"=== DISCONNECTED_TOTAL TEST STARTED ({len(FAN11_FSK_IPV6)} devices) ===")

    success_count, fail_count, skipped_count = 0, 0, 0
    total_devices = len(FAN11_FSK_IPV6)
    current_device = 0

    for device_name, ip in FAN11_FSK_IPV6.items():
        if stop_callback and stop_callback():
            logger.info("Test stopped by user")
            break
            
        # Handle pause functionality
        while pause_callback and pause_callback():
            import time
            time.sleep(0.5)
            if stop_callback and stop_callback():
                logger.info("Test stopped while paused")
                return success_count, fail_count, skipped_count
                
        current_device += 1
        
        # Check if device should be skipped
        if should_skip_device(ip, hop_counts_data):
            skipped_count += 1
            hop_count = get_hop_count_for_ip(ip) if hop_counts_data else -1
            
            # Log the skip
            logger.info(f"SKIPPED: {device_name} ({ip}) - Not in hop_counts.json")
            
            # Send skipped result to progress callback
            if progress_callback:
                device_result = {
                    'ip': ip,
                    'label': device_name,
                    'hop_count': '-',
                    'disconnected_total': 0,
                    'connection_status': 'Skipped'
                }
                progress_callback(current_device, total_devices, f"Skipped {device_name}", device_result)
            
            continue
            
        # Check for pause
        while pause_callback and pause_callback():
            time.sleep(0.5)  # Wait while paused
            if stop_callback and stop_callback():  # Check stop while paused
                logger.info("Test stopped by user while paused")
                return success_count, fail_count, skipped_count
            
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

    # Calculate test duration
    test_end_time = time.time()
    total_duration = test_end_time - test_start_time
    duration_minutes = int(total_duration // 60)
    duration_seconds = int(total_duration % 60)
    duration_str = f"{duration_minutes}m {duration_seconds}s"

    total = len(FAN11_FSK_IPV6)
    tested = success_count + fail_count  # Only devices actually tested (not skipped)
    # Always show success out of total devices, remove skipped count from summary
    success_rate = (success_count / total * 100) if total > 0 else 0
    summary = f"SUMMARY: {success_count}/{total} devices responded ({success_rate:.1f}% success rate)\nDuration: {duration_str}"
    logger.info(summary)
    logger.info("=== DISCONNECTED_TOTAL TEST COMPLETED ===")

    return success_count, fail_count, skipped_count


if __name__ == "__main__":
    check_all_devices("logs/disconnected.log")