// Ping Test JavaScript functionality
let socket;
let currentTestType = 'ping';
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
                        spinnerText.textContent = `Ping test in progress... (${data.current}/${data.total})`;
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
                spinnerText.textContent = 'Ping test in progress... (0/0)';
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
            showWarning('Ping test paused');
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
            showSuccess('Ping test resumed');
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
            // Recalculate and update summary after retest
            updateSummaryFromTable();
        }
    });

    socket.on('device_retest_error', function (data) {
        if (data.test_type === currentTestType) {
            showError(`Ping retest failed for ${data.label}: ${data.error}`);
            const deviceId = data.ip.replace(/[^a-zA-Z0-9]/g, '_');
            resetRetestButton(deviceId, data.ip, data.label);
        }
    });
}

function startTest() {
    if (testRunning) {
        console.log('Ping test already running, ignoring start request');
        return;
    }

    // Reset progress text immediately when starting
    const spinnerText = document.getElementById('testSpinnerText');
    if (spinnerText) {
        spinnerText.textContent = 'Ping test in progress... (0/0)';
        // Also reset after a small delay to handle any immediate socket events
        setTimeout(() => {
            if (spinnerText && !testRunning) {
                spinnerText.textContent = 'Ping test in progress... (0/0)';
            }
        }, 100);
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
                showError('Failed to start ping test: ' + data.error);
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
                console.log('Ping test stop request sent');
            } else {
                document.getElementById('stopBtn').disabled = false;
                testRunning = true;
                showError('Failed to stop ping test: ' + data.error);
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
                console.log('Ping test pause request sent');
            } else {
                showError('Failed to pause ping test: ' + data.error);
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
                console.log('Ping test resume request sent');
            } else {
                showError('Failed to resume ping test: ' + data.error);
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
        spinnerText.textContent = 'Ping test in progress... (0/0)';
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
        spinnerText.textContent = 'Ping test in progress... (0/0)';
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

    const deviceId = deviceResult.ip.replace(/[^a-zA-Z0-9]/g, '_');
    const existingRow = document.querySelector(`tr[data-device-ip="${deviceResult.ip}"]`);

    const isFailedTest = deviceResult.loss_percent === 100 || deviceResult.packets_rx === 0;
    const buttonClass = isFailedTest ? 'btn-warning' : 'btn-outline-secondary';
    const buttonText = isFailedTest ? 'Retry' : 'Retest';
    const buttonIcon = isFailedTest ? 'fa-exclamation-triangle' : 'fa-redo';

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

    const rowHTML = `
        <td class="srno-column">${srNo}</td>
        <td class="ip-column">${deviceResult.ip}</td>
        <td class="hop-count-column">${deviceResult.hop_count || '-'}</td>
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
                <td colspan="12" class="text-center text-muted">
                    <i class="fas fa-exclamation-circle me-2"></i>No ping results available
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

function getStatusText(lossPercent) {
    if (lossPercent === undefined || lossPercent === null) return 'Unknown';
    if (lossPercent === 0) return 'Success';
    if (lossPercent < 20) return 'Warning';
    if (lossPercent < 100) return 'Poor';
    return 'Failed';
}

function testCompleted() {
    testRunning = false;

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('testSpinner').classList.add('d-none');

    showSuccess('Ping test completed successfully!');

    fetch(`/api/test_status/${currentTestType}`)
        .then(res => res.json())
        .then(data => {
            const summaryEl = document.getElementById('testSummary');
            if (data && data.summary) {
                summaryEl.textContent = data.summary;
            } else {
                summaryEl.textContent = 'Ping test completed.';
            }

            const btn = document.getElementById('downloadLogBtn');
            if (btn) {
                btn.disabled = false;
                btn.addEventListener('click', function () {
                    window.open(`/download_logs/${currentTestType}`, '_blank');
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
                        <i class="fas fa-stop-circle me-2"></i>Ping test was stopped by user. No results to display.
                    </td>
                </tr>
            `;
        }
    }

    showWarning('Ping test was stopped by user');

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
                        <i class="fas fa-exclamation-triangle me-2"></i>Ping test failed: ${error}
                    </td>
                </tr>
            `;
        }
    }

    showError('Ping test error: ' + error);
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
            console.error('Error checking ping test status:', error);
        });
}

function retestDevice(ip, label, deviceId) {
    console.log(`Retesting ping for device: ${label} (${ip})`);

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
                showInfo(`Ping retest started for ${label}`);
            } else {
                showError(`Failed to start ping retest: ${data.error}`);
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
    showSuccess(`Ping retest completed for ${deviceResult.label}`);
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

function updateSummaryFromTable() {
    // Count success/fail from current table data
    const rows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
    let successCount = 0;
    let totalCount = rows.length;

    rows.forEach(row => {
        const lossCell = row.cells[5]; // Loss % column
        if (lossCell) {
            const lossText = lossCell.textContent.trim();
            const lossPercent = parseFloat(lossText.replace('%', ''));
            // Consider success if packet loss < 100%
            if (!isNaN(lossPercent) && lossPercent < 100) {
                successCount++;
            }
        }
    });

    if (totalCount > 0) {
        const successRate = (successCount / totalCount * 100).toFixed(1);
        const summaryEl = document.getElementById('testSummary');
        if (summaryEl) {
            // Get original summary to preserve duration if it exists
            const originalSummary = summaryEl.textContent;
            const durationMatch = originalSummary.match(/ - Duration: (.+)$/);
            const durationStr = durationMatch ? ` - Duration: ${durationMatch[1]}` : '';

            summaryEl.textContent = `SUMMARY: ${successCount}/${totalCount} devices reachable (${successRate}% success rate)${durationStr}`;
        }
    }
}

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    console.log('Ping test page loaded');
});