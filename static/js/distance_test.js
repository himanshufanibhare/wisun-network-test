// Distance Test JavaScript

let currentResults = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

function initializeEventListeners() {
    // Calculate button
    document.getElementById('calculateBtn').addEventListener('click', handleCalculate);
    
    // Paste Text button - opens modal
    document.getElementById('pasteTextBtn').addEventListener('click', handlePasteTextClick);
    
    // Confirm paste button in modal
    document.getElementById('confirmPasteBtn').addEventListener('click', handleConfirmPaste);
    
    // Clear button
    document.getElementById('clearBtn').addEventListener('click', handleClear);
    
    // Download Word button
    document.getElementById('downloadWordBtn').addEventListener('click', handleDownloadWord);
    
    // Wi-SUN Tree button
    document.getElementById('wisunTreeBtn').addEventListener('click', handleWisunTree);
    
    // File input change
    document.getElementById('treeFile').addEventListener('change', function() {
        if (this.files.length > 0) {
            showAlert('File selected: ' + this.files[0].name, 'info');
        }
    });
    
    // Modal close - clear textarea
    const modal = document.getElementById('pasteTextModal');
    modal.addEventListener('hidden.bs.modal', function() {
        // Don't clear if we're processing
        if (!currentResults) {
            document.getElementById('modalTreeText').value = '';
        }
    });
}

function handlePasteTextClick() {
    // Open the modal
    const modal = new bootstrap.Modal(document.getElementById('pasteTextModal'));
    modal.show();
}

async function handleConfirmPaste() {
    const treeData = document.getElementById('modalTreeText').value.trim();
    
    if (!treeData) {
        showAlert('Please paste the Wi-SUN tree text', 'danger');
        return;
    }
    
    // Close the modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('pasteTextModal'));
    modal.hide();
    
    // Process the pasted data
    await processTreeData(treeData);
}

async function handleCalculate() {
    const fileInput = document.getElementById('treeFile');
    
    if (!fileInput.files.length) {
        showAlert('Please select a file or use "Paste Text" button', 'danger');
        return;
    }
    
    let treeData = '';
    
    try {
        treeData = await readFileContent(fileInput.files[0]);
    } catch (error) {
        showAlert('Error reading file: ' + error.message, 'danger');
        return;
    }
    
    await processTreeData(treeData);
}

async function processTreeData(treeData) {
    // Show loading spinner
    showLoading(true);
    hideResults();
    
    try {
        const response = await fetch('/api/distance/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tree_text: treeData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentResults = result;
            displayResults(result);
            showAlert('Distance calculation completed successfully!', 'success');
        } else {
            showAlert('Error: ' + (result.message || 'Unknown error occurred'), 'danger');
        }
    } catch (error) {
        showAlert('Error calculating distances: ' + error.message, 'danger');
    } finally {
        showLoading(false);
    }
}

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function displayResults(result) {
    const data = result.data || [];
    const stats = result.statistics || {};
    const skipped = result.skipped || [];
    
    // Display statistics
    document.getElementById('statTotalConnections').textContent = stats.total_connections || 0;
    document.getElementById('statMaxDistance').textContent = 
        stats.max_distance ? stats.max_distance.toFixed(3) + ' m' : '0 m';
    document.getElementById('statMinDistance').textContent = 
        stats.min_distance ? stats.min_distance.toFixed(3) + ' m' : '0 m';
    document.getElementById('statAvgDistance').textContent = 
        stats.avg_distance ? stats.avg_distance.toFixed(3) + ' m' : '0 m';
    
    document.getElementById('statisticsSection').style.display = 'block';
    
    // Display results table
    if (data.length > 0) {
        const tableBody = document.getElementById('resultsTableBody');
        tableBody.innerHTML = '';
        
        data.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td><code>${escapeHtml(row.parent)}</code></td>
                <td><code>${escapeHtml(row.child)}</code></td>
                <td class="text-center">${row.distance.toFixed(3)}</td>
            `;
            tableBody.appendChild(tr);
        });
        
        document.getElementById('resultsCount').textContent = data.length + ' Results';
        document.getElementById('resultsSection').style.display = 'block';
    }
    
    // Display skipped connections
    if (skipped.length > 0) {
        const skippedBody = document.getElementById('skippedTableBody');
        skippedBody.innerHTML = '';
        
        skipped.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${escapeHtml(item.parent)}</code></td>
                <td><code>${escapeHtml(item.child)}</code></td>
            `;
            skippedBody.appendChild(tr);
        });
        
        document.getElementById('skippedSection').style.display = 'block';
    } else {
        document.getElementById('skippedSection').style.display = 'none';
    }
}

async function handleDownloadWord() {
    if (!currentResults) {
        showAlert('No results to download', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/distance/download-word', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentResults)
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate Word document');
        }
        
        // Create blob from response
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `distance_analysis_${getCurrentTimestamp()}.docx`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showAlert('Word document downloaded successfully!', 'success');
    } catch (error) {
        showAlert('Error downloading Word document: ' + error.message, 'danger');
    }
}

function handleClear() {
    // Clear form inputs
    document.getElementById('treeFile').value = '';
    document.getElementById('modalTreeText').value = '';
    
    // Hide results
    hideResults();
    currentResults = null;
    
    // Hide alerts
    document.getElementById('alertContainer').style.display = 'none';
    
    showAlert('Form cleared', 'info');
}

