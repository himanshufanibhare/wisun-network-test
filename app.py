#!/usr/bin/env python3
"""
Network Test Web Application
Flask-based web interface for running network tests
"""

from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, emit
import threading
import time
import os
import json
import subprocess
from datetime import datetime
from io import BytesIO

# Import test modules
from tests import pingTest, rssiTest, rplTest, disconnectionsTest, availabilityTest
from tests.hopCountUtils import refresh_hop_counts, load_hop_counts, get_hop_count_for_ip, get_hop_count_summary
from utils.test_result_writer import TestResultWriter
from utils.report_generator import (generate_txt_report, generate_pdf_report, generate_word_report, 
                                   generate_json_report, generate_csv_report, generate_xml_report,
                                   get_mimetype, generate_filename)

def map_device_result_for_writer(device_result, test_type):
    """Map device result fields to TestResultWriter compatible format"""
    mapped_result = device_result.copy()
    
    if test_type == 'ping':
        # Map ping-specific fields
        if 'min_time' in device_result:
            mapped_result['min_rtt'] = device_result['min_time']
        if 'max_time' in device_result:
            mapped_result['max_rtt'] = device_result['max_time']
        if 'avg_time' in device_result:
            mapped_result['avg_rtt'] = device_result['avg_time']
        if 'mdev_time' in device_result:
            mapped_result['mdev'] = device_result['mdev_time']
        if 'label' in device_result:
            mapped_result['device_label'] = device_result['label']
        
        # Set connection status based on loss percentage
        if 'loss_percent' in device_result:
            if device_result['loss_percent'] == 0:
                mapped_result['connection_status'] = 'Connected'
            elif device_result['loss_percent'] < 100:
                mapped_result['connection_status'] = 'Unstable'
            else:
                mapped_result['connection_status'] = 'Failed'
        else:
            mapped_result['connection_status'] = 'Unknown'
    
    elif test_type == 'rssi' or test_type == 'rssl':
        # Map RSSI-specific fields
        if 'label' in device_result:
            mapped_result['device_label'] = device_result['label']
        if 'rsl_in' in device_result:
            mapped_result['rsl_in'] = device_result['rsl_in']
        if 'rsl_out' in device_result:
            mapped_result['rsl_out'] = device_result['rsl_out']
        if 'connection_status' in device_result:
            mapped_result['connection_status'] = device_result['connection_status']
        # Remove unwanted fields for RSSI tests
        mapped_result.pop('signal_quality', None)
        mapped_result.pop('response_time', None)
        mapped_result.pop('link_status', None)
    
    elif test_type == 'rpl':
        # Map RPL-specific fields
        if 'label' in device_result:
            mapped_result['device_label'] = device_result['label']
        # Remove unwanted fields for RPL tests
        mapped_result.pop('status', None)
        mapped_result.pop('response_time', None)
        mapped_result.pop('link_status', None)
    
    elif test_type == 'disconnections':
        # Map disconnections-specific fields
        if 'label' in device_result:
            mapped_result['device_label'] = device_result['label']
        # Keep disconnected_total field and remove unwanted fields
        mapped_result.pop('status', None)
        mapped_result.pop('response_time', None) 
        mapped_result.pop('link_status', None)
    
    elif test_type == 'availability':
        # Map availability-specific fields
        if 'label' in device_result:
            mapped_result['device_label'] = device_result['label']
        # Remove unwanted fields for availability tests
        mapped_result.pop('response_time', None)
        mapped_result.pop('uptime', None)
    
    # Add other test type mappings as needed
    
    return mapped_result

app = Flask(__name__)
app.config['SECRET_KEY'] = 'network-test-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables for test control
test_threads = {}
stop_flags = {}
test_status = {}
pause_flags = {}
hop_counts_initialized = False

# Test configurations
TEST_CONFIGS = {
    'ping': {
        'name': 'Ping Test',
        'description': 'Test device connectivity using ICMP ping',
        'parameters': [
            {'name': 'packet_count', 'label': 'Packet Count', 'type': 'number', 'default': 1, 'min': 1, 'max': 1000},
            {'name': 'timeout', 'label': 'Timeout (seconds)', 'type': 'number', 'default': 10, 'min': 1, 'max': 300}
        ]
    },
    'rssl': {
        'name': 'RSSI Test',
        'description': 'Test signal strength (RSL In/Out) via CoAP',
        'parameters': [
            {'name': 'timeout', 'label': 'Timeout (seconds)', 'type': 'number', 'default': 100, 'min': 1, 'max': 300}
        ]
    },
    'rpl': {
        'name': 'RPL Rank Test',
        'description': 'Test RPL rank information via CoAP',
        'parameters': [
            {'name': 'timeout', 'label': 'Timeout (seconds)', 'type': 'number', 'default': 100, 'min': 1, 'max': 300}
        ]
    },
    'disconnections': {
        'name': 'Disconnections Test',
        'description': 'Check disconnected totals via CoAP',
        'parameters': [
            {'name': 'timeout', 'label': 'Timeout (seconds)', 'type': 'number', 'default': 120, 'min': 1, 'max': 300}
        ]
    },
    'availability': {
        'name': 'Availability Test',
        'description': 'Check device availability via CoAP',
        'parameters': [
            {'name': 'timeout', 'label': 'Timeout (seconds)', 'type': 'number', 'default': 120, 'min': 1, 'max': 300}
        ]
    }
}

