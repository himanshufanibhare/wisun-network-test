// RPL Test JavaScript functionality
let socket;
let currentTestType = 'rpl';
let testRunning = false;

function initializeTestPage() {
    // Initialize Socket.IO connection
    socket = io();

    // Set up event listeners
    setupEventListeners();

    // Set up Socket.IO event handlers
    setupSocketHandlers();

    // Check if test is already running
    checkTestStatus();
    
    // Initialize Wi-SUN tree functionality
    initializeWisunTreeFeatures();
}

function setupEventListeners() {
    // Test form submission
    document.getElementById('testForm').addEventListener('submit', function (e) {
        e.preventDefault();
        startTest();
    });

    // Stop button
    document.getElementById('stopBtn').addEventListener('click', function () {
        stopTest();
    });

    // Pause/Resume button
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.addEventListener('click', function () {
            if (pauseBtn.dataset && pauseBtn.dataset.paused === 'true') {
                resumeTest();
            } else {
                pauseTest();
            }
        });
    }

    // Stop test when user navigates away or refreshes page
    window.addEventListener('beforeunload', function () {
        if (testRunning) {
            stopTest();
        }
    });

    // Stop test when page visibility changes (tab switch, minimize, etc.)
    // DISABLED: This was causing tests to stop automatically when switching tabs
    // document.addEventListener('visibilitychange', function () {
    //     if (document.hidden && testRunning) {
    //         stopTest();
    //     }
    // });
}

function setupSocketHandlers() {
    socket.on('connect', function () {
        console.log('Connected to server via Socket.IO');
    });

    socket.on('test_progress', function (data) {
        if (data.test_type === currentTestType) {
            if (data.device_result) {
                updateResultsTable(data.device_result);
            }
            if (data.current !== undefined && data.total !== undefined) {
                const spinnerText = document.getElementById('testSpinnerText');
                if (spinnerText) {
                    // Only update if we have valid progress data (not stale data)
                    if (data.current >= 0 && data.total > 0) {
                        spinnerText.textContent = `RPL test in progress... (${data.current}/${data.total})`;
                    }
                }
            }
        }
    });

    socket.on('test_started', function (data) {
        if (data.test_type === currentTestType) {
            // Reset progress display when test starts
            const spinnerText = document.getElementById('testSpinnerText');
            if (spinnerText) {
                spinnerText.textContent = 'RPL test in progress... (0/0)';
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
            const pauseBtn = document.getElementById('pauseBtn');
            if (pauseBtn) {
                pauseBtn.innerHTML = '<i class="fas fa-play me-1"></i>Resume';
                pauseBtn.classList.remove('btn-warning');
                pauseBtn.classList.add('btn-success');
                pauseBtn.disabled = false;
                pauseBtn.dataset.paused = 'true';
            }
            const testSpinner = document.getElementById('testSpinner');
            if (testSpinner) {
                testSpinner.classList.add('d-none');
            }
            showWarning('RPL test paused');
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
            const testSpinner = document.getElementById('testSpinner');
            if (testSpinner) {
                testSpinner.classList.remove('d-none');
            }
            showSuccess('RPL test resumed');
        }
    });

    socket.on('test_error', function (data) {
        if (data.test_type === currentTestType) {
            testError(data.error);
        }
    });

    socket.on('device_retest_result', function (data) {
        if (data.test_type === currentTestType) {
            updateDeviceInTable(data.device_result);
        }
    });

    socket.on('device_retest_error', function (data) {
        if (data.test_type === currentTestType) {
            showError(`RPL retest failed for ${data.label}: ${data.error}`);
            const deviceId = data.ip.replace(/[^a-zA-Z0-9]/g, '_');
            resetRetestButton(deviceId, data.ip, data.label);
        }
    });
}

function startTest() {
    if (testRunning) {
        console.log('RPL test already running, ignoring start request');
        return;
    }

    const formData = new FormData(document.getElementById('testForm'));
    const parameters = {};

    for (let [key, value] of formData.entries()) {
        if (!isNaN(value) && value !== '') {
            parameters[key] = Number(value);
        } else {
            parameters[key] = value;
        }
    }

    const requestData = {
        test_type: currentTestType,
        parameters: parameters
    };

    document.getElementById('startBtn').disabled = true;

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
                document.getElementById('startBtn').disabled = false;
                showError('Failed to start RPL test: ' + data.error);
            }
        })
        .catch(error => {
            document.getElementById('startBtn').disabled = false;
            showError('Network error: ' + error.message);
        });
}

