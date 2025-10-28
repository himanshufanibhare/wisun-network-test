// Test page JavaScript functionality
let socket;
let currentTestType;
let testRunning = false;

function initializeTestPage(testType) {
    currentTestType = testType;

    // Initialize Socket.IO connection
    socket = io();

    // Set up event listeners
    setupEventListeners();

    // Set up Socket.IO event handlers
    setupSocketHandlers();

    // Check if test is already running
    checkTestStatus();
}

function setupEventListeners() {
    // Test form submission
    document.getElementById('testForm').addEventListener('submit', function (e) {
        e.preventDefault();
        toggleTest();
    });

    // Pause/Resume button
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', function () {
            // If currently paused, resume; otherwise pause
            if (pauseBtn.dataset && pauseBtn.dataset.paused === 'true') {
                resumeTest();
            } else {
                pauseTest();
            }
        });
    }
}

function setupSocketHandlers() {
    socket.on('connect', function () {
        console.log('Connected to server via Socket.IO');
    });

    socket.on('test_progress', function (data) {
        console.log('Received test_progress:', data); // Debug log
        if (data.test_type === currentTestType) {
            // Update results table if device result is available
            if (data.device_result) {
                console.log('Updating table with device result:', data.device_result); // Debug log
                updateResultsTable(data.device_result);
            }
            // Update spinner text with current/total if available
            if (data.current !== undefined && data.total !== undefined) {
                const spinnerText = document.getElementById('testSpinnerText');
                if (spinnerText) {
                    spinnerText.textContent = `Test in progress...(${data.current}/${data.total})`;
                }
            }
        }
    });

    socket.on('test_completed', function (data) {
        if (data.test_type === currentTestType) {
            if (data.results) {
                populateResultsTable(data.results);
            }
            testCompleted();
        }
    });

    socket.on('test_stopped', function (data) {
        if (data.test_type === currentTestType) {
            testStopped();
        }
    });

    socket.on('test_paused', function (data) {
        if (data.test_type === currentTestType) {
            // Update UI to paused state
            const pauseBtn = document.getElementById('pauseBtn');
            if (pauseBtn) {
                pauseBtn.innerHTML = '<i class="fas fa-play me-1"></i>Resume';
                pauseBtn.classList.remove('btn-warning');
                pauseBtn.classList.add('btn-success');
                pauseBtn.disabled = false;
                pauseBtn.dataset.paused = 'true';
            }

            // Hide spinner
            document.getElementById('testSpinner').classList.add('d-none');
            showWarning('Test paused');
        }
    });

    socket.on('test_resumed', function (data) {
        if (data.test_type === currentTestType) {
            const pauseBtn = document.getElementById('pauseBtn');
            if (pauseBtn) {
                pauseBtn.innerHTML = '<i class="fas fa-pause me-1"></i>Pause';
                pauseBtn.classList.remove('btn-success');
                pauseBtn.classList.add('btn-warning');
                pauseBtn.disabled = false;
                pauseBtn.dataset.paused = 'false';
            }

            // Show spinner again
            document.getElementById('testSpinner').classList.remove('d-none');
            showSuccess('Test resumed');
        }
    });

    socket.on('test_error', function (data) {
        if (data.test_type === currentTestType) {
            testError(data.error);
        }
    });

    socket.on('device_retest_result', function (data) {
        if (data.test_type === currentTestType) {
            console.log('Received retest result:', data.device_result);
            updateDeviceInTable(data.device_result);
        }
    });

    socket.on('device_retest_error', function (data) {
        if (data.test_type === currentTestType) {
            showError(`Retest failed for ${data.label}: ${data.error}`);
            const deviceId = data.ip.replace(/[^a-zA-Z0-9]/g, '_');
            resetRetestButton(deviceId, data.ip, data.label);
        }
    });
}

function toggleTest() {
    if (testRunning) {
        stopTest();
    } else {
        startTest();
    }
}