def ensure_hop_counts_initialized():
    """Ensure hop counts are initialized - call this on first access"""
    global hop_counts_initialized
    if not hop_counts_initialized:
        print("🔄 Initializing hop counts on first access...")
        try:
            success = refresh_hop_counts()
            if success:
                hop_counts = load_hop_counts()
                print(f"✅ Successfully initialized hop counts for {len(hop_counts)} devices")
            else:
                print("⚠️ Warning: Failed to initialize hop counts on first access")
            hop_counts_initialized = True
        except Exception as e:
            print(f"❌ Error initializing hop counts on first access: {e}")

@app.route('/')
def index():
    """Main page - Test selection"""
    # Always refresh hop counts when main page is accessed
    print("🔄 Refreshing hop counts for main page access...")
    try:
        refresh_hop_counts()
        hop_counts = load_hop_counts()
        print(f"✅ Updated hop counts for {len(hop_counts)} devices")
    except Exception as e:
        print(f"⚠️ Warning: Failed to refresh hop counts on main page access: {e}")
    
    return render_template('index.html', tests=TEST_CONFIGS)

@app.route('/test/<test_type>')
def test_page(test_type):
    """Individual test configuration and execution page"""
    # Always refresh hop counts when a test page is accessed
    print(f"🔄 Refreshing hop counts for {test_type} test page access...")
    try:
        refresh_hop_counts()
        hop_counts = load_hop_counts()
        print(f"✅ Updated hop counts for {len(hop_counts)} devices")
    except Exception as e:
        print(f"⚠️ Warning: Failed to refresh hop counts on page access: {e}")
    
    if test_type not in TEST_CONFIGS:
        return "Test not found", 404
    
    config = TEST_CONFIGS[test_type]
    
    # Use specific template for each test type
    template_mapping = {
        'ping': 'ping_test.html',
        'rssl': 'rssi_test.html', 
        'rpl': 'rpl_test.html',
        'disconnections': 'disconnections_test.html',
        'availability': 'availability_test.html'
    }
    
    template_name = template_mapping.get(test_type, 'test.html')
    return render_template(template_name, test_type=test_type, config=config)

@app.route('/restart_test')
def restart_test_page():
    """Border Router restart test page"""
    print("🔄 Accessing restart test page...")
    # Refresh hop counts for current state
    try:
        refresh_hop_counts()
        hop_counts = load_hop_counts()
        print(f"✅ Updated hop counts for restart test: {len(hop_counts)} devices")
    except Exception as e:
        print(f"⚠️ Warning: Failed to refresh hop counts on restart test page access: {e}")
    
    return render_template('restart_test.html')

@app.route('/api/start_test', methods=['POST'])
def start_test():
    """Start a test with given parameters"""
    data = request.get_json()
    test_type = data.get('test_type')
    params = data.get('parameters', {})
    
    # Extract output format
    output_format = params.pop('output_format', 'txt')  # Remove from params and default to txt
    
    print(f"DEBUG: Received test_type: '{test_type}'")
    print(f"DEBUG: Output format: '{output_format}'")
    print(f"DEBUG: Available test types: {list(TEST_CONFIGS.keys())}")
    print(f"DEBUG: test_type in TEST_CONFIGS: {test_type in TEST_CONFIGS}")
    
    if test_type not in TEST_CONFIGS:
        return jsonify({'error': f'Invalid test type: {test_type}'}), 400
    
    # Stop existing test if running
        # Clean up any dead threads first
    if test_type in test_threads:
        thread = test_threads[test_type]
        if not thread.is_alive():
            print(f"DEBUG: Cleaning up dead thread for {test_type}")
            test_threads.pop(test_type, None)
            if test_type in test_status:
                test_status[test_type]['running'] = False
    
    # Check if test is actually running (not just thread exists)
    is_running = (test_type in test_status and test_status[test_type].get('running')) or \
                 (test_type in test_threads and test_threads[test_type].is_alive())
    
    print(f"DEBUG: status_running: {test_type in test_status and test_status[test_type].get('running')}")
    print(f"DEBUG: thread_running: {test_type in test_threads and test_threads[test_type].is_alive()}")
    print(f"DEBUG: is_running: {is_running}")
    
    if is_running:
        print(f"DEBUG: Returning 'Test already running' error")
        return jsonify({'success': False, 'error': 'Test already running'}), 400
    
    # Reset flags
    stop_flags[test_type] = False
    pause_flags[test_type] = False
    test_status[test_type] = {
        'running': True,
        'paused': False,
        'progress': 0,
        'current_device': '',
        'start_time': datetime.now().isoformat(),
        'log_file': f"logs/{test_type}_{int(time.time())}.log"
    }
    
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    # Emit test start event to reset frontend progress
    socketio.emit('test_started', {
        'test_type': test_type,
        'message': f'{TEST_CONFIGS[test_type]["name"]} started'
    })
    
    # Start test in background thread
    print(f"DEBUG: Starting thread for {test_type}")
    thread = threading.Thread(target=run_test, args=(test_type, params, output_format))
    test_threads[test_type] = thread
    thread.start()
    
    print(f"DEBUG: Returning success for {test_type}")
    return jsonify({'success': True, 'message': f'{TEST_CONFIGS[test_type]["name"]} started'})

