// Disconnections Test JavaScript functionality
let socket;
let currentTestType = 'disconnections';
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
                        spinnerText.textContent = `Disconnections test in progress... (${data.current}/${data.total})`;
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
                spinnerText.textContent = 'Disconnections test in progress... (0/0)';
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
            document.getElementById('testSpinner').classList.add('d-none');
            showWarning('Disconnections test paused');
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
            document.getElementById('testSpinner').classList.remove('d-none');
            showSuccess('Disconnections test resumed');
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
            showError(`Disconnections retest failed for ${data.label}: ${data.error}`);
            const deviceId = data.ip.replace(/[^a-zA-Z0-9]/g, '_');
            resetRetestButton(deviceId, data.ip, data.label);
        }
    });
}

function startTest() {
    if (testRunning) {
        console.log('Disconnections test already running, ignoring start request');
        return;
    }

    // Reset progress text immediately when starting
    const spinnerText = document.getElementById('testSpinnerText');
    if (spinnerText) {
        spinnerText.textContent = 'Disconnections test in progress... (0/0)';
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
                showError('Failed to start disconnections test: ' + data.error);
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
                console.log('Disconnections test stop request sent');
            } else {
                document.getElementById('stopBtn').disabled = false;
                testRunning = true;
                showError('Failed to stop disconnections test: ' + data.error);
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
                console.log('Disconnections test pause request sent');
            } else {
                showError('Failed to pause disconnections test: ' + data.error);
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
                console.log('Disconnections test resume request sent');
            } else {
                showError('Failed to resume disconnections test: ' + data.error);
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

    document.getElementById('testSpinner').classList.remove('d-none');

    // Reset progress text to 0/0 when starting new test
    const spinnerText = document.getElementById('testSpinnerText');
    if (spinnerText) {
        spinnerText.textContent = 'Disconnections test in progress... (0/0)';
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
        spinnerText.textContent = 'Disconnections test in progress... (0/0)';
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
    const isFailedTest = deviceResult.status && (deviceResult.status.includes('NO RESPONSE') || deviceResult.status === 'Failed' || deviceResult.status === 'Error');
    const buttonClass = isFailedTest ? 'btn-warning' : 'btn-outline-primary';
    const buttonText = isFailedTest ? 'Retry' : 'Retest';
    const buttonIcon = isFailedTest ? 'fa-exclamation-triangle' : 'fa-redo';

    const deviceId = deviceResult.ip.replace(/[^a-zA-Z0-9]/g, '_');
    // Determine status display
    let statusHTML;
    if (deviceResult.connection_status === 'Skipped') {
        statusHTML = `<span class="badge bg-secondary"><i class="fas fa-minus-circle"></i> Skipped</span>`;
    } else if (deviceResult.status && deviceResult.status.includes('RESPONSE ✅')) {
        statusHTML = `<span class="badge bg-success"><i class="fas fa-check"></i> Connected</span>`;
    } else if (deviceResult.status && deviceResult.status.includes('NO RESPONSE ❌')) {
        statusHTML = `<span class="badge bg-danger"><i class="fas fa-times"></i> Disconnected</span>`;
    } else {
        statusHTML = `<span class="badge bg-warning text-dark"><i class="fas fa-clock"></i> In Progress</span>`;
    }

    const rowHTML = `
                                <td class="srno">${srNo}</td>
                                <td class="ip-address">${deviceResult.ip}</td>
                                <td class="device-label">${deviceResult.label || '-'}</td>
                                <td class="hop-count">${deviceResult.hop_count === -1 ? '-' : (deviceResult.hop_count || '-')}</td>
                                <td class="disconnected-total">${deviceResult.disconnected_total || '-'}</td>
                                <td class="status">
                                    ${statusHTML}
                                </td>
                                <td class="retest">
                                    <button class="btn btn-sm ${buttonClass}" id="retest_${deviceId}" onclick="retestDevice('${deviceResult.ip}', '${deviceResult.label}', '${deviceId}')">
                                        <i class="fas ${buttonIcon}"></i> ${buttonText}
                                    </button>
                                </td>
                        `; if (existingRow) {
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
                    <i class="fas fa-exclamation-circle me-2"></i>No disconnections results available
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
    document.getElementById('testSpinner').classList.add('d-none');

    // Enable all retest buttons
    const retestButtons = document.querySelectorAll('#resultsTableBody button[id^="retest_"]');
    retestButtons.forEach(button => {
        button.disabled = false;
    });

    showSuccess('Disconnections test completed successfully!');

    fetch(`/api/test_status/${currentTestType}`)
        .then(res => res.json())
        .then(data => {
            const summaryEl = document.getElementById('testSummary');
            if (data && data.summary) {
                summaryEl.textContent = data.summary;
            } else {
                summaryEl.textContent = 'Disconnections test completed.';
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

    document.getElementById('testSpinner').classList.add('d-none');

    const tbody = document.getElementById('resultsTableBody');
    if (tbody.children.length === 1 && tbody.children[0].children.length === 1) {
        if (tbody.innerHTML.includes('Test in progress')) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center text-warning">
                        <i class="fas fa-stop-circle me-2"></i>Disconnections test was stopped by user. No results to display.
                    </td>
                </tr>
            `;
        }
    }

    showWarning('Disconnections test was stopped by user');

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
            if (data && data.summary) summaryEl.textContent = data.summary;
            const btn = document.getElementById('downloadLogBtn');
            if (btn) btn.disabled = false;
        });
}

function testError(error) {
    testRunning = false;

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('testSpinner').classList.add('d-none');

    const tbody = document.getElementById('resultsTableBody');
    if (tbody.children.length === 1 && tbody.children[0].children.length === 1) {
        if (tbody.innerHTML.includes('Test in progress')) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>Disconnections test failed: ${error}
                    </td>
                </tr>
            `;
        }
    }

    showError('Disconnections test error: ' + error);
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
            console.error('Error checking disconnections test status:', error);
        });
}

function retestDevice(ip, label, deviceId) {
    console.log(`Retesting disconnections for device: ${label} (${ip})`);

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

    // Set a safety timeout to reset button if no response after 3 minutes
    const safetyTimeout = setTimeout(() => {
        console.log(`Safety timeout triggered for device ${ip}`);
        showWarning(`Retest timeout for ${label} - resetting button`);
        resetRetestButton(deviceId, ip, label);
    }, 180000); // 3 minutes

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
                showInfo(`Disconnections retest started for ${label}`);
                // Store the timeout ID so we can clear it when the result comes back
                if (button) {
                    button.dataset.safetyTimeout = safetyTimeout;
                }
            } else {
                clearTimeout(safetyTimeout);
                showError(`Failed to start disconnections retest: ${data.error}`);
                resetRetestButton(deviceId, ip, label);
            }
        })
        .catch(error => {
            clearTimeout(safetyTimeout);
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
    // Clear safety timeout if it exists
    const deviceId = deviceResult.ip.replace(/[^a-zA-Z0-9]/g, '_');
    const button = document.getElementById(`retest_${deviceId}`);
    if (button && button.dataset.safetyTimeout) {
        clearTimeout(parseInt(button.dataset.safetyTimeout));
        delete button.dataset.safetyTimeout;
    }
    
    updateResultsTable(deviceResult);
    showSuccess(`Disconnections retest completed for ${deviceResult.label}`);
    // Update summary after retest
    updateSummaryFromTable();
    
    // Trigger report regeneration with updated results
    regenerateReportWithUpdatedResults();
}

// Update summary based on current table data
function updateSummaryFromTable() {
    const rows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
    let successCount = 0;
    let totalCount = rows.length;

    rows.forEach(row => {
        const cells = row.cells;
        let isSuccess = false;

        // Look for status column that contains RESPONSE or NO RESPONSE
        for (let i = 0; i < cells.length; i++) {
            const cellText = cells[i].textContent.trim();

            // Check for successful response (handles both formats)
            if (cellText.includes('RESPONSE ✅') || cellText === 'Connected') {
                isSuccess = true;
                break;
            }
        }

        if (isSuccess) {
            successCount++;
        }
    });

    if (totalCount > 0) {
        const TOTAL_DEVICES = 28; // Total devices in FAN11_FSK_IPV6
        const successRate = (successCount / TOTAL_DEVICES * 100).toFixed(1);
        const summaryEl = document.getElementById('testSummary');
        if (summaryEl) {
            // Get original summary to preserve duration if it exists
            const originalSummary = summaryEl.textContent;
            const durationMatch = originalSummary.match(/ - Duration: (.+)$/);
            const durationStr = durationMatch ? ` - Duration: ${durationMatch[1]}` : '';

            summaryEl.textContent = `SUMMARY: ${successCount}/${TOTAL_DEVICES} devices responded (${successRate}% success rate)${durationStr}`;
        }
    }
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
            console.log('Report regenerated successfully');
            return data;
        } else {
            console.error('Failed to regenerate report:', data.error);
            throw new Error(data.error);
        }
    })
    .catch(error => {
        console.error('Error regenerating report:', error);
        throw error;
    });
}