function stopTest() {
    const requestData = { test_type: currentTestType };

    document.getElementById('stopBtn').disabled = true;
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
                console.log('RPL test stop request sent');
            } else {
                document.getElementById('stopBtn').disabled = false;
                testRunning = true;
                showError('Failed to stop RPL test: ' + data.error);
            }
        })
        .catch(error => {
            document.getElementById('stopBtn').disabled = false;
            testRunning = true;
            showError('Network error: ' + error.message);
        });
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
                console.log('RPL test pause request sent');
            } else {
                showError('Failed to pause RPL test: ' + data.error);
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
                console.log('RPL test resume request sent');
            } else {
                showError('Failed to resume RPL test: ' + data.error);
            }
        })
        .catch(err => showError('Network error: ' + err.message));
}

function testStarted() {
    testRunning = true;

    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.disabled = false;
        pauseBtn.dataset.paused = 'false';
        pauseBtn.innerHTML = '<i class="fas fa-pause me-1"></i>Pause';
        pauseBtn.classList.remove('btn-success');
        pauseBtn.classList.add('btn-warning');
    }

    const testSpinner = document.getElementById('testSpinner');
    if (testSpinner) {
        testSpinner.classList.remove('d-none');
    }

    const summaryEl = document.getElementById('testSummary');
    if (summaryEl) summaryEl.textContent = '';

    clearResultsTable();
}

function clearResultsTable() {
    const tbody = document.getElementById('resultsTableBody');
    // Completely clear the table
    tbody.innerHTML = '';

    // Reset progress display
    const spinnerText = document.getElementById('testSpinnerText');
    if (spinnerText) {
        spinnerText.textContent = 'RPL test in progress... (0/0)';
    }

    // Clear summary
    const summaryEl = document.getElementById('testSummary');
    if (summaryEl) {
        summaryEl.textContent = '';
    }
}

function updateResultsTable(deviceResult) {
    const tbody = document.getElementById('resultsTableBody');

    if (tbody.children.length === 1 && tbody.children[0].children.length === 1) {
        tbody.innerHTML = '';
    }

    const existingRow = document.querySelector(`tr[data-device-ip="${deviceResult.ip}"]`);

    let srNo = deviceResult.sr_no !== undefined ? deviceResult.sr_no : null;
    if (srNo === null) {
        if (existingRow) {
            const firstCell = existingRow.querySelector('td:first-child');
            const parsed = firstCell ? parseInt(firstCell.textContent) : NaN;
            srNo = Number.isInteger(parsed) ? parsed : 1;
        } else {
            const existingRows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
            srNo = existingRows.length + 1;
        }
    }

    // Determine if this is a failed test and set button accordingly
    const isFailedTest = deviceResult.connection_status === 'Disconnected' || 
                        deviceResult.connection_status === 'Failed' ||
                        deviceResult.status === 'Failed' || 
                        deviceResult.status === 'Error' || 
                        deviceResult.status === 'Offline';
    const buttonClass = isFailedTest ? 'btn-warning' : 'btn-outline-secondary';
    const buttonText = isFailedTest ? 'Retry' : 'Retest';
    const buttonIcon = isFailedTest ? 'fa-exclamation-triangle' : 'fa-redo';

    const deviceId = deviceResult.ip.replace(/[^a-zA-Z0-9]/g, '_');
    // Determine status display based on connection status
    let statusHTML;
    if (deviceResult.connection_status === 'Skipped') {
        statusHTML = `<span class="badge bg-secondary"><i class="fas fa-minus-circle"></i> Skipped</span>`;
    } else if (deviceResult.status === 'Connected' || deviceResult.connection_status === 'Connected') {
        statusHTML = `<span class="badge bg-success"><i class="fas fa-check"></i> Connected</span>`;
    } else if (deviceResult.status === 'Disconnected' || deviceResult.connection_status === 'Disconnected') {
        statusHTML = `<span class="badge bg-danger"><i class="fas fa-times"></i> Failed</span>`;
    } else {
        statusHTML = `<span class="badge bg-warning text-dark"><i class="fas fa-clock"></i> In Progress</span>`;
    }

    const rowHTML = `
        <td class="sr-no">${srNo}</td>
        <td class="ip-address">${deviceResult.ip}</td>
        <td class="device-label">${deviceResult.label || '-'}</td>
        <td class="hop-count">${deviceResult.hop_count === -1 ? '-' : (deviceResult.hop_count || '-')}</td>
        <td class="rpl-rank">${deviceResult.rpl_data || '-'}</td>
        <td class="status">${statusHTML}</td>
        <td>
            <button class="btn ${buttonClass} btn-sm" 
                    onclick="retestDevice('${deviceResult.ip}', '${deviceResult.label}', '${deviceId}')"
                    id="retest_${deviceId}">
                <i class="fas ${buttonIcon} me-1"></i>${buttonText}
            </button>
        </td>
    `;

    if (existingRow) {
        existingRow.innerHTML = rowHTML;
    } else {
        const row = document.createElement('tr');
        row.setAttribute('data-device-ip', deviceResult.ip);
        row.innerHTML = rowHTML;
        tbody.appendChild(row);
    }
}

