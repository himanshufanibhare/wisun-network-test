#!/usr/bin/env python3
"""
Ping Test Module
Pings all devices and logs results
"""

import subprocess
import re
import time
from tests.logger import get_logger
from tests.ip import FAN11_FSK_IPV6
from tests.hopCountTest import get_hop_count_for_ip

timeout = 120
packet_count = 100


# ---------- Ping Core Functions ----------
def ping_device(ip, count=packet_count, timeout_per_packet=timeout, stop_callback=None):
    """Ping a single device and return parsed results. If stop_callback returns True, terminate early."""
    cmd = ["ping", "-c", str(count), "-W", str(timeout_per_packet), ip]
    proc = None
    output = ''
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        # Loop and periodically check stop_callback
        while True:
            try:
                out, err = proc.communicate(timeout=1)
                output += out or ''
                break
            except subprocess.TimeoutExpired:
                # ping still running; check stop flag
                if stop_callback and stop_callback():
                    # terminate process and return failed result
                    try:
                        proc.terminate()
                        out, err = proc.communicate(timeout=2)
                        output += out or ''
                    except Exception:
                        try:
                            proc.kill()
                        except Exception:
                            pass
                    return _failed_result(count)
                # otherwise continue waiting
                continue

        # Process ended normally
        if proc.returncode == 0:
            return parse_ping_output(output)
        else:
            # even if return code non-zero, try parsing output
            parsed = parse_ping_output(output)
            # if parsing gives no received packets, return failed
            if parsed.get('packets_received', 0) == 0:
                return _failed_result(count)
            return parsed

    except Exception:
        try:
            if proc:
                proc.kill()
        except Exception:
            pass
        return _failed_result(count)


def parse_ping_output(ping_output):
    """Parse ping output and extract key statistics"""
    transmitted = received = 0
    loss = 100.0
    min_rtt = avg_rtt = max_rtt = mdev = 0.0

    lines = ping_output.splitlines()

    for line in lines:
        if "packets transmitted" in line:
            match = re.search(
                r"(\d+) packets transmitted, (\d+) received, ([0-9.]+)% packet loss",
                line
            )
            if match:
                transmitted = int(match.group(1))
                received = int(match.group(2))
                loss = float(match.group(3))

        elif "rtt min/avg/max/mdev" in line:
            match = re.search(r"= ([0-9.]+)/([0-9.]+)/([0-9.]+)/([0-9.]+)", line)
            if match:
                min_rtt, avg_rtt, max_rtt, mdev = map(float, match.groups())

    return {
        "packets_transmitted": transmitted,
        "packets_received": received,
        "packet_loss": loss,
        "min_rtt": min_rtt,
        "avg_rtt": avg_rtt,
        "max_rtt": max_rtt,
        "mdev": mdev,
    }


def _failed_result(count):
    """Return default result for failed ping"""
    return {
        "packets_transmitted": count,
        "packets_received": 0,
        "packet_loss": 100.0,
        "min_rtt": 0.0,
        "avg_rtt": 0.0,
        "max_rtt": 0.0,
        "mdev": 0.0,
    }


# ---------- Logging Helpers (Ping-specific) ----------
def log_test_start(logger, test_name, details=""):
    logger.info(f"=== {test_name.upper()} TEST STARTED ===")
    if details:
        logger.info(f"Details: {details}")


def log_test_end(logger, test_name, summary=""):
    if summary:
        logger.info(f"Summary: {summary}")
    logger.info(f"=== {test_name.upper()} TEST COMPLETED ===")


def log_device_result(logger, device_name, ip, result_data):
    status = "SUCCESS ✅" if result_data.get("packets_received", 0) > 0 else "FAILED ❌"
    logger.info(f"STATUS: {status} | Device: {device_name} | IP: {ip}")

    for key, value in result_data.items():
        logger.info(f"  {key}: {value}")

    logger.info("-" * 50)


# ---------- Main Test Runner ----------
def ping_all_devices(log_path=None, progress_callback=None, stop_callback=None, count=100, timeout_val=120, pause_callback=None):
    """Ping all devices and save results"""
    global packet_count, timeout
    packet_count = count
    timeout = timeout_val
    
    # Track test start time
    test_start_time = time.time()
    
    logger = get_logger("pingtest", log_path)
    log_test_start(logger, "Ping", f"Testing {len(FAN11_FSK_IPV6)} devices")

    success, fail = 0, 0
    total_devices = len(FAN11_FSK_IPV6)
    current_device = 0

    for device_name, ip in FAN11_FSK_IPV6.items():
        # Check for stop
        if stop_callback and stop_callback():
            logger.info("Test stopped by user")
            break

        # Handle pause: if pause_callback is provided and returns True, wait until it's False
        while pause_callback and pause_callback():
            time.sleep(0.5)
            # Check for stop while paused
            if stop_callback and stop_callback():
                logger.info("Test stopped by user while paused")
                return success, fail

        current_device += 1
        result = ping_device(ip, count, timeout_val, stop_callback)

        if result["packets_received"] > 0:
            success += 1
        else:
            fail += 1

        log_device_result(logger, device_name, ip, result)
        
        # Prepare device result for frontend
        if progress_callback:
            # Get hop count for this IP
            hop_count = get_hop_count_for_ip(ip, stop_callback)
            
            device_result = {
                'ip': ip,
                'label': device_name,
                'hop_count': str(hop_count),
                'packets_tx': result.get('packets_transmitted', 0),
                'packets_rx': result.get('packets_received', 0),
                'loss_percent': result.get('packet_loss', 100.0),
                'min_time': f"{result.get('min_rtt', 0.0):.3f}" if result.get('min_rtt', 0.0) > 0 else '-',
                'max_time': f"{result.get('max_rtt', 0.0):.3f}" if result.get('max_rtt', 0.0) > 0 else '-',
                'avg_time': f"{result.get('avg_rtt', 0.0):.3f}" if result.get('avg_rtt', 0.0) > 0 else '-',
                'mdev_time': f"{result.get('mdev', 0.0):.3f}" if result.get('mdev', 0.0) > 0 else '-'
            }
            progress_callback(current_device, total_devices, f"Testing {device_name}", device_result)

    # Calculate test duration
    test_end_time = time.time()
    total_duration = test_end_time - test_start_time
    duration_minutes = int(total_duration // 60)
    duration_seconds = int(total_duration % 60)
    
    if duration_minutes > 0:
        duration_str = f"{duration_minutes}m {duration_seconds}s"
    else:
        duration_str = f"{duration_seconds}s"
    
    total = len(FAN11_FSK_IPV6)
    summary = f"SUMMARY: {success}/{total} devices reachable ({(success / total) * 100:.1f}% success rate) - Duration: {duration_str}"

    log_test_end(logger, "Ping", summary)
    return success, fail


if __name__ == "__main__":
    print("=== AUTOMATIC PING TEST ===")
    ping_all_devices("logs")