@app.route('/api/stop_test', methods=['POST'])
def stop_test():
    """Stop a running test"""
    data = request.get_json()
    test_type = data.get('test_type')
    
    # Always set stop flag and clear status to prevent race conditions
    stop_flags[test_type] = True
    
    if test_type in test_status:
        test_status[test_type]['running'] = False
        test_status[test_type]['paused'] = False
    
    # Clean up thread reference immediately if it exists
    if test_type in test_threads:
        thread = test_threads.get(test_type)
        print(f"DEBUG: Stop - thread alive: {thread.is_alive() if thread else 'No thread'}")
        # Force cleanup - remove thread reference regardless of state after setting stop flag
        # The thread should terminate soon due to stop_flags being set
        print(f"DEBUG: Stop - force removing thread reference for {test_type}")
        test_threads.pop(test_type, None)
    
    socketio.emit('test_stopped', {'test_type': test_type})
    return jsonify({'success': True, 'message': 'Test stopped'})

@app.route('/api/retest_device', methods=['POST'])
def retest_device():
    """Retest a single device"""
    data = request.get_json()
    test_type = data.get('test_type')
    ip = data.get('ip')
    label = data.get('label')
    params = data.get('parameters', {})
    
    if test_type not in TEST_CONFIGS:
        return jsonify({'error': 'Invalid test type'}), 400
    
    if not ip or not label:
        return jsonify({'error': 'IP and label are required'}), 400
    
    # Start retest in background thread
    thread = threading.Thread(target=run_single_device_test, args=(test_type, ip, label, params))
    thread.start()
    
    return jsonify({'success': True, 'message': f'Retest started for {label}'})


@app.route('/api/pause_test', methods=['POST'])
def pause_test():
    data = request.get_json()
    test_type = data.get('test_type')
    
    print(f"DEBUG: Pause request for test_type: '{test_type}'")
    print(f"DEBUG: pause_flags keys: {list(pause_flags.keys())}")
    print(f"DEBUG: test_status keys: {list(test_status.keys())}")
    
    # Check if test is actually running
    is_test_running = (test_type in test_status and test_status[test_type].get('running', False))
    
    if is_test_running:
        # Initialize pause flag if not exists
        if test_type not in pause_flags:
            pause_flags[test_type] = False
            
        pause_flags[test_type] = True
        if test_type in test_status:
            test_status[test_type]['paused'] = True
        
        print(f"DEBUG: Test paused successfully, emitting socket event")
        socketio.emit('test_paused', {'test_type': test_type})
        return jsonify({'success': True, 'message': 'Test paused'})
    else:
        print(f"DEBUG: Test not running, cannot pause")
        return jsonify({'error': 'Test not running'}), 400


@app.route('/api/resume_test', methods=['POST'])
def resume_test():
    data = request.get_json()
    test_type = data.get('test_type')
    
    print(f"DEBUG: Resume request for test_type: '{test_type}'")
    print(f"DEBUG: pause_flags keys: {list(pause_flags.keys())}")
    
    # Initialize flags if they don't exist (can happen after Flask reload)
    if test_type not in pause_flags:
        pause_flags[test_type] = True  # Assume it was paused if flags are missing
        print(f"DEBUG: Initialized pause_flags[{test_type}] = True (assuming paused)")
    
    print(f"DEBUG: Current pause_flags[{test_type}]: {pause_flags.get(test_type, 'NOT_FOUND')}")
    
    # Check if test thread exists (even if status is lost)
    thread_exists = test_type in test_threads and test_threads[test_type].is_alive()
    is_test_running = (test_type in test_status and test_status[test_type].get('running', False)) or thread_exists
    
    if is_test_running or thread_exists:
        # Resume by setting pause flag to False
        pause_flags[test_type] = False
        if test_type in test_status:
            test_status[test_type]['paused'] = False
        
        print(f"DEBUG: Test resumed successfully, emitting socket event")
        socketio.emit('test_resumed', {'test_type': test_type})
        return jsonify({'success': True, 'message': 'Test resumed'})
    else:
        print(f"DEBUG: Cannot resume - no active test found")
        return jsonify({'error': 'Test not running'}), 400

