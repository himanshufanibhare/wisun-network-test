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
            // Update live summary if provided
            if (data.live_summary) {
                updateLiveSummary(data.live_summary);
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
            // Use live_summary from socket payload if available
            testCompleted(data.live_summary || data.status || null);
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
        console.log(`🔄 DEBUG: Received device_retest_result event:`, data);
        if (data.test_type === currentTestType) {
            console.log(`🔄 DEBUG: Processing retest result for ${currentTestType}`);
            updateDeviceInTable(data.device_result);
            // Recalculate and update summary after retest
            updateSummaryFromTable();
        } else {
            console.log(`🔄 DEBUG: Ignoring retest result for different test type: ${data.test_type} (current: ${currentTestType})`);
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

function updateLiveSummary(live) {
    const summaryEl = document.getElementById('testSummary');
    if (!summaryEl) return;
    const total = live.total || 0;
    const success = live.success || 0;
    const fail = live.fail || 0;
    const skipped = live.skipped || 0;
    const duration = live.duration || '';
    summaryEl.textContent = `Summary : ${success}/${total} reachable , ${fail}/${total} failed, ${skipped}/${total} skipped, Duration : ${duration}`;
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

    // Determine status display with badges
    let statusHTML;
    if (deviceResult.connection_status === 'Skipped') {
        statusHTML = `<span class="badge bg-secondary"><i class="fas fa-minus-circle"></i> Skipped</span>`;
    } else if (deviceResult.loss_percent !== undefined && deviceResult.loss_percent !== '-' && deviceResult.loss_percent < 100) {
        statusHTML = `<span class="badge bg-success"><i class="fas fa-check"></i> Connected</span>`;
    } else if (deviceResult.loss_percent === 100 || deviceResult.loss_percent === '-') {
        statusHTML = `<span class="badge bg-danger"><i class="fas fa-times"></i> Failed</span>`;
    } else {
        statusHTML = `<span class="badge bg-secondary"><i class="fas fa-question"></i> Unknown</span>`;
    }

    // Disable retest for skipped devices
    const isSkipped = deviceResult.connection_status === 'Skipped' || deviceResult.status === 'Skipped' || deviceResult.skipped === true;
    const finalButtonClass = isSkipped ? 'btn-secondary' : buttonClass;
    const disabledAttr = isSkipped ? 'disabled' : '';
    const dataSkippedAttr = isSkipped ? 'data-skipped="true"' : '';

    const rowHTML = `
        <td class="srno-column">${srNo}</td>
        <td class="ip-address"><code>${deviceResult.ip}</code></td>
        <td class="device-label">${deviceResult.label || '-'}</td>
        <td class="hop-count">${deviceResult.hop_count === -1 ? '-' : (deviceResult.hop_count || '-')}</td>
        <td class="metric-column">${deviceResult.packets_tx || '-'}</td>
        <td class="metric-column">${deviceResult.packets_rx || '-'}</td>
        <td class="metric-column ${getStatusClass(deviceResult.loss_percent)}">${deviceResult.loss_percent !== undefined && deviceResult.loss_percent !== '-' ? deviceResult.loss_percent + '%' : '-'}</td>
        <td class="metric-column">${deviceResult.min_time || '-'}</td>
        <td class="metric-column">${deviceResult.max_time || '-'}</td>
        <td class="metric-column">${deviceResult.avg_time || '-'}</td>
        <td class="metric-column">${deviceResult.mdev_time || '-'}</td>
        <td class="status">${statusHTML}</td>
        <td class="text-center">
            <button class="btn ${finalButtonClass} btn-sm" 
                    onclick="retestDevice('${deviceResult.ip}', '${deviceResult.label}', '${deviceId}')"
                    id="retest_${deviceId}" ${disabledAttr} ${dataSkippedAttr}>
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
    if (lossPercent === undefined || lossPercent === null || lossPercent === '-') return '';
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

function testCompleted(status) {
    testRunning = false;

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('testSpinner').classList.add('d-none');

    // Enable all retest buttons except those marked as skipped
    const retestButtons = document.querySelectorAll('#resultsTableBody button[id^="retest_"]');
    retestButtons.forEach(button => {
        if (!button.dataset || button.dataset.skipped !== 'true') {
            button.disabled = false;
        }
    });

    showSuccess('Ping test completed successfully!');

    // If status/live_summary provided from socket, use it
    const summaryEl = document.getElementById('testSummary');
    if (status) {
        // status may be live_summary or test_status object
        let live = status.live_summary || status;
        if (status.success === undefined && status.live_summary === undefined && status.live_success !== undefined) {
            // status is test_status object containing live_success/live_fail/live_skipped
            live = {
                success: status.live_success || 0,
                fail: status.live_fail || 0,
                skipped: status.live_skipped || 0,
                total: status.total_devices || status.total_run || 0,
                duration: status.duration || ''
            };
        }
        if (summaryEl) {
            summaryEl.textContent = `Summary : ${live.success}/${live.total} reachable , ${live.fail}/${live.total} failed, ${live.skipped}/${live.total} skipped, Duration : ${live.duration}`;
        }

        // Enable download button
        const downloadBtn = document.getElementById('downloadReportBtn');
        if (downloadBtn) {
            downloadBtn.disabled = false;
            const newBtn = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newBtn, downloadBtn);

            newBtn.addEventListener('click', function () {
                const outputFormatElement = document.querySelector('select[name="output_format"]');
                if (!outputFormatElement) {
                    alert('Error: Output format selector not found');
                    return;
                }
                const outputFormat = outputFormatElement.value;
                regenerateReportWithUpdatedResults()
                    .then(() => window.location.href = `/api/test_result/download/${currentTestType}/${outputFormat}`)
                    .catch(() => window.location.href = `/api/test_result/download/${currentTestType}/${outputFormat}`);
            });
        }
    } else {
        // Fallback: fetch latest status from backend and prefer live counters
        fetch(`/api/test_status/${currentTestType}`)
            .then(res => res.json())
            .then(data => {
                const sEl = document.getElementById('testSummary');
                if (sEl) {
                    const live = {
                        success: data.live_success || 0,
                        fail: data.live_fail || 0,
                        skipped: data.live_skipped || 0,
                        total: data.total_devices || data.total_run || 0,
                        duration: ''
                    };
                    sEl.textContent = `Summary : ${live.success}/${live.total} reachable , ${live.fail}/${live.total} failed, ${live.skipped}/${live.total} skipped, Duration : ${live.duration}`;
                }
                const btn = document.getElementById('downloadReportBtn');
                if (btn) btn.disabled = false;
            });
    }
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
            if (data) {
                if (data.live_summary && summaryEl) {
                    const live = {
                        success: data.live_summary.success || 0,
                        fail: data.live_summary.fail || 0,
                        skipped: data.live_summary.skipped || 0,
                        total: data.live_summary.total || data.total_devices || data.total_run || 0,
                        duration: data.live_summary.duration || ''
                    };
                    summaryEl.textContent = `Summary : ${live.success}/${live.total} reachable , ${live.fail}/${live.total} failed, ${live.skipped}/${live.total} skipped, Duration : ${live.duration}`;
                } else if (typeof updateSummaryFromTable === 'function' && document.querySelectorAll('#resultsTableBody tr[data-device-ip]').length > 0) {
                    // Prefer recalculating summary from current DOM table if available
                    updateSummaryFromTable();
                } else if (typeof updateSummaryFromTable === 'function' && document.querySelectorAll('#resultsTableBody tr[data-device-ip]').length > 0) {
                    updateSummaryFromTable();
                } else if (summaryEl) {
                    summaryEl.textContent = data.summary || 'Test completed.';
                }
            }

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
    console.log(`🔄 DEBUG: Starting retest for device: ${label} (${ip}) with deviceId: ${deviceId}`);

    const formData = new FormData(document.getElementById('testForm'));
    const parameters = {};
    for (let [key, value] of formData.entries()) {
        if (!isNaN(value) && value !== '') {
            parameters[key] = Number(value);
        } else {
            parameters[key] = value;
        }
    }
    console.log(`🔄 DEBUG: Retest parameters:`, parameters);

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
        // Do not re-enable retest button for skipped devices
        if (button.dataset && button.dataset.skipped === 'true') return;

        button.disabled = false;
        button.innerHTML = '<i class="fas fa-redo me-1"></i>Retest';
        button.className = 'btn btn-outline-secondary btn-sm';
    }
}

function updateDeviceInTable(deviceResult) {
    console.log(`🔄 DEBUG: updateDeviceInTable called with:`, deviceResult);
    updateResultsTable(deviceResult);
    showSuccess(`Ping retest completed for ${deviceResult.label}`);
    
    // Update summary after retest with a small delay to ensure DOM is updated
    setTimeout(() => {
        updateSummaryFromTable();
    }, 100);
    
    // Trigger report regeneration with updated results
    console.log('🔄 DEBUG: Calling regenerateReportWithUpdatedResults from updateDeviceInTable');
    regenerateReportWithUpdatedResults();
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
    console.log('🔄 DEBUG: Starting report regeneration...');
    const outputFormat = document.querySelector('select[name="output_format"]').value;
    console.log(`🔄 DEBUG: Output format: ${outputFormat}`);
    
    // Get current test results from table
    const tableResults = getCurrentTableResults();
    console.log('🔄 DEBUG: Table results extracted:', tableResults);
    
    const payload = {
        test_type: currentTestType,
        output_format: outputFormat,
        results: tableResults,
        summary: document.getElementById('testSummary').textContent
    };
    console.log('🔄 DEBUG: Sending payload to backend:', payload);
    
    // Send to backend to regenerate report
    return fetch('/api/regenerate_report', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    })
    .then(response => {
        console.log('🔄 DEBUG: Backend response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('🔄 DEBUG: Backend response data:', data);
        if (data.success) {
            console.log('✅ Ping report regenerated successfully');
            return data;
        } else {
            console.error('❌ Failed to regenerate ping report:', data.error);
            throw new Error(data.error);
        }
    })
    .catch(error => {
        console.error('Error regenerating ping report:', error);
        throw error;
    });
}

// Extract current results from the table
function getCurrentTableResults() {
    console.log('🔍 DEBUG: Starting getCurrentTableResults()');
    const rows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
    console.log(`🔍 DEBUG: Found ${rows.length} data rows in table`);
    const results = [];
    
    rows.forEach((row, index) => {
        const cells = row.cells;
        console.log(`🔍 DEBUG: Row ${index + 1} has ${cells.length} cells`);
        
        // Log all cell contents for debugging
        for (let i = 0; i < cells.length; i++) {
            console.log(`🔍 DEBUG: Row ${index + 1}, Cell ${i}: "${cells[i].textContent.trim()}"`);
        }
        
        // Get packet loss to determine status - Loss % is now column 6
        const lossCell = cells[6]; // Loss % column
        let lossPercent = 100;
        if (lossCell) {
            const lossText = lossCell.textContent.trim();
            lossPercent = parseFloat(lossText.replace('%', ''));
            console.log(`🔍 DEBUG: Row ${index + 1} loss text: "${lossText}", parsed: ${lossPercent}`);
        }
        
        const resultObject = {
            sr_no: parseInt(cells[0].textContent) || 0,
            ip: cells[1].textContent,
            device_label: cells[2].textContent, // Use device_label to match backend expectations
            hop_count: cells[3].textContent,
            packets_tx: parseInt(cells[4].textContent) || 0,
            packets_rx: parseInt(cells[5].textContent) || 0,
            loss_percent: isNaN(lossPercent) ? 100 : lossPercent,
            min_rtt: cells[7] ? cells[7].textContent : 'N/A',
            max_rtt: cells[8] ? cells[8].textContent : 'N/A',
            avg_rtt: cells[9] ? cells[9].textContent : 'N/A',
            mdev_time: cells[10] ? cells[10].textContent : 'N/A',
            status: lossPercent < 100 ? 'Success' : 'Failed'
        };
        
        console.log(`🔍 DEBUG: Row ${index + 1} result object:`, resultObject);
        results.push(resultObject);
    });
    
    console.log(`🔍 DEBUG: Final results array (${results.length} items):`, results);
    
    return results;
}

function updateSummaryFromTable() {
    // Count success/fail from current table data
    const rows = document.querySelectorAll('#resultsTableBody tr[data-device-ip]');
    let successCount = 0;
    let totalCount = rows.length;
    let skippedCount = 0;

    rows.forEach(row => {
        const lossCell = row.cells[6]; // Loss % column - fixed from cells[5] to cells[6]
        if (lossCell) {
            const lossText = lossCell.textContent.trim();
            if (lossText === '-') {
                // This is a skipped device
                skippedCount++;
            } else {
                const lossPercent = parseFloat(lossText.replace('%', ''));
                // Consider success if packet loss < 100%
                if (!isNaN(lossPercent) && lossPercent < 100) {
                    successCount++;
                }
            }
        }
    });

    const testedCount = totalCount - skippedCount;
    if (totalCount > 0) {
        const summaryEl = document.getElementById('testSummary');
        if (summaryEl) {
            // Get original summary to preserve duration if it exists
            const originalSummary = summaryEl.textContent;
            const durationMatch = originalSummary.match(/Duration: (.+)$/);
            const durationStr = durationMatch ? ` - Duration: ${durationMatch[1]}` : '';

            // Use live-style summary format and compute success/fail/skipped out of total rows
            const successRate = ((successCount / totalCount) * 100).toFixed(1);
            const failCount = totalCount - successCount - skippedCount;
            summaryEl.textContent = `Summary : ${successCount}/${totalCount} reachable , ${failCount}/${totalCount} failed, ${skippedCount}/${totalCount} skipped, Duration : ${durationStr.replace(' - Duration: ', '')}`;
        }
    }
}

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    console.log('Ping test page loaded');
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
                    <td><strong>${node.device_name}</strong></td>
                    <td><code>${node.ip}</code></td>
                    <td>
                        <span class="badge bg-info">${node.hop_count !== undefined ? node.hop_count : '-'}</span>
                    </td>
                    <td><span class="badge bg-secondary">${node.pole_number || 'Unknown'}</span></td>
                </tr>`;
        });

        tableHtml += `</tbody></table>`;
        return tableHtml;
    }
}