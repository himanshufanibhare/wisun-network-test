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

# Import test modules
from tests import pingTest, rssiTest, rplTest, disconnectionsTest, availabilityTest

app = Flask(__name__)
app.config['SECRET_KEY'] = 'network-test-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables for test control
test_threads = {}
stop_flags = {}
test_status = {}
pause_flags = {}

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

@app.route('/')
def index():
    """Main page - Test selection"""
    return render_template('index.html', tests=TEST_CONFIGS)

@app.route('/test/<test_type>')
def test_page(test_type):
    """Individual test configuration and execution page"""
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

@app.route('/api/start_test', methods=['POST'])
def start_test():
    """Start a test with given parameters"""
    data = request.get_json()
    test_type = data.get('test_type')
    params = data.get('parameters', {})
    
    print(f"DEBUG: Received test_type: '{test_type}'")
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
    thread = threading.Thread(target=run_test, args=(test_type, params))
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
                'rsl_in': str(rsl_in) if rsl_in is not None else '-',
                'rsl_out': str(rsl_out) if rsl_out is not None else '-',
                'signal_quality': 'Good' if rsl_in is not None and rsl_out is not None else 'Poor',
                'response_time': '-',  # RSL test doesn't measure response time
                'link_status': 'Connected' if rsl_in is not None else 'Disconnected',
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
                'rpl_data': str(rpl_rank) if rpl_rank is not None else '-',
                'status': 'Connected' if rpl_rank is not None else 'Failed'
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
                'disconnected_total': response if response is not None else 'No response',
                'status': 'Connected' if response is not None else 'Failed'
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
            
            # Format device result for frontend
            device_result = {
                'ip': ip,
                'label': label,
                'availability': response if response is not None else 'No response',
                'status': 'Available' if response is not None else 'Failed'
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

def run_test(test_type, params):
    """Run the actual test in background"""
    def progress_callback(current, total, device_name, device_result=None):
        progress = int((current / total) * 100)
        test_status[test_type]['progress'] = progress
        test_status[test_type]['current_device'] = device_name
        
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
            
            # Run the ping test and capture success/fail counts
            success, fail = pingTest.ping_all_devices(log_file, progress_callback, stop_callback, count, timeout, pause_callback)
            
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
            success, fail = rssiTest.fetch_rsl_for_all(log_file, progress_callback, stop_callback, timeout, pause_callback)
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
            success, fail = rplTest.fetch_rpl_for_all(log_file, progress_callback, stop_callback, timeout, pause_callback)
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
            success, fail = disconnectionsTest.check_all_devices(log_file, progress_callback, stop_callback, timeout, pause_callback)
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
            success, fail = availabilityTest.check_all_devices(log_file, progress_callback, stop_callback, timeout, pause_callback)
            total_run = success + fail
            summary = f"SUMMARY: {success}/{total_run} devices available ({(success / total_run * 100) if total_run>0 else 0:.1f}% success rate)"
            # store summary and counts in test_status for frontend
            test_status[test_type]['summary'] = summary
            test_status[test_type]['success'] = success
            test_status[test_type]['fail'] = fail
            test_status[test_type]['total_run'] = total_run
            
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
        result = subprocess.run(['wsbrd_cli', 'status'], 
                              capture_output=True, 
                              text=True, 
                              timeout=30)
        
        if result.returncode == 0:
            return jsonify({
                'success': True, 
                'output': result.stdout.strip(),
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })
        else:
            error_msg = result.stderr.strip() if result.stderr else "Command failed"
            return jsonify({
                'success': False, 
                'error': f'Command failed with return code {result.returncode}: {error_msg}'
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

@socketio.on('connect')
def handle_connect():
    emit('connected', {'data': 'Connected to test server'})

@socketio.on('disconnect')
def handle_disconnect():
    pass

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)