def run_single_device_test(test_type, ip, label, params):
    """Run test for a single device"""
    
    # Load hop counts for this retest
    hop_counts = load_hop_counts()
    hop_count = get_hop_count_for_ip(ip, hop_counts)
    
    try:
        if test_type == 'ping':
            count = params.get('packet_count', 100)
            timeout = params.get('timeout', 120)
            
            # Import and use ping test function
            from tests.pingTest import ping_device
            result = ping_device(ip, count, timeout)
            
            # Format device result for frontend
            device_result = {
                'ip': ip,
                'label': label,
                'hop_count': hop_count,
                'packets_tx': result.get('packets_transmitted', 0),
                'packets_rx': result.get('packets_received', 0),
                'loss_percent': result.get('packet_loss', 100.0),
                'min_time': f"{result.get('min_rtt', 0.0):.3f}" if result.get('min_rtt', 0.0) > 0 else '-',
                'max_time': f"{result.get('max_rtt', 0.0):.3f}" if result.get('max_rtt', 0.0) > 0 else '-',
                'avg_time': f"{result.get('avg_rtt', 0.0):.3f}" if result.get('avg_rtt', 0.0) > 0 else '-',
                'mdev_time': f"{result.get('mdev', 0.0):.3f}" if result.get('mdev', 0.0) > 0 else '-'
            }
            
            # Emit result via socket
            socketio.emit('device_retest_result', {
                'test_type': test_type,
                'device_result': device_result
            })
            
        elif test_type == 'rssl':
            timeout = params.get('timeout', 100)
            
            # Import and use RSSI test function
            from tests.rssiTest import get_rsl
            rsl_in, rsl_out = get_rsl(ip, timeout, None)  # No stop callback for single device retest
            
            # Format device result for frontend
            device_result = {
                'ip': ip,
                'label': label,
                'hop_count': hop_count,
                'rsl_in': str(rsl_in) if rsl_in is not None else '-',
                'rsl_out': str(rsl_out) if rsl_out is not None else '-',
                'connection_status': 'Success' if rsl_in is not None and rsl_out is not None else 'Failed'
            }
            
            # Emit result via socket
            socketio.emit('device_retest_result', {
                'test_type': test_type,
                'device_result': device_result
            })
            
        elif test_type == 'rpl':
            timeout = params.get('timeout', 100)
            
            # Import and use RPL test function
            from tests.rplTest import get_rpl_rank
            rpl_rank = get_rpl_rank(ip, timeout, None)  # No stop callback for single device retest
            
            # Format device result for frontend
            device_result = {
                'ip': ip,
                'label': label,
                'hop_count': hop_count,
                'rpl_data': str(rpl_rank) if rpl_rank is not None else '-',
                'connection_status': 'Connected' if rpl_rank is not None else 'Failed'
            }
            
            # Emit result via socket
            socketio.emit('device_retest_result', {
                'test_type': test_type,
                'device_result': device_result
            })
            
        elif test_type == 'disconnections':
            timeout = params.get('timeout', 120)
            
            # Import and use disconnections test function
            from tests.disconnectionsTest import check_disconnected_total
            response = check_disconnected_total(ip, timeout, None)  # No stop callback for single device retest
            
            # Format device result for frontend
            device_result = {
                'ip': ip,
                'label': label,
                'hop_count': hop_count,
                'disconnected_total': response if response is not None else 'No response',
                'status': 'RESPONSE ✅' if response is not None else 'NO RESPONSE ❌'
            }
            
            # Emit result via socket
            socketio.emit('device_retest_result', {
                'test_type': test_type,
                'device_result': device_result
            })
            
        elif test_type == 'availability':
            timeout = params.get('timeout', 120)
            # Import and use availability test function
            from tests.availabilityTest import check_availability
            response = check_availability(ip, timeout, None)  # No stop callback for single device retest

            # Parse actual availability percentage from response if possible
            if response:
                import re
                percent_match = re.search(r"([0-9]+\.?[0-9]*)", response)
                if percent_match:
                    try:
                        availability_percent = float(percent_match.group(1))
                    except Exception:
                        availability_percent = 100.0
                else:
                    availability_percent = 100.0
            else:
                availability_percent = 0.0

            # Format device result for frontend
            device_result = {
                'ip': ip,
                'label': label,
                'hop_count': hop_count,
                'availability': response if response is not None else 'No response',
                'availability_percent': availability_percent,
                'status': 'AVAILABLE ✅' if response is not None else 'UNAVAILABLE ❌'
            }

            # Emit result via socket
            socketio.emit('device_retest_result', {
                'test_type': test_type,
                'device_result': device_result
            })
            
    except Exception as e:
        socketio.emit('device_retest_error', {
            'test_type': test_type,
            'ip': ip,
            'label': label,
            'error': str(e)
        })

@app.route('/api/test_status/<test_type>')
def get_test_status(test_type):
    """Get current status of a test"""
    if test_type in test_status:
        status = test_status[test_type].copy()
        # Add thread status for debugging
        status['thread_alive'] = test_type in test_threads and test_threads[test_type].is_alive()
        status['pause_flag'] = pause_flags.get(test_type, False)
        return jsonify(status)
    return jsonify({'running': False, 'thread_alive': False, 'pause_flag': False})

@app.route('/api/logs/<test_type>')
def get_logs(test_type):
    """Get logs for a specific test"""
    if test_type in test_status and 'log_file' in test_status[test_type]:
        log_file = test_status[test_type]['log_file']
        if os.path.exists(log_file):
            try:
                with open(log_file, 'r') as f:
                    content = f.read()
                return jsonify({'logs': content})
            except Exception as e:
                return jsonify({'error': str(e)}), 500
    
    return jsonify({'logs': 'No logs available'})

@app.route('/download_logs/<test_type>')
def download_logs(test_type):
    """Download log file"""
    if test_type in test_status and 'log_file' in test_status[test_type]:
        log_file = test_status[test_type]['log_file']
        if os.path.exists(log_file):
            return send_file(log_file, as_attachment=True)
    
    return "Log file not found", 404

