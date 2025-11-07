// Shared Wi-SUN Tree functionality for all test pages
// This file provides the connected/disconnected nodes feature for the Wi-SUN tree modal

function initializeWisunTreeSharedFeatures() {
    // Check if elements exist before adding listeners
    const connectedNodesBtn = document.getElementById('connectedNodesBtn');
    const disconnectedNodesBtn = document.getElementById('disconnectedNodesBtn');
    
    if (!connectedNodesBtn || !disconnectedNodesBtn) {
        console.log('Wi-SUN tree shared features: Required buttons not found, skipping initialization');
        return;
    }

    // Add event listeners for new buttons
    connectedNodesBtn.addEventListener('click', function () {
        fetchConnectedNodes();
    });

    disconnectedNodesBtn.addEventListener('click', function () {
        fetchDisconnectedNodes();
    });

    // Shared utility functions
    window.wisunTreeShared = {
        hideAllContent: function() {
            const elements = ['wisunTreeContent', 'connectedNodesContent', 'disconnectedNodesContent'];
            elements.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.classList.add('d-none');
            });
        },

        showLoading: function(message = 'Fetching Wi-SUN data...') {
            const loadingElement = document.getElementById('wisunTreeLoading');
            const errorElement = document.getElementById('wisunTreeError');
            const loadingText = document.querySelector('#wisunTreeLoading p');
            
            if (loadingElement) loadingElement.classList.remove('d-none');
            if (errorElement) errorElement.classList.add('d-none');
            if (loadingText) loadingText.textContent = message;
            this.hideAllContent();
        },

        hideLoading: function() {
            const loadingElement = document.getElementById('wisunTreeLoading');
            if (loadingElement) loadingElement.classList.add('d-none');
        },

        showError: function(errorText) {
            this.hideLoading();
            const errorTextElement = document.getElementById('wisunTreeErrorText');
            const errorElement = document.getElementById('wisunTreeError');
            
            if (errorTextElement) errorTextElement.textContent = errorText;
            if (errorElement) errorElement.classList.remove('d-none');
        },

        createNodesTable: function(nodes, type) {
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
                            <th>IP Address</th>`;
            
            if (type === 'connected') {
                tableHtml += `<th>Hop Count</th>`;
            } else {
                tableHtml += `<th>Status</th>`;
            }
            
            tableHtml += `</tr>
                    </thead>
                    <tbody>`;

            nodes.forEach((node, index) => {
                const statusClass = type === 'connected' ? 'text-success' : 'text-danger';
                const statusIcon = type === 'connected' ? 'fa-check-circle' : 'fa-times-circle';
                
                tableHtml += `
                    <tr>
                        <td>${index + 1}</td>
                        <td><strong>${node.device_name}</strong></td>
                        <td><code>${node.ip}</code></td>`;
                
                if (type === 'connected') {
                    tableHtml += `<td>
                        <span class="badge bg-info">${node.hop_count}</span>
                    </td>`;
                } else {
                    tableHtml += `<td>
                        <span class="${statusClass}">
                            <i class="fas ${statusIcon} me-1"></i>
                            ${node.status}
                        </span>
                    </td>`;
                }
                
                tableHtml += `</tr>`;
            });

            tableHtml += `</tbody></table>`;
            return tableHtml;
        }
    };

    function fetchConnectedNodes() {
        window.wisunTreeShared.showLoading('Fetching connected nodes...');

        fetch('/api/wisun_nodes/connected')
            .then(response => response.json())
            .then(data => {
                window.wisunTreeShared.hideLoading();

                if (data.success) {
                    // Update timestamp and counts
                    const timestampElement = document.getElementById('connectedNodesTimestamp');
                    const countElement = document.getElementById('connectedNodesCount');
                    const totalCountElement = document.getElementById('connectedNodesTotalCount');
                    const listElement = document.getElementById('connectedNodesList');
                    const contentElement = document.getElementById('connectedNodesContent');
                    
                    if (timestampElement) timestampElement.textContent = data.timestamp;
                    if (countElement) countElement.textContent = data.count;
                    if (totalCountElement) totalCountElement.textContent = data.total_nodes;
                    
                    // Create table for connected nodes
                    if (listElement) {
                        const tableHtml = window.wisunTreeShared.createNodesTable(data.nodes, 'connected');
                        listElement.innerHTML = tableHtml;
                    }
                    
                    if (contentElement) contentElement.classList.remove('d-none');
                } else {
                    window.wisunTreeShared.showError(data.error);
                }
            })
            .catch(error => {
                window.wisunTreeShared.hideLoading();
                window.wisunTreeShared.showError('Network error: ' + error.message);
            });
    }

    function fetchDisconnectedNodes() {
        window.wisunTreeShared.showLoading('Fetching disconnected nodes...');

        fetch('/api/wisun_nodes/disconnected')
            .then(response => response.json())
            .then(data => {
                window.wisunTreeShared.hideLoading();

                if (data.success) {
                    // Update timestamp and counts
                    const timestampElement = document.getElementById('disconnectedNodesTimestamp');
                    const countElement = document.getElementById('disconnectedNodesCount');
                    const totalCountElement = document.getElementById('disconnectedNodesTotalCount');
                    const listElement = document.getElementById('disconnectedNodesList');
                    const contentElement = document.getElementById('disconnectedNodesContent');
                    
                    if (timestampElement) timestampElement.textContent = data.timestamp;
                    if (countElement) countElement.textContent = data.count;
                    if (totalCountElement) totalCountElement.textContent = data.total_nodes;
                    
                    // Create table for disconnected nodes
                    if (listElement) {
                        const tableHtml = window.wisunTreeShared.createNodesTable(data.nodes, 'disconnected');
                        listElement.innerHTML = tableHtml;
                    }
                    
                    if (contentElement) contentElement.classList.remove('d-none');
                } else {
                    window.wisunTreeShared.showError(data.error);
                }
            })
            .catch(error => {
                window.wisunTreeShared.hideLoading();
                window.wisunTreeShared.showError('Network error: ' + error.message);
            });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeWisunTreeSharedFeatures();
});