// Extract current results from the table
function getCurrentTableResults() {
    const rows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
    const results = [];
    
    rows.forEach(row => {
        const cells = row.cells;
        
        // Extract connection status from the status cell (cell 5)
        const statusCell = cells[5];
        let connectionStatus = 'Unknown';
        let status = 'NO RESPONSE ❌';
        
        // Check the badge content in the status cell
        const badge = statusCell.querySelector('.badge');
        if (badge) {
            const badgeText = badge.textContent.trim();
            if (badgeText.includes('Connected')) {
                connectionStatus = 'Connected';
                status = 'RESPONSE ✅';
            } else if (badgeText.includes('Disconnected')) {
                connectionStatus = 'Disconnected';
                status = 'NO RESPONSE ❌';
            }
        } else {
            // Fallback: check full cell text content
            const cellText = statusCell.textContent.trim();
            if (cellText.includes('Connected') || cellText.includes('RESPONSE ✅')) {
                connectionStatus = 'Connected';
                status = 'RESPONSE ✅';
            } else if (cellText.includes('Disconnected') || cellText.includes('NO RESPONSE ❌')) {
                connectionStatus = 'Disconnected';
                status = 'NO RESPONSE ❌';
            }
        }
        
        results.push({
            sr_no: parseInt(cells[0].textContent) || 0,
            ip: cells[1].textContent,
            device_label: cells[2].textContent, // Use device_label to match backend expectations
            hop_count: cells[3].textContent,
            disconnected_total: cells[4].textContent,
            status: status,
            connection_status: connectionStatus
        });
    });
    
    return results;
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

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    console.log('Disconnections test page loaded');
});