@app.route('/api/test_result/download/<test_type>/<format>')
def download_test_result(test_type, format):
    """Download test result file in specified format"""
    if test_type in test_status and 'result_file' in test_status[test_type]:
        result_file = test_status[test_type]['result_file']
        if os.path.exists(result_file):
            return send_file(result_file, as_attachment=True)
    
    # If no result file, try to find the latest file in the reports directory
    reports_dir = f"reports/{format}"
    if os.path.exists(reports_dir):
        files = [f for f in os.listdir(reports_dir) if f.startswith(f"{test_type}_test_")]
        if files:
            # Get the most recent file
            latest_file = max(files, key=lambda x: os.path.getctime(os.path.join(reports_dir, x)))
            file_path = os.path.join(reports_dir, latest_file)
            if os.path.exists(file_path):
                return send_file(file_path, as_attachment=True)
    
    return f"No {format.upper()} test result file found for {test_type}", 404

def run_test(test_type, params, output_format='txt'):
    """Run the actual test in background"""
    
    # Initialize result writer
    result_writer = TestResultWriter(test_type, output_format)
    test_status[test_type]['result_file'] = result_writer.get_file_path()
    
    # Refresh hop counts before starting test
    print(f"Refreshing hop counts before {test_type} test...")
    try:
        refresh_hop_counts()
        hop_counts = load_hop_counts()
        print(f"Loaded hop counts for {len(hop_counts)} devices")
    except Exception as e:
        print(f"Warning: Failed to refresh hop counts: {e}")
        hop_counts = {}
    
    def progress_callback(current, total, device_name, device_result=None):
        progress = int((current / total) * 100)
        test_status[test_type]['progress'] = progress
        test_status[test_type]['current_device'] = device_name
        
        # Add hop count to device result if available
        if device_result and 'ip' in device_result:
            device_result['hop_count'] = get_hop_count_for_ip(device_result['ip'], hop_counts)
            
            # Map device result fields for TestResultWriter compatibility
            mapped_result = map_device_result_for_writer(device_result, test_type)
            
            # Write result to the chosen format file
            try:
                result_writer.append_result(mapped_result)
            except Exception as e:
                print(f"Warning: Failed to write result to {output_format} file: {e}")
        
        # Prepare socket data
        socket_data = {
            'test_type': test_type,
            'progress': progress,
            'current_device': device_name,
            'current': current,
            'total': total
        }
        
        # Add device result if provided
        if device_result:
            socket_data['device_result'] = device_result
        
        socketio.emit('test_progress', socket_data)
    
    def stop_callback():
        stop_requested = stop_flags.get(test_type, False)
        if stop_requested:
            print(f"DEBUG: Stop callback triggered for {test_type}")
        return stop_requested
    
    try:
        log_file = test_status[test_type]['log_file']
        
        if test_type == 'ping':
            count = params.get('packet_count', 100)
            timeout = params.get('timeout', 120)
            # Provide a pause callback that reads the pause_flags for this test
            def pause_callback():
                return pause_flags.get(test_type, False)

            # Track test start time
            test_start_time = time.time()
            
            # Run the ping test and capture success/fail/skipped counts
            success, fail, skipped = pingTest.ping_all_devices(log_file, progress_callback, stop_callback, count, timeout, pause_callback)
            
            # Calculate total test duration
            test_end_time = time.time()
            total_duration = test_end_time - test_start_time
            duration_minutes = int(total_duration // 60)
            duration_seconds = int(total_duration % 60)
            
            total_run = success + fail
            if duration_minutes > 0:
                duration_str = f"{duration_minutes}m {duration_seconds}s"
            else:
                duration_str = f"{duration_seconds}s"
            
            summary = f"SUMMARY: {success}/{total_run} devices reachable ({(success / total_run * 100) if total_run>0 else 0:.1f}% success rate) - Duration: {duration_str}"
            # store summary and counts in test_status for frontend
            test_status[test_type]['summary'] = summary
            test_status[test_type]['success'] = success
            test_status[test_type]['fail'] = fail
            test_status[test_type]['total_run'] = total_run
            test_status[test_type]['duration'] = total_duration
            
        elif test_type == 'rssl':
            timeout = params.get('timeout', 100)
            # Provide a pause callback that reads the pause_flags for this test
            def pause_callback():
                return pause_flags.get(test_type, False)
            success, fail, skipped = rssiTest.fetch_rsl_for_all(log_file, progress_callback, stop_callback, timeout, pause_callback)
            total_run = success + fail
            summary = f"SUMMARY: {success}/{total_run} devices responded ({(success / total_run * 100) if total_run>0 else 0:.1f}% success rate)"
            # store summary and counts in test_status for frontend
            test_status[test_type]['summary'] = summary
            test_status[test_type]['success'] = success
            test_status[test_type]['fail'] = fail
            test_status[test_type]['total_run'] = total_run
            
        elif test_type == 'rpl':
            timeout = params.get('timeout', 100)
            # Provide a pause callback that reads the pause_flags for this test
            def pause_callback():
                return pause_flags.get(test_type, False)
            success, fail, skipped = rplTest.fetch_rpl_for_all(log_file, progress_callback, stop_callback, timeout, pause_callback)
            total_run = success + fail
            summary = f"SUMMARY: {success}/{total_run} devices responded ({(success / total_run * 100) if total_run>0 else 0:.1f}% success rate)"
            # store summary and counts in test_status for frontend
            test_status[test_type]['summary'] = summary
            test_status[test_type]['success'] = success
            test_status[test_type]['fail'] = fail
            test_status[test_type]['total_run'] = total_run
            
        elif test_type == 'disconnections':
            timeout = params.get('timeout', 120)
            # Provide a pause callback that reads the pause_flags for this test
            def pause_callback():
                return pause_flags.get(test_type, False)
            success, fail, skipped = disconnectionsTest.check_all_devices(log_file, progress_callback, stop_callback, timeout, pause_callback)
            total_run = success + fail
            summary = f"SUMMARY: {success}/{total_run} devices responded ({(success / total_run * 100) if total_run>0 else 0:.1f}% success rate)"
            # store summary and counts in test_status for frontend
            test_status[test_type]['summary'] = summary
            test_status[test_type]['success'] = success
            test_status[test_type]['fail'] = fail
            test_status[test_type]['total_run'] = total_run
            
        elif test_type == 'availability':
            timeout = params.get('timeout', 120)
            # Provide a pause callback that reads the pause_flags for this test
            def pause_callback():
                return pause_flags.get(test_type, False)
            success, fail, skipped = availabilityTest.check_all_devices(log_file, progress_callback, stop_callback, timeout, pause_callback)
            total_run = success + fail
            summary = f"SUMMARY: {success}/{total_run} devices available ({(success / total_run * 100) if total_run>0 else 0:.1f}% success rate)"
            # store summary and counts in test_status for frontend
            test_status[test_type]['summary'] = summary
            test_status[test_type]['success'] = success
            test_status[test_type]['fail'] = fail
            test_status[test_type]['total_run'] = total_run
            
        # Write summary and finalize the result file
        if test_type in test_status and 'summary' in test_status[test_type]:
            try:
                result_writer.append_summary(test_status[test_type]['summary'])
                final_file_path = result_writer.finalize()
                print(f"Test results saved to: {final_file_path}")
            except Exception as e:
                print(f"Warning: Failed to finalize result file: {e}")
            
    except Exception as e:
        print(f"DEBUG: Exception in run_test for {test_type}: {str(e)}")
        socketio.emit('test_error', {
            'test_type': test_type,
            'error': str(e)
        })
    finally:
        print(f"DEBUG: Cleaning up test {test_type} in finally block")
        if test_type in test_status:
            print(f"DEBUG: Test {test_type} ending - running: {test_status[test_type].get('running')}, progress: {test_status[test_type].get('progress')}")
            test_status[test_type]['running'] = False
            test_status[test_type]['paused'] = False
            test_status[test_type]['end_time'] = datetime.now().isoformat()
        
        # Ensure flags are cleared
        stop_flags[test_type] = False
        pause_flags[test_type] = False
        
        # Clean up thread entry
        if test_type in test_threads:
            print(f"DEBUG: Removing thread reference for {test_type}")
            test_threads.pop(test_type, None)
        
        # Emit completion event
        socketio.emit('test_completed', {
            'test_type': test_type,
            'status': test_status.get(test_type, {})
        })
        
        print(f"DEBUG: Cleanup complete for {test_type}")

@app.route('/api/debug_status')
def debug_status():
    """Debug endpoint to check test status"""
    return jsonify({
        'test_threads': {k: v.is_alive() for k, v in test_threads.items()},
        'test_status': test_status,
        'stop_flags': stop_flags,
        'pause_flags': pause_flags
    })

@app.route('/api/force_cleanup/<test_type>', methods=['POST'])
def force_cleanup(test_type):
    """Force cleanup a test type - for debugging"""
    print(f"DEBUG: Force cleanup requested for {test_type}")
    
    # Force remove everything
    if test_type in test_threads:
        print(f"DEBUG: Removing thread for {test_type}")
        test_threads.pop(test_type, None)
    
    if test_type in test_status:
        print(f"DEBUG: Clearing status for {test_type}")
        test_status[test_type]['running'] = False
        test_status[test_type]['paused'] = False
    
    stop_flags[test_type] = False
    pause_flags[test_type] = False
    
    return jsonify({'success': True, 'message': f'Force cleanup completed for {test_type}'})

@app.route('/api/wisun_tree', methods=['GET'])
def get_wisun_tree():
    """Get Wi-SUN tree status using wsbrd_cli status command"""
    try:
        # First, refresh hop counts to ensure device count is up-to-date
        print("🔄 Refreshing hop counts for Wi-SUN tree...")
        try:
            refresh_hop_counts()
            print("✅ Hop counts refreshed for Wi-SUN tree")
        except Exception as e:
            print(f"⚠️ Warning: Failed to refresh hop counts for Wi-SUN tree: {e}")
        
        result = subprocess.run(['wsbrd_cli', 'status'], 
                              capture_output=True, 
                              text=True, 
                              timeout=30)
        
        # Get device count from hop_counts.json (excluding root node)
        hop_count_data = load_hop_counts()
        device_count = len(hop_count_data) if hop_count_data else 0
        
        # Try to get total_devices from hop_counts.json file
        try:
            hop_count_file = os.path.join(os.path.dirname(__file__), 'hop_counts.json')
            if os.path.exists(hop_count_file):
                with open(hop_count_file, 'r') as f:
                    hop_data = json.load(f)
                    device_count = hop_data.get('total_devices', device_count)
        except Exception:
            pass  # Use device_count from hop_counts dict if file reading fails
        
        # Subtract 1 to exclude the root node (border router at hop count 0)
        actual_device_count = max(0, device_count - 1)
        
        if result.returncode == 0:
            response = jsonify({
                'success': True, 
                'output': result.stdout.strip(),
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'device_count': actual_device_count
            })
            # Add cache-busting headers to ensure fresh data
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
            return response
        else:
            error_msg = result.stderr.strip() if result.stderr else "Command failed"
            # Check for common D-Bus errors
            if "D-Bus error" in error_msg or "NoReply" in error_msg:
                troubleshooting = """
Wi-SUN Border Router Service Issue Detected!

Troubleshooting Steps:
1. Check if Wi-SUN service is running: sudo systemctl status wisun-borderrouter
2. Restart the service: sudo systemctl restart wisun-borderrouter  
3. Check D-Bus service: sudo systemctl status dbus
4. View service logs: sudo journalctl -u wisun-borderrouter -f
5. Verify wsbrd_cli installation: which wsbrd_cli

The service may need to be started or restarted.
                """
                full_error = f"{error_msg}\n{troubleshooting}"
            else:
                full_error = error_msg
                
            return jsonify({
                'success': False, 
                'error': f'Command failed with return code {result.returncode}: {full_error}'
            }), 500
            
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False, 
            'error': 'Command timed out after 30 seconds'
        }), 500
    except FileNotFoundError:
        return jsonify({
            'success': False, 
            'error': 'wsbrd_cli command not found. Please ensure it is installed and in PATH.'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False, 
            'error': f'Error executing command: {str(e)}'
        }), 500