function populateResultsTable(results) {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = '';

    if (!results || results.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">
                    <i class="fas fa-exclamation-circle me-2"></i>No RPL results available
                </td>
            </tr>
        `;
        return;
    }

    results.forEach(result => {
        updateResultsTable(result);
    });
}

function testCompleted() {
    testRunning = false;

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    const testSpinner = document.getElementById('testSpinner');
    if (testSpinner) {
        testSpinner.classList.add('d-none');
    }

    // Enable all retest buttons
    const retestButtons = document.querySelectorAll('#resultsTableBody button[id^="retest_"]');
    retestButtons.forEach(button => {
        button.disabled = false;
    });

    showSuccess('RPL test completed successfully!');

    fetch(`/api/test_status/${currentTestType}`)
        .then(res => res.json())
        .then(data => {
            const summaryEl = document.getElementById('testSummary');
            if (data && data.summary && summaryEl) {
                summaryEl.textContent = data.summary;
            }

            // Enable download button
            const downloadBtn = document.getElementById('downloadReportBtn');
            if (downloadBtn) {
                downloadBtn.disabled = false;
                // Remove old event listener by cloning
                const newBtn = downloadBtn.cloneNode(true);
                downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

                newBtn.addEventListener('click', function () {
                    // Get the selected output format from the form
                    const outputFormat = document.querySelector('select[name="output_format"]').value;
                    
                    // First regenerate the report with latest table data, then download
                    regenerateReportWithUpdatedResults()
                        .then(() => {
                            // After regeneration is complete, trigger download
                            window.location.href = `/api/test_result/download/${currentTestType}/${outputFormat}`;
                        })
                        .catch(error => {
                            console.error('Failed to regenerate report before download:', error);
                            // Still try to download the existing file
                            window.location.href = `/api/test_result/download/${currentTestType}/${outputFormat}`;
                        });
                });
            }
        });
}

function testStopped() {
    testRunning = false;

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.disabled = true;
        pauseBtn.innerHTML = '<i class="fas fa-pause me-1"></i>Pause';
        pauseBtn.classList.remove('btn-success');
        pauseBtn.classList.add('btn-warning');
        pauseBtn.dataset.paused = 'false';
    }

    const testSpinner = document.getElementById('testSpinner');
    if (testSpinner) {
        testSpinner.classList.add('d-none');
    }

    const tbody = document.getElementById('resultsTableBody');
    if (tbody.children.length === 1 && tbody.children[0].children.length === 1) {
        if (tbody.innerHTML.includes('Test in progress')) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center text-warning">
                        <i class="fas fa-stop-circle me-2"></i>RPL test was stopped by user. No results to display.
                    </td>
                </tr>
            `;
        }
    }

    showWarning('RPL test was stopped by user');

    fetch(`/api/test_status/${currentTestType}`)
        .then(res => res.json())
        .then(data => {
            const summaryEl = document.getElementById('testSummary');
            if (data && data.summary && summaryEl) summaryEl.textContent = data.summary;
            const btn = document.getElementById('downloadLogBtn');
            if (btn) btn.disabled = false;
        });

    fetch(`/api/test_status/${currentTestType}`)
        .then(res => res.json())
        .then(data => {
            const summaryEl = document.getElementById('testSummary');
            if (data && data.summary && summaryEl) summaryEl.textContent = data.summary;
            const btn = document.getElementById('downloadLogBtn');
            if (btn) btn.disabled = false;
        });
}