function startTest() {
    if (testRunning) {
        console.log('Test already running, ignoring start request');
        return;
    }
    // Gather form data
    const formData = new FormData(document.getElementById('testForm'));
    const parameters = {};

    for (let [key, value] of formData.entries()) {
        // Convert numeric values
        if (!isNaN(value) && value !== '') {
            parameters[key] = Number(value);
        } else {
            parameters[key] = value;
        }
    }

    // Prepare request data
    const requestData = {
        test_type: currentTestType,
        parameters: parameters
    };

    // Send start request
    // Disable start/stop button immediately to prevent duplicates
    document.getElementById('startStopBtn').disabled = true;

    fetch('/api/start_test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                testStarted();
            } else {
                // Re-enable start/stop button if test failed to start
                document.getElementById('startStopBtn').disabled = false;
                showError('Failed to start test: ' + data.error);
            }
        })
        .catch(error => {
            // Re-enable start/stop button on network error
            document.getElementById('startStopBtn').disabled = false;
            showError('Network error: ' + error.message);
        });
}

function stopTest() {
    const requestData = {
        test_type: currentTestType
    };

    // Immediately update UI to show stopping state
    const startStopBtn = document.getElementById('startStopBtn');
    startStopBtn.disabled = true;
    startStopBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Stopping...';
    testRunning = false;

    fetch('/api/stop_test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Test stop request sent');
                // testStopped() will be called via socket event
            } else {
                // Re-enable button if stop failed
                startStopBtn.disabled = false;
                startStopBtn.innerHTML = '<i class="fas fa-stop me-1"></i>Stop Test';
                testRunning = true;
                showError('Failed to stop test: ' + data.error);
            }
        })
        .catch(error => {
            // Re-enable button on network error
            startStopBtn.disabled = false;
            startStopBtn.innerHTML = '<i class="fas fa-stop me-1"></i>Stop Test';
            testRunning = true;
            showError('Network error: ' + error.message);
        });
}

function testStarted() {
    testRunning = true;

    // Update UI
    const startStopBtn = document.getElementById('startStopBtn');
    startStopBtn.disabled = false;
    startStopBtn.innerHTML = '<i class="fas fa-stop me-1"></i>Stop Test';
    startStopBtn.classList.remove('btn-success');
    startStopBtn.classList.add('btn-danger');

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.disabled = false;
        pauseBtn.dataset.paused = 'false';
        pauseBtn.innerHTML = '<i class="fas fa-pause me-1"></i>Pause';
        pauseBtn.classList.remove('btn-success');
        pauseBtn.classList.add('btn-warning');
    }

    // Show spinner
    document.getElementById('testSpinner').classList.remove('d-none');

    // Clear any previous summary when a new test starts
    const summaryEl = document.getElementById('testSummary');
    if (summaryEl) summaryEl.textContent = '';

    // Clear results table
    clearResultsTable();
}

function pauseTest() {
    const requestData = { test_type: currentTestType };
    fetch('/api/pause_test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                console.log('Pause request sent');
            } else {
                showError('Failed to pause test: ' + data.error);
            }
        })
        .catch(err => showError('Network error: ' + err.message));
}

function resumeTest() {
    const requestData = { test_type: currentTestType };
    fetch('/api/resume_test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                console.log('Resume request sent');
            } else {
                showError('Failed to resume test: ' + data.error);
            }
        })
        .catch(err => showError('Network error: ' + err.message));
}

function clearResultsTable() {
    const tbody = document.getElementById('resultsTableBody');
    // Determine colspan based on test type
    let colspan = 12; // Default for ping test
    if (currentTestType === 'rssi' || currentTestType === 'rssl') {
        colspan = 9; // RSSI test has 9 columns
    }

    // Completely clear all previous results
    tbody.innerHTML = `
        <tr>
            <td colspan="${colspan}" class="text-center text-muted">
                <i class="fas fa-spinner fa-spin me-2"></i>Test in progress...(0/0)
            </td>
        </tr>
    `;
    console.log('Results table cleared'); // Debug log
}

function updateResultsTable(deviceResult) {
    console.log('updateResultsTable called with:', deviceResult); // Debug log
    const tbody = document.getElementById('resultsTableBody');

    // If this is the first result, clear the placeholder
    if (tbody.children.length === 1 && tbody.children[0].children.length === 1) {
        console.log('Clearing placeholder row'); // Debug log
        tbody.innerHTML = '';
    }

    // Create unique ID for the device
    const deviceId = deviceResult.ip.replace(/[^a-zA-Z0-9]/g, '_');

    // Check if device already exists in table
    const existingRow = document.querySelector(`tr[data-device-ip="${deviceResult.ip}"]`);

    // Determine button state based on test result
    const isFailedTest = deviceResult.loss_percent === 100 || deviceResult.packets_rx === 0;
    const buttonClass = isFailedTest ? 'btn-warning' : 'btn-outline-secondary';
    const buttonText = isFailedTest ? 'Retry' : 'Retest';
    const buttonIcon = isFailedTest ? 'fa-exclamation-triangle' : 'fa-redo';

    // Determine serial number: use provided index if present, otherwise compute based on rows
    let srNo = deviceResult.sr_no !== undefined ? deviceResult.sr_no : null;
    if (srNo === null) {
        if (existingRow) {
            // preserve existing sr no from the row's first cell
            const firstCell = existingRow.querySelector('td:first-child');
            const parsed = firstCell ? parseInt(firstCell.textContent) : NaN;
            srNo = Number.isInteger(parsed) ? parsed : 1;
        } else {
            // compute next index for new row
            const existingRows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
            srNo = existingRows.length + 1;
        }
    }

    // Generate row HTML based on test type and available data
    let rowHTML;
    if (currentTestType === 'rssi' || currentTestType === 'rssl') {
        // RSSI test columns: Sr No, IP, Label, RSL In, RSL Out, Signal Quality, Response Time, Link Status, Connection Status
        const statusClass = getStatusClassForRSSI(deviceResult.connection_status);
        rowHTML = `
            <td class="srno-column">${srNo}</td>
            <td class="ip-column">${deviceResult.ip}</td>
            <td>${deviceResult.label || '-'}</td>
            <td class="metric-column">${deviceResult.rsl_in || '-'}</td>
            <td class="metric-column">${deviceResult.rsl_out || '-'}</td>
            <td class="metric-column">${deviceResult.signal_quality || '-'}</td>
            <td class="metric-column">${deviceResult.response_time || '-'}</td>
            <td class="metric-column">${deviceResult.link_status || '-'}</td>
            <td class="${statusClass}">${deviceResult.connection_status || 'Unknown'}</td>
        `;
    } else {
        // Ping test columns: Sr No, IP, Label, Packets TX, Packets RX, Loss %, Min RTT, Max RTT, Avg RTT, Mdev, Connection Status, Retest
        rowHTML = `
            <td class="srno-column">${srNo}</td>
            <td class="ip-column">${deviceResult.ip}</td>
            <td>${deviceResult.label || '-'}</td>
            <td class="metric-column">${deviceResult.packets_tx || '-'}</td>
            <td class="metric-column">${deviceResult.packets_rx || '-'}</td>
            <td class="metric-column ${getStatusClass(deviceResult.loss_percent)}">${deviceResult.loss_percent !== undefined ? deviceResult.loss_percent + '%' : '-'}</td>
            <td class="metric-column">${deviceResult.min_time || '-'}</td>
            <td class="metric-column">${deviceResult.max_time || '-'}</td>
            <td class="metric-column">${deviceResult.avg_time || '-'}</td>
            <td class="metric-column">${deviceResult.mdev_time || '-'}</td>
            <td class="${getStatusClass(deviceResult.loss_percent)}">${getStatusText(deviceResult.loss_percent)}</td>
            <td class="text-center">
                <button class="btn ${buttonClass} btn-sm" 
                        onclick="retestDevice('${deviceResult.ip}', '${deviceResult.label}', '${deviceId}')"
                        id="retest_${deviceId}">
                    <i class="fas ${buttonIcon} me-1"></i>${buttonText}
                </button>
            </td>
        `;
    }

    if (existingRow) {
        // Update existing row
        existingRow.innerHTML = rowHTML;
        console.log('Updated existing row for device:', deviceResult.ip); // Debug log
    } else {
        // Create new row
        const row = document.createElement('tr');
        row.setAttribute('data-device-ip', deviceResult.ip);
        row.innerHTML = rowHTML;
        tbody.appendChild(row);
        console.log('Added new row for device:', deviceResult.ip); // Debug log
    }
}

function populateResultsTable(results) {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = '';

    if (!results || results.length === 0) {
        // Determine colspan based on test type
        let colspan = 12; // Default for ping test
        if (currentTestType === 'rssi' || currentTestType === 'rssl') {
            colspan = 9; // RSSI test has 9 columns
        }

        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="text-center text-muted">
                    <i class="fas fa-exclamation-circle me-2"></i>No results available
                </td>
            </tr>
        `;
        return;
    }

    results.forEach(result => {
        updateResultsTable(result);
    });
}

function getStatusClass(lossPercent) {
    if (lossPercent === undefined || lossPercent === null) return '';
    if (lossPercent === 0) return 'status-success';
    if (lossPercent < 20) return 'status-warning';
    if (lossPercent < 100) return 'status-poor';
    return 'status-danger';
}

function getStatusClassForRSSI(connectionStatus) {
    if (!connectionStatus) return '';
    if (connectionStatus === 'Success') return 'status-success';
    if (connectionStatus === 'Failed') return 'status-danger';
    return '';
}

function getStatusText(lossPercent) {
    if (lossPercent === undefined || lossPercent === null) return 'Unknown';
    if (lossPercent === 0) return 'Success';
    if (lossPercent < 20) return 'Warning';
    if (lossPercent < 100) return 'Poor';
    return 'Failed';
}



function testCompleted() {
    testRunning = false;

    // Update UI
    const startStopBtn = document.getElementById('startStopBtn');
    startStopBtn.disabled = false;
    startStopBtn.innerHTML = '<i class="fas fa-play me-1"></i>Start Test';
    startStopBtn.classList.remove('btn-danger');
    startStopBtn.classList.add('btn-success');

    // Reset pause button
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.innerHTML = '<i class="fas fa-pause me-1"></i>Pause';
        pauseBtn.classList.remove('btn-success');
        pauseBtn.classList.add('btn-warning');
        pauseBtn.dataset.paused = 'false';
    }

    // Hide spinner
    document.getElementById('testSpinner').classList.add('d-none');

    showSuccess('Test completed successfully!');
    // Fetch and display summary + enable download button
    fetch(`/api/test_status/${currentTestType}`)
        .then(res => res.json())
        .then(data => {
            const summaryEl = document.getElementById('testSummary');
            if (data && data.summary) {
                summaryEl.textContent = data.summary;
            } else {
                summaryEl.textContent = 'Test completed.';
            }

            const btn = document.getElementById('mainDownloadDropdown');
            if (btn) {
                btn.disabled = false;
            }
        });
}

function testStopped() {
    testRunning = false;

    // Update UI
    const startStopBtn = document.getElementById('startStopBtn');
    startStopBtn.disabled = false;
    startStopBtn.innerHTML = '<i class="fas fa-play me-1"></i>Start Test';
    startStopBtn.classList.remove('btn-danger');
    startStopBtn.classList.add('btn-success');

    // Reset pause button if it exists
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.innerHTML = '<i class="fas fa-pause me-1"></i>Pause';
        pauseBtn.classList.remove('btn-success');
        pauseBtn.classList.add('btn-warning');
        pauseBtn.dataset.paused = 'false';
    }

    // Hide spinner
    document.getElementById('testSpinner').classList.add('d-none');

    // Update table message if no results exist
    const tbody = document.getElementById('resultsTableBody');
    if (tbody.children.length === 1 && tbody.children[0].children.length === 1) {
        // Only update if showing "Test in progress..." message
        if (tbody.innerHTML.includes('Test in progress')) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center text-warning">
                        <i class="fas fa-stop-circle me-2"></i>Test was stopped by user. No results to display.
                    </td>
                </tr>
            `;
        }
    }

    showWarning('Test was stopped by user');
    // show summary if available and enable download
    fetch(`/api/test_status/${currentTestType}`)
        .then(res => res.json())
        .then(data => {
            const summaryEl = document.getElementById('testSummary');
            if (data && data.summary) summaryEl.textContent = data.summary;
            const btn = document.getElementById('mainDownloadDropdown');
            if (btn) btn.disabled = false;
        });
}

function testError(error) {
    testRunning = false;

    // Update UI
    const startStopBtn = document.getElementById('startStopBtn');
    startStopBtn.disabled = false;
    startStopBtn.innerHTML = '<i class="fas fa-play me-1"></i>Start Test';
    startStopBtn.classList.remove('btn-danger');
    startStopBtn.classList.add('btn-success');

    // Reset pause button
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.innerHTML = '<i class="fas fa-pause me-1"></i>Pause';
        pauseBtn.classList.remove('btn-success');
        pauseBtn.classList.add('btn-warning');
        pauseBtn.dataset.paused = 'false';
    }

    // Hide spinner
    document.getElementById('testSpinner').classList.add('d-none');

    // Update table message if no results exist
    const tbody = document.getElementById('resultsTableBody');
    if (tbody.children.length === 1 && tbody.children[0].children.length === 1) {
        // Only update if showing "Test in progress..." message
        if (tbody.innerHTML.includes('Test in progress')) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>Test failed: ${error}
                    </td>
                </tr>
            `;
        }
    }

    showError('Test error: ' + error);
    const btn = document.getElementById('mainDownloadDropdown');
    if (btn) btn.disabled = false;
}



function checkTestStatus() {
    fetch(`/api/test_status/${currentTestType}`)
        .then(response => response.json())
        .then(data => {
            if (data.running) {
                testStarted();
            } else {
                // Ensure button is in start state
                const startStopBtn = document.getElementById('startStopBtn');
                startStopBtn.disabled = false;
                startStopBtn.innerHTML = '<i class="fas fa-play me-1"></i>Start Test';
                startStopBtn.classList.remove('btn-danger');
                startStopBtn.classList.add('btn-success');
            }
        })
        .catch(error => {
            console.error('Error checking test status:', error);
        });
}

let logRefreshInterval;

function startLogRefresh() {
    // Refresh logs every 2 seconds while test is running
    logRefreshInterval = setInterval(refreshLogs, 2000);
}

function stopLogRefresh() {
    if (logRefreshInterval) {
        clearInterval(logRefreshInterval);
        logRefreshInterval = null;
    }
}

function refreshLogs() {
    fetch(`/api/logs/${currentTestType}`)
        .then(response => response.json())
        .then(data => {
            const logContent = document.getElementById('logContent');
            logContent.textContent = data.logs || 'No logs available';

            // Auto-scroll to bottom
            logContent.scrollTop = logContent.scrollHeight;
        })
        .catch(error => {
            console.error('Error refreshing logs:', error);
        });
}

function downloadLogs() {
    window.open(`/download_logs/${currentTestType}`, '_blank');
}

// Test Result download function for different formats
function downloadWisunTree(format) {
    console.log('downloadTestResult called with format:', format);

    // Show loading state
    const dropdown = document.querySelector('#mainDownloadDropdown');
    console.log('Found dropdown element:', dropdown);

    if (dropdown) {
        const originalText = dropdown.innerHTML;
        dropdown.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Downloading...';
        dropdown.disabled = true;

        // Reset button after 3 seconds
        setTimeout(() => {
            dropdown.innerHTML = originalText;
            dropdown.disabled = false;
        }, 3000);
    }

    // Download the test result file
    const url = `/api/test_result/download/${currentTestType}/${format}`;
    console.log('Opening URL:', url);
    window.open(url, '_blank');
}// Utility functions for notifications
function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'danger');
}

function showWarning(message) {
    showNotification(message, 'warning');
}

function showInfo(message) {
    showNotification(message, 'info');
}

function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';

    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Any additional initialization can go here
    console.log('Test page loaded');
});

// Retest individual device function
function retestDevice(ip, label, deviceId) {
    console.log(`Retesting device: ${label} (${ip})`);

    // Get current test parameters
    const formData = new FormData(document.getElementById('testForm'));
    const parameters = {};
    for (let [key, value] of formData.entries()) {
        if (!isNaN(value) && value !== '') {
            parameters[key] = Number(value);
        } else {
            parameters[key] = value;
        }
    }

    // Update button to show testing state
    const button = document.getElementById(`retest_${deviceId}`);
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Testing...';
        button.className = 'btn btn-info btn-sm';
    }

    // Send retest request
    fetch('/api/retest_device', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            test_type: currentTestType,
            ip: ip,
            label: label,
            parameters: parameters
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showInfo(`Retest started for ${label}`);
                // The result will come via socket event and update the table
            } else {
                showError(`Failed to start retest: ${data.error}`);
                // Reset button on error
                resetRetestButton(deviceId, ip, label);
            }
        })
        .catch(error => {
            showError(`Network error: ${error.message}`);
            resetRetestButton(deviceId, ip, label);
        });
}

function resetRetestButton(deviceId, ip, label) {
    const button = document.getElementById(`retest_${deviceId}`);
    if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-redo me-1"></i>Retest';
        button.className = 'btn btn-outline-secondary btn-sm';
    }
}

function updateDeviceInTable(deviceResult) {
    console.log('Updating existing device in table:', deviceResult);
    const tbody = document.getElementById('resultsTableBody');
    const deviceId = deviceResult.ip.replace(/[^a-zA-Z0-9]/g, '_');

    // Find existing row for this IP
    const rows = tbody.getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const ipCell = row.cells[0]; // First cell contains IP
        if (ipCell && ipCell.textContent.trim() === deviceResult.ip) {
            // Update the existing row
            const isFailedTest = deviceResult.loss_percent === 100 || deviceResult.packets_rx === 0;
            const buttonClass = isFailedTest ? 'btn-warning' : 'btn-outline-secondary';
            const buttonText = isFailedTest ? 'Retry' : 'Retest';
            const buttonIcon = isFailedTest ? 'fa-exclamation-triangle' : 'fa-redo';

            row.innerHTML = `
                <td class="ip-column">${deviceResult.ip}</td>
                <td>${deviceResult.label || '-'}</td>
                <td class="metric-column">${deviceResult.packets_tx || '-'}</td>
                <td class="metric-column">${deviceResult.packets_rx || '-'}</td>
                <td class="metric-column ${getStatusClass(deviceResult.loss_percent)}">${deviceResult.loss_percent !== undefined ? deviceResult.loss_percent + '%' : '-'}</td>
                <td class="metric-column">${deviceResult.min_time || '-'}</td>
                <td class="metric-column">${deviceResult.max_time || '-'}</td>
                <td class="metric-column">${deviceResult.avg_time || '-'}</td>
                <td class="metric-column">${deviceResult.mdev_time || '-'}</td>
                <td class="${getStatusClass(deviceResult.loss_percent)}">${getStatusText(deviceResult.loss_percent)}</td>
                <td class="text-center">
                    <button class="btn ${buttonClass} btn-sm" 
                            onclick="retestDevice('${deviceResult.ip}', '${deviceResult.label}', '${deviceId}')"
                            id="retest_${deviceId}">
                        <i class="fas ${buttonIcon} me-1"></i>${buttonText}
                    </button>
                </td>
            `;

            showSuccess(`Retest completed for ${deviceResult.label}`);
            return;
        }
    }

    // If not found, add as new row (shouldn't happen normally)
    updateResultsTable(deviceResult);
}