# Hop Count API endpoints
@app.route('/api/hop_counts/refresh', methods=['POST'])
def refresh_hop_counts_api():
    """Refresh hop counts by fetching from network"""
    try:
        success = refresh_hop_counts()
        if success:
            hop_counts = load_hop_counts()
            # Subtract 1 to exclude the root node (border router)
            actual_device_count = max(0, len(hop_counts) - 1)
            return jsonify({
                'success': True, 
                'message': f'Hop counts refreshed successfully for {actual_device_count} Wi-SUN devices',
                'total_devices': actual_device_count
            })
        else:
            return jsonify({'success': False, 'error': 'Failed to refresh hop counts'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/hop_counts', methods=['GET'])
def get_hop_counts_api():
    """Get current hop counts"""
    try:
        hop_counts = load_hop_counts()
        # Subtract 1 to exclude the root node (border router)
        actual_device_count = max(0, len(hop_counts) - 1)
        return jsonify({
            'success': True,
            'hop_counts': hop_counts,
            'total_devices': actual_device_count,
            'summary': get_hop_count_summary()
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/initialize_hop_counts', methods=['POST'])
def initialize_hop_counts_api():
    """Force initialize/refresh hop counts - useful for manual refresh"""
    try:
        print("🔄 Manual hop counts initialization requested...")
        success = refresh_hop_counts()
        if success:
            hop_counts = load_hop_counts()
            print(f"✅ Manual hop counts refresh successful for {len(hop_counts)} devices")
            return jsonify({
                'success': True,
                'message': 'Hop counts refreshed successfully',
                'total_devices': len(hop_counts),
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({'success': False, 'error': 'Failed to refresh hop counts'}), 500
    except Exception as e:
        print(f"❌ Error in manual hop counts refresh: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/hop_counts/<ip_address>', methods=['GET'])
def get_hop_count_for_ip_api(ip_address):
    """Get hop count for specific IP address"""
    try:
        hop_count = get_hop_count_for_ip(ip_address)
        return jsonify({
            'success': True,
            'ip': ip_address,
            'hop_count': hop_count
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@socketio.on('connect')
def handle_connect():
    emit('connected', {'data': 'Connected to test server'})

@socketio.on('disconnect')
def handle_disconnect():
    pass

def initialize_hop_counts():
    """Initialize hop counts when application starts"""
    print("🔄 Initializing hop counts on application startup...")
    try:
        success = refresh_hop_counts()
        if success:
            hop_counts = load_hop_counts()
            print(f"✅ Successfully initialized hop counts for {len(hop_counts)} devices")
        else:
            print("⚠️ Warning: Failed to initialize hop counts on startup")
    except Exception as e:
        print(f"❌ Error initializing hop counts: {e}")

@app.route('/api/wisun_tree/download/<format_type>', methods=['GET'])
def download_wisun_tree(format_type):
    """Download Wi-SUN tree report in specified format (txt, pdf, word)"""
    try:
        # Get fresh Wi-SUN tree data
        result = subprocess.run(['wsbrd_cli', 'status'], 
                              capture_output=True, 
                              text=True, 
                              timeout=30)
        
        if result.returncode != 0:
            return jsonify({
                'success': False, 
                'error': 'Failed to fetch Wi-SUN tree data'
            }), 500
        
        tree_output = result.stdout.strip()
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Get device count (excluding root node)
        hop_count_data = load_hop_counts()
        device_count = len(hop_count_data) if hop_count_data else 0
        
        try:
            hop_count_file = os.path.join(os.path.dirname(__file__), 'hop_counts.json')
            if os.path.exists(hop_count_file):
                with open(hop_count_file, 'r') as f:
                    hop_data = json.load(f)
                    device_count = hop_data.get('total_devices', device_count)
        except Exception:
            pass
        
        actual_device_count = max(0, device_count - 1)
        
        # Generate report based on format
        if format_type == 'txt':
            content = generate_txt_report(tree_output, actual_device_count, timestamp)
            file_data = content.encode('utf-8')
        elif format_type == 'pdf':
            file_data = generate_pdf_report(tree_output, actual_device_count, timestamp)
        elif format_type == 'word':
            file_data = generate_word_report(tree_output, actual_device_count, timestamp)
        elif format_type == 'json':
            content = generate_json_report(tree_output, actual_device_count, timestamp)
            file_data = content.encode('utf-8')
        elif format_type == 'csv':
            content = generate_csv_report(tree_output, actual_device_count, timestamp)
            file_data = content.encode('utf-8')
        elif format_type == 'xml':
            content = generate_xml_report(tree_output, actual_device_count, timestamp)
            file_data = content.encode('utf-8')
        else:
            return jsonify({'success': False, 'error': 'Invalid format type'}), 400
        
        # Create file-like object
        file_buffer = BytesIO(file_data)
        filename = generate_filename(format_type, timestamp)
        mimetype = get_mimetype(format_type)
        
        return send_file(
            file_buffer,
            as_attachment=True,
            download_name=filename,
            mimetype=mimetype
        )
        
    except subprocess.TimeoutExpired:
        return jsonify({
            'success': False, 
            'error': 'Wi-SUN tree command timed out'
        }), 500
    except ImportError as e:
        return jsonify({
            'success': False, 
            'error': f'Required library not installed: {str(e)}'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False, 
            'error': f'Failed to generate report: {str(e)}'
        }), 500

@app.route('/api/wisun_nodes/connected', methods=['GET'])
def get_connected_nodes():
    """Get list of connected Wi-SUN nodes with pole numbers"""
    try:
        from tests.ip import FAN11_FSK_IPV6, get_pole_number
        hop_counts_data = load_hop_counts()
        
        # Extract the actual hop_counts dictionary from the loaded data
        if isinstance(hop_counts_data, dict) and 'hop_counts' in hop_counts_data:
            actual_hop_counts = hop_counts_data['hop_counts']
        else:
            actual_hop_counts = hop_counts_data or {}
        
        connected_nodes = []
        
        # Find devices that are in hop_counts.json (connected devices)
        for device_name, device_ip in FAN11_FSK_IPV6.items():
            ip_lower = device_ip.lower()
            if ip_lower in actual_hop_counts:
                hop_count = actual_hop_counts[ip_lower]
                # Exclude border router (hop count 0) and unknown devices
                if hop_count > 0:
                    pole_number = get_pole_number(device_name)
                    connected_nodes.append({
                        'device_name': device_name,
                        'ip': device_ip,
                        'hop_count': hop_count,
                        'pole_number': pole_number
                    })
        
        # Sort by device name
        connected_nodes.sort(key=lambda x: x['device_name'])
        
        # Calculate total expected nodes (devices in FAN11_FSK_IPV6)
        total_expected_nodes = len(FAN11_FSK_IPV6)
        
        response = jsonify({
            'success': True,
            'nodes': connected_nodes,
            'count': len(connected_nodes),
            'total_nodes': total_expected_nodes,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
        # Add cache-busting headers to ensure fresh data
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
        
    except Exception as e:
        return jsonify({
            'success': False, 
            'error': f'Failed to get connected nodes: {str(e)}'
        }), 500

@app.route('/api/wisun_nodes/disconnected', methods=['GET'])
def get_disconnected_nodes():
    """Get list of disconnected Wi-SUN nodes with pole numbers"""
    try:
        from tests.ip import FAN11_FSK_IPV6, get_pole_number
        hop_counts_data = load_hop_counts()
        
        # Extract the actual hop_counts dictionary from the loaded data
        if isinstance(hop_counts_data, dict) and 'hop_counts' in hop_counts_data:
            actual_hop_counts = hop_counts_data['hop_counts']
        else:
            actual_hop_counts = hop_counts_data
        
        disconnected_nodes = []
        
        # Find devices that are in FAN11_FSK_IPV6 but NOT in hop_counts.json
        for device_name, device_ip in FAN11_FSK_IPV6.items():
            ip_lower = device_ip.lower()
            if ip_lower not in actual_hop_counts:
                pole_number = get_pole_number(device_name)
                disconnected_nodes.append({
                    'device_name': device_name,
                    'ip': device_ip,
                    'pole_number': pole_number,
                    'status': 'Disconnected'
                })
        
        # Sort by device name
        disconnected_nodes.sort(key=lambda x: x['device_name'])
        
        # Calculate total expected nodes (devices in FAN11_FSK_IPV6)  
        total_expected_nodes = len(FAN11_FSK_IPV6)
        
        response = jsonify({
            'success': True,
            'nodes': disconnected_nodes,
            'count': len(disconnected_nodes),
            'total_nodes': total_expected_nodes,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })
        # Add cache-busting headers to ensure fresh data
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
        
    except Exception as e:
        return jsonify({
            'success': False, 
            'error': f'Failed to get disconnected nodes: {str(e)}'
        }), 500

if __name__ == '__main__':
    # Initialize hop counts before starting the server
    initialize_hop_counts()
    
    print("🚀 Starting Flask-SocketIO server...")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)