function testError(error) {
    testRunning = false;

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    const testSpinner = document.getElementById('testSpinner');
    if (testSpinner) {
        testSpinner.classList.add('d-none');
    }

    const tbody = document.getElementById('resultsTableBody');
    if (tbody.children.length === 1 && tbody.children[0].children.length === 1) {
        if (tbody.innerHTML.includes('Test in progress')) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>RPL test failed: ${error}
                    </td>
                </tr>
            `;
        }
    }

    showError('RPL test error: ' + error);
    const btn = document.getElementById('downloadLogBtn');
    if (btn) btn.disabled = false;
}

function checkTestStatus() {
    fetch(`/api/test_status/${currentTestType}`)
        .then(response => response.json())
        .then(data => {
            if (data.running) {
                testStarted();
            }
        })
        .catch(error => {
            console.error('Error checking RPL test status:', error);
        });
}

function retestDevice(ip, label, deviceId) {
    console.log(`Retesting RPL for device: ${label} (${ip})`);

    const formData = new FormData(document.getElementById('testForm'));
    const parameters = {};
    for (let [key, value] of formData.entries()) {
        if (!isNaN(value) && value !== '') {
            parameters[key] = Number(value);
        } else {
            parameters[key] = value;
        }
    }

    const button = document.getElementById(`retest_${deviceId}`);
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Testing...';
        button.className = 'btn btn-info btn-sm';
    }

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
                showInfo(`RPL retest started for ${label}`);
            } else {
                showError(`Failed to start RPL retest: ${data.error}`);
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
    updateResultsTable(deviceResult);
    showSuccess(`RPL retest completed for ${deviceResult.label}`);
    
    // Update summary after retest with a small delay to ensure DOM is updated
    setTimeout(() => {
        updateSummaryFromTable();
    }, 100);
    
    // Trigger report regeneration with updated results
    regenerateReportWithUpdatedResults();
}

// Update summary based on current table data
function updateSummaryFromTable() {
    const rows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
    let successCount = 0;
    let skippedCount = 0;

    // Count successes and skipped rows. Skipped rows must not be included in the summary denominator.
    rows.forEach(row => {
        const cells = row.cells;
        let statusText = '';

        // Look for the status cell (usually the one before the last column)
        if (cells.length >= 2) {
            statusText = cells[cells.length - 2].textContent.trim(); // Status is usually second to last
        }

        // If the row is explicitly Skipped, increment skippedCount and skip it from further calculations
        if (statusText && statusText.toLowerCase().includes('skipped')) {
            skippedCount++;
            return; // skip this row
        }

        // Consider success if status is not Failed, Error, or Offline
        if (statusText && statusText !== 'Failed' && statusText !== 'Error' && statusText !== 'Offline') {
            successCount++;
        }
    });

    // Compute displayed denominator excluding skipped nodes
    const TOTAL_DEVICES = 28; // Total devices in FAN11_FSK_IPV6
    const consideredDevices = Math.max(0, TOTAL_DEVICES - skippedCount);

    if (consideredDevices > 0) {
        const successRate = (successCount / consideredDevices * 100).toFixed(1);
        const summaryEl = document.getElementById('testSummary');
        if (summaryEl) {
            // Preserve duration if it exists in the current summary text
            const originalSummary = summaryEl.textContent || '';
            const durationMatch = originalSummary.match(/ - Duration: (.+)$/);
            const durationStr = durationMatch ? ` - Duration: ${durationMatch[1]}` : '';

            summaryEl.textContent = `SUMMARY: ${successCount}/${consideredDevices} devices responded (${successRate}% success rate)${durationStr}`;
        }
    }
}

// Utility functions for notifications
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

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Regenerate report files with updated test results
function regenerateReportWithUpdatedResults() {
    const outputFormat = document.querySelector('select[name="output_format"]').value;
    
    // Get current test results from table
    const tableResults = getCurrentTableResults();
    
    // Send to backend to regenerate report
    return fetch('/api/regenerate_report', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            test_type: currentTestType,
            output_format: outputFormat,
            results: tableResults,
            summary: document.getElementById('testSummary').textContent
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('RPL report regenerated successfully');
            return data;
        } else {
            console.error('Failed to regenerate RPL report:', data.error);
            throw new Error(data.error);
        }
    })
    .catch(error => {
        console.error('Error regenerating RPL report:', error);
        throw error;
    });
}

// Extract current results from the table
function getCurrentTableResults() {
    const rows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
    const results = [];
    
    rows.forEach(row => {
        const cells = row.cells;
        
        // Extract connection status from the status cell
        const statusCell = cells[5]; // Status column
        let connectionStatus = 'Unknown';
        let status = 'Failed';
        
        // Check the badge content in the status cell
        const badge = statusCell.querySelector('.badge');
        if (badge) {
            const badgeText = badge.textContent.trim();
            if (badgeText.includes('Connected')) {
                connectionStatus = 'Connected';
                status = 'Success';
            } else if (badgeText.includes('Failed')) {
                connectionStatus = 'Disconnected';
                status = 'Failed';
            }
        } else {
            // Fallback: check full cell text content
            const cellText = statusCell.textContent.trim();
            if (cellText.includes('Connected') || cellText.includes('Success')) {
                connectionStatus = 'Connected';
                status = 'Success';
            } else if (cellText.includes('Failed') || cellText.includes('Error')) {
                connectionStatus = 'Disconnected';
                status = 'Failed';
            }
        }
        
        results.push({
            sr_no: parseInt(cells[0].textContent) || 0,
            ip: cells[1].textContent,
            device_label: cells[2].textContent, // Use device_label to match backend expectations
            hop_count: cells[3].textContent,
            rpl_rank: cells[4].textContent,
            status: status,
            connection_status: connectionStatus
        });
    });
    
    return results;
}

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    console.log('RPL test page loaded');
});

// Wi-SUN Tree functionality
function initializeWisunTreeFeatures() {
    const wisunTreeBtn = document.getElementById('wisunTreeBtn');
    const refreshTreeBtn = document.getElementById('refreshTreeBtn');
    const connectedNodesBtn = document.getElementById('connectedNodesBtn');
    const disconnectedNodesBtn = document.getElementById('disconnectedNodesBtn');
    
    if (!wisunTreeBtn) {
        console.log('Wi-SUN tree button not found, skipping initialization');
        return;
    }

    const wisunTreeModal = new bootstrap.Modal(document.getElementById('wisunTreeModal'), {
        backdrop: true,
        keyboard: true,
        focus: true
    });

    // Show modal and fetch tree data when button is clicked
    wisunTreeBtn.addEventListener('click', function () {
        // Ensure any existing backdrop is removed before showing
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
        document.body.classList.remove('modal-open');
        document.body.style.paddingRight = '';
        
        wisunTreeModal.show();
        fetchWisunTreeData();
    });

    // Ensure proper cleanup when modal is hidden
    document.getElementById('wisunTreeModal').addEventListener('hidden.bs.modal', function () {
        // Clean up any remaining backdrop
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
        document.body.classList.remove('modal-open');
        document.body.style.paddingRight = '';
        document.body.style.overflow = '';
    });

    // Refresh tree data when refresh button is clicked
    if (refreshTreeBtn) {
        refreshTreeBtn.addEventListener('click', function () {
            fetchWisunTreeData();
        });
    }

    // Show connected nodes when button is clicked
    if (connectedNodesBtn) {
        connectedNodesBtn.addEventListener('click', function () {
            fetchConnectedNodes();
        });
    }

    // Show disconnected nodes when button is clicked
    if (disconnectedNodesBtn) {
        disconnectedNodesBtn.addEventListener('click', function () {
            fetchDisconnectedNodes();
        });
    }

    function hideAllContent() {
        const elements = ['wisunTreeContent', 'connectedNodesContent', 'disconnectedNodesContent'];
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.classList.add('d-none');
        });
    }

    function showLoading(message = 'Fetching Wi-SUN data...') {
        const loadingElement = document.getElementById('wisunTreeLoading');
        const errorElement = document.getElementById('wisunTreeError');
        const loadingText = document.querySelector('#wisunTreeLoading p');
        
        if (loadingElement) loadingElement.classList.remove('d-none');
        if (errorElement) errorElement.classList.add('d-none');
        if (loadingText) loadingText.textContent = message;
        hideAllContent();
    }

    function hideLoading() {
        const loadingElement = document.getElementById('wisunTreeLoading');
        if (loadingElement) loadingElement.classList.add('d-none');
    }

    function showError(errorText) {
        hideLoading();
        const errorTextElement = document.getElementById('wisunTreeErrorText');
        const errorElement = document.getElementById('wisunTreeError');
        
        if (errorTextElement) errorTextElement.textContent = errorText;
        if (errorElement) errorElement.classList.remove('d-none');
    }

    function fetchWisunTreeData() {
        showLoading('Fetching Wi-SUN tree status...');
        if (refreshTreeBtn) refreshTreeBtn.disabled = true;

        fetch('/api/wisun_tree')
            .then(response => response.json())
            .then(data => {
                hideLoading();
                if (refreshTreeBtn) refreshTreeBtn.disabled = false;

                if (data.success) {
                    document.getElementById('wisunTreeTimestamp').textContent = data.timestamp;
                    document.getElementById('wisunTreeDeviceCount').textContent = data.device_count || 0;
                    document.getElementById('wisunTreeOutput').textContent = data.output;
                    document.getElementById('wisunTreeContent').classList.remove('d-none');
                } else {
                    showError(data.error);
                }
            })
            .catch(error => {
                hideLoading();
                showError('Network error: ' + error.message);
                if (refreshTreeBtn) refreshTreeBtn.disabled = false;
            });
    }

    function fetchConnectedNodes() {
        showLoading('Fetching connected nodes...');

        fetch('/api/wisun_nodes/connected')
            .then(response => response.json())
            .then(data => {
                hideLoading();

                if (data.success) {
                    document.getElementById('connectedNodesTimestamp').textContent = data.timestamp;
                    document.getElementById('connectedNodesCount').textContent = data.count;
                    document.getElementById('connectedNodesTotalCount').textContent = data.total_nodes;
                    
                    const rawTextHtml = createNodesRawText(data.nodes, 'connected');
                    document.getElementById('connectedNodesList').innerHTML = rawTextHtml;
                    document.getElementById('connectedNodesContent').classList.remove('d-none');
                } else {
                    showError(data.error);
                }
            })
            .catch(error => {
                hideLoading();
                showError('Network error: ' + error.message);
            });
    }

    function fetchDisconnectedNodes() {
        showLoading('Fetching disconnected nodes...');

        fetch('/api/wisun_nodes/disconnected')
            .then(response => response.json())
            .then(data => {
                hideLoading();

                if (data.success) {
                    document.getElementById('disconnectedNodesTimestamp').textContent = data.timestamp;
                    document.getElementById('disconnectedNodesCount').textContent = data.count;
                    document.getElementById('disconnectedNodesTotalCount').textContent = data.total_nodes;
                    
                    const rawTextHtml = createNodesRawText(data.nodes, 'disconnected');
                    document.getElementById('disconnectedNodesList').innerHTML = rawTextHtml;
                    document.getElementById('disconnectedNodesContent').classList.remove('d-none');
                } else {
                    showError(data.error);
                }
            })
            .catch(error => {
                hideLoading();
                showError('Network error: ' + error.message);
            });
    }

    function createNodesRawText(nodes, type) {
        if (!nodes || nodes.length === 0) {
            return `<div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                No ${type} nodes found.
            </div>`;
        }

        let rawText = "Sr No".padEnd(8) + "Device Name".padEnd(25) + "IP Address".padEnd(42) + "Hop Count".padEnd(15) + "Pole No\n";

        // Add separator line
        rawText += "─".repeat(100) + "\n";

        nodes.forEach((node, index) => {
            const serialNo = `${index + 1}.`.padEnd(8);
            const deviceName = node.device_name.padEnd(25);
            const ipAddress = node.ip.padEnd(42);
            const hopCount = (node.hop_count !== undefined ? node.hop_count.toString() : '-').padEnd(15);
            const poleNumber = node.pole_number || 'Unknown';
            
            rawText += `${serialNo}${deviceName}${ipAddress}${hopCount}${poleNumber}\n`;
        });

        return `<pre class="bg-dark text-light p-3 rounded" style="max-height: 500px; overflow-y: auto; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre;">${rawText}</pre>`;
    }

    function createNodesTable(nodes, type) {
        if (!nodes || nodes.length === 0) {
            return `<div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                No ${type} nodes found.
            </div>`;
        }

        let tableHtml = `
            <table class="table table-striped table-hover">
                <thead class="table-dark">
                    <tr>
                        <th>#</th>
                        <th>Device Name</th>
                        <th>IP Address</th>
                        <th>Hop Count</th>
                        <th>Pole No</th>
                    </tr>
                </thead>
                <tbody>`;

        nodes.forEach((node, index) => {
            const statusClass = type === 'connected' ? 'text-success' : 'text-danger';
            const statusIcon = type === 'connected' ? 'fa-check-circle' : 'fa-times-circle';
            
            tableHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td class="${statusClass}">
                        <i class="fas ${statusIcon} me-1"></i>
                        ${node.device_name}
                    </td>
                    <td class="font-monospace">${node.ip}</td>
                    <td>${node.hop_count !== undefined ? node.hop_count : '-'}</td>
                    <td>${node.pole_number || 'Unknown'}</td>
                </tr>`;
        });

        tableHtml += `
                </tbody>
            </table>`;

        return tableHtml;
    }
}
document.addEventListener('DOMContentLoaded', function () {
    console.log('RPL test page loaded');
});