function hideResults() {
    document.getElementById('statisticsSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('skippedSection').style.display = 'none';
}

function showLoading(show) {
    document.getElementById('loadingSpinner').style.display = show ? 'block' : 'none';
}

function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    const alertBox = document.getElementById('alertBox');
    const alertMessage = document.getElementById('alertMessage');
    
    // Set alert type
    alertBox.className = `alert alert-${type} alert-dismissible fade show`;
    
    // Set message
    alertMessage.textContent = message;
    
    // Show alert
    alertContainer.style.display = 'block';
    
    // Auto-hide after 5 seconds for success/info messages
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            alertContainer.style.display = 'none';
        }, 5000);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCurrentTimestamp() {
    const now = new Date();
    return now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
}

// Wi-SUN Tree Modal Functions
function handleWisunTree() {
    const modal = new bootstrap.Modal(document.getElementById('wisunTreeModal'));
    modal.show();
    fetchWisunTreeData();
    
    // Setup button handlers
    document.getElementById('connectedNodesBtn').addEventListener('click', fetchConnectedNodes);
    document.getElementById('disconnectedNodesBtn').addEventListener('click', fetchDisconnectedNodes);
    document.getElementById('refreshTreeBtn').addEventListener('click', fetchWisunTreeData);
}

function fetchWisunTreeData() {
    showWisunLoading('Fetching Wi-SUN tree status...');
    
    fetch('/api/wisun_tree')
        .then(response => response.json())
        .then(data => {
            hideWisunLoading();
            
            if (data.success) {
                document.getElementById('wisunTreeTimestamp').textContent = data.timestamp;
                document.getElementById('wisunTreeDeviceCount').textContent = data.device_count || 0;
                document.getElementById('wisunTreeOutput').textContent = data.output;
                document.getElementById('wisunTreeContent').classList.remove('d-none');
            } else {
                showWisunError(data.error);
            }
        })
        .catch(error => {
            hideWisunLoading();
            showWisunError('Network error: ' + error.message);
        });
}

function fetchConnectedNodes() {
    showWisunLoading('Fetching connected nodes...');
    
    fetch('/api/wisun_nodes/connected')
        .then(response => response.json())
        .then(data => {
            hideWisunLoading();
            
            if (data.success) {
                document.getElementById('connectedNodesTimestamp').textContent = data.timestamp;
                document.getElementById('connectedNodesCount').textContent = data.count;
                document.getElementById('connectedNodesTotalCount').textContent = data.total_nodes;
                
                const nodesHtml = createNodesTable(data.nodes, 'connected');
                document.getElementById('connectedNodesList').innerHTML = nodesHtml;
                document.getElementById('connectedNodesContent').classList.remove('d-none');
            } else {
                showWisunError(data.error);
            }
        })
        .catch(error => {
            hideWisunLoading();
            showWisunError('Network error: ' + error.message);
        });
}

function fetchDisconnectedNodes() {
    showWisunLoading('Fetching disconnected nodes...');
    
    fetch('/api/wisun_nodes/disconnected')
        .then(response => response.json())
        .then(data => {
            hideWisunLoading();
            
            if (data.success) {
                document.getElementById('disconnectedNodesTimestamp').textContent = data.timestamp;
                document.getElementById('disconnectedNodesCount').textContent = data.count;
                document.getElementById('disconnectedNodesTotalCount').textContent = data.total_nodes;
                
                const nodesHtml = createNodesTable(data.nodes, 'disconnected');
                document.getElementById('disconnectedNodesList').innerHTML = nodesHtml;
                document.getElementById('disconnectedNodesContent').classList.remove('d-none');
            } else {
                showWisunError(data.error);
            }
        })
        .catch(error => {
            hideWisunLoading();
            showWisunError('Network error: ' + error.message);
        });
}

function createNodesTable(nodes, type) {
    if (!nodes || nodes.length === 0) {
        return `<div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            No ${type} nodes found.
        </div>`;
    }

    let rawText = "Sr No".padEnd(8) + "Device Name".padEnd(25) + "IP Address".padEnd(42) + "Hop Count".padEnd(15) + "Pole No\n";
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

function showWisunLoading(message) {
    const loadingDiv = document.getElementById('wisunTreeLoading');
    const errorDiv = document.getElementById('wisunTreeError');
    const contentDiv = document.getElementById('wisunTreeContent');
    const connectedDiv = document.getElementById('connectedNodesContent');
    const disconnectedDiv = document.getElementById('disconnectedNodesContent');
    
    loadingDiv.classList.remove('d-none');
    errorDiv.classList.add('d-none');
    contentDiv.classList.add('d-none');
    connectedDiv.classList.add('d-none');
    disconnectedDiv.classList.add('d-none');
    
    loadingDiv.querySelector('p').textContent = message;
}

function hideWisunLoading() {
    document.getElementById('wisunTreeLoading').classList.add('d-none');
}

function showWisunError(message) {
    document.getElementById('wisunTreeErrorText').textContent = message;
    document.getElementById('wisunTreeError').classList.remove('d-none');
}
