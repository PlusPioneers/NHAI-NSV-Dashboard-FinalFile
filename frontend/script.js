const CONFIG = {
    apiBaseUrl: 'http://localhost:8000',
    mapCenter: [20.5937, 78.9629], 
    mapZoom: 5,
    severityColors: {
        'High': '#dc3545',
        'Medium': '#fd7e14',
        'Low': '#28a745'
    },
    markerRadius: 8,
    popupOffset: [0, -10]
};


let map;
let markers = [];
let pavementData = [];
let originalStatistics = { total: 0, high: 0, medium: 0, low: 0 }; 
let currentFilter = 'All';


function initializeMap() {
    map = L.map('map').setView(CONFIG.mapCenter, CONFIG.mapZoom);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
    }).addTo(map);
    
    console.log('Map initialized successfully');
}


async function uploadFiles(files) {
    const formData = new FormData();
    Array.from(files).forEach(file => {
        formData.append('files', file);
    });
    
    try {
        showLoadingSpinner(true);
        const response = await fetch(`${CONFIG.apiBaseUrl}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    } finally {
        showLoadingSpinner(false);
    }
}

async function fetchData() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/data`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Fetch data error:', error);
        throw error;
    }
}

async function filterData(severity = null, measurementType = null, highway = null) {
    try {
        const params = new URLSearchParams();
        if (severity) params.append('severity', severity);
        if (measurementType) params.append('measurement_type', measurementType);
        if (highway) params.append('highway', highway);
        
        const response = await fetch(`${CONFIG.apiBaseUrl}/data/filter?${params}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Filter data error:', error);
        throw error;
    }
}

async function clearAllData() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/data`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Clear data error:', error);
        throw error;
    }
}

async function loadSampleData() {
    try {
        showLoadingSpinner(true);
        const response = await fetch(`${CONFIG.apiBaseUrl}/sample-data`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Load sample data error:', error);
        throw error;
    } finally {
        showLoadingSpinner(false);
    }
}

async function exportData() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/export`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        
        const blob = new Blob([result.csv_content], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        link.click();
        URL.revokeObjectURL(url);
        
        showNotification('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting data', 'error');
    }
}

 
function showExportModal() {
    
    populateExportFilters();
    
    
    const exportModal = new bootstrap.Modal(document.getElementById('exportModal'));
    exportModal.show();
}


function populateExportFilters() {
    if (!pavementData || pavementData.length === 0) {
        return;
    }
    
    const highways = [...new Set(pavementData.map(d => d.highway))];
    const types = [...new Set(pavementData.map(d => d.type))];
    
    
    const highwaySelect = document.getElementById('export-highway-filter');
    highwaySelect.innerHTML = '<option value="">All Highways</option>';
    highways.forEach(highway => {
        highwaySelect.innerHTML += `<option value="${highway}">${highway}</option>`;
    });
    
    
    const typeSelect = document.getElementById('export-type-filter');
    typeSelect.innerHTML = '<option value="">All Types</option>';
    types.forEach(type => {
        typeSelect.innerHTML += `<option value="${type}">${type}</option>`;
    });
}


function previewExportData() {
    const filters = getExportFilters();
    const columns = getSelectedColumns();
    const filteredData = applyExportFilters(pavementData, filters);
    
    
    const previewDiv = document.getElementById('export-preview');
    if (filteredData.length === 0) {
        previewDiv.innerHTML = '<small class="text-warning">No data matches the selected filters</small>';
        return;
    }
    
    const limitedData = filters.limit ? filteredData.slice(0, parseInt(filters.limit)) : filteredData;
    
    previewDiv.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <small><strong>Total matching records:</strong> ${filteredData.length}</small><br>
                <small><strong>Records to export:</strong> ${limitedData.length}</small><br>
                <small><strong>Selected columns:</strong> ${columns.length}</small>
            </div>
            <div class="col-md-6">
                <small><strong>Applied filters:</strong></small><br>
                <small>Severity: ${filters.severity || 'All'}</small><br>
                <small>Type: ${filters.type || 'All'}</small><br>
                <small>Highway: ${filters.highway || 'All'}</small>
            </div>
        </div>
        <div class="mt-2">
            <small class="text-muted">Sample data preview:</small>
            <div class="table-responsive mt-1" style="max-height: 200px; overflow-y: auto;">
                <table class="table table-sm table-striped">
                    <thead>
                        <tr>
                            ${columns.map(col => `<th>${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${limitedData.slice(0, 5).map(row => `
                            <tr>
                                ${columns.map(col => `<td>${formatExportValue(row, col)}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${limitedData.length > 5 ? `<small class="text-muted">... and ${limitedData.length - 5} more rows</small>` : ''}
        </div>
    `;
}


function getExportFilters() {
    return {
        severity: document.getElementById('export-severity-filter').value,
        type: document.getElementById('export-type-filter').value,
        highway: document.getElementById('export-highway-filter').value,
        limit: document.getElementById('export-limit').value
    };
}


function getSelectedColumns() {
    const checkboxes = document.querySelectorAll('#exportModal input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}


function applyExportFilters(data, filters) {
    let filteredData = data.slice(); 
    
    if (filters.severity) {
        filteredData = filteredData.filter(item => item.severity === filters.severity);
    }
    
    if (filters.type) {
        filteredData = filteredData.filter(item => item.type === filters.type);
    }
    
    if (filters.highway) {
        filteredData = filteredData.filter(item => item.highway === filters.highway);
    }
    
    return filteredData;
}


function formatExportValue(row, column) {
    if (column === 'googleMapsLink') {
        return `https://maps.google.com/?q=${row.lat},${row.lng}`;
    }
    return row[column] || 'N/A';
}


async function exportFilteredData() {
    const filters = getExportFilters();
    const columns = getSelectedColumns();
    
    if (columns.length === 0) {
        showNotification('Please select at least one column to export', 'warning');
        return;
    }
    
    try {
        const filteredData = applyExportFilters(pavementData, filters);
        
        if (filteredData.length === 0) {
            showNotification('No data matches the selected filters', 'warning');
            return;
        }
        
        
        const limitedData = filters.limit ? filteredData.slice(0, parseInt(filters.limit)) : filteredData;
        
        
        const exportData = limitedData.map(row => {
            const exportRow = {};
            columns.forEach(col => {
                if (col === 'googleMapsLink') {
                    exportRow[col] = `https://maps.google.com/?q=${row.lat},${row.lng}`;
                } else {
                    exportRow[col] = row[col] || 'N/A';
                }
            });
            return exportRow;
        });
        
        
        const csvContent = convertToCSV(exportData);
        
      
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filterSuffix = filters.severity ? `_${filters.severity}` : '';
        const filename = `nhai_pavement_data_filtered${filterSuffix}_${timestamp}.csv`;
        
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        
        const exportModal = bootstrap.Modal.getInstance(document.getElementById('exportModal'));
        exportModal.hide();
        
        showNotification(`Successfully exported ${limitedData.length} records`, 'success');
        
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting data', 'error');
    }
}


function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            
            const escaped = String(value).replace(/"/g, '""');
            return escaped.includes(',') ? `"${escaped}"` : escaped;
        });
        csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
}


function addMarkersToMap(data) {
    clearMarkers();
    
    data.forEach((point, index) => {
        if (!isValidCoordinate(point.lat, point.lng)) {
            console.warn('Invalid coordinates:', point);
            return;
        }
        
        const marker = L.circleMarker([point.lat, point.lng], {
            radius: CONFIG.markerRadius,
            fillColor: CONFIG.severityColors[point.severity] || CONFIG.severityColors['Medium'],
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);
        
        const popupContent = createPopupContent(point);
        marker.bindPopup(popupContent);
        
        markers.push(marker);
    });
    
    if (data.length > 0) {
        fitMapToMarkers();
    }
    
    generateSeverityList(data);
    console.log(`Added ${data.length} markers to map`);
}

function clearMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

function createPopupContent(point) {
    return `
        <div class="popup-content">
            <h6><i class="fas fa-road"></i> ${point.highway || 'N/A'}</h6>
            <p><strong>Lane:</strong> ${point.lane || 'N/A'}</p>
            <p><strong>Chainage:</strong> ${point.startChainage || 'N/A'} - ${point.endChainage || 'N/A'}</p>
            <p><strong>Structure:</strong> ${point.structure || 'N/A'}</p>
            <p><strong>Measurement:</strong> ${point.type || 'N/A'}</p>
            <p><strong>Value:</strong> ${point.value || 'N/A'} ${point.unit || ''}</p>
            <p><strong>Limit:</strong> ${point.limit || 'N/A'} ${point.unit || ''}</p>
            <p><strong>Severity:</strong> <span class="severity-badge severity-${point.severity.toLowerCase()}">${point.severity}</span></p>
            <p><strong>Date:</strong> ${new Date(point.datetime).toLocaleString()}</p>
        </div>
    `;
}

function isValidCoordinate(lat, lng) {
    return (
        typeof lat === 'number' && 
        typeof lng === 'number' && 
        !isNaN(lat) && 
        !isNaN(lng) && 
        lat >= -90 && 
        lat <= 90 && 
        lng >= -180 && 
        lng <= 180
    );
}

function fitMapToMarkers() {
    if (markers.length === 0) return;
    
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [20, 20] });
}

let currentSeverityData = [];
let currentDisplayedItems = 0;
let itemsPerPage = 50;
let currentSeverityFilter = 'All';


function generateSeverityList(data) {
    currentSeverityData = data;
    currentDisplayedItems = 0;
    currentSeverityFilter = 'All';
    
    const severityList = document.getElementById('severity-list');
    const loadMoreContainer = document.getElementById('load-more-container');
    const severityStats = document.getElementById('severity-stats');
    
    if (!severityList) return;
    
    
    severityList.innerHTML = '';
    
    if (data.length === 0) {
        severityList.innerHTML = `
            <div class="text-center p-4 text-muted">
                <i class="fas fa-upload fa-2x mb-2"></i>
                <p>No data loaded yet</p>
                <small>Upload data files to see severity issues</small>
            </div>
        `;
        loadMoreContainer.style.display = 'none';
        severityStats.style.display = 'none';
        return;
    }
    
    
    loadMoreItems(true);
    
    
    updateLoadMoreButton();
    updateSeverityStats();
    severityStats.style.display = 'block';
}


function loadMoreItems(isInitialLoad = false) {
    const severityList = document.getElementById('severity-list');
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    if (!severityList || !currentSeverityData.length) return;
    
    
    if (!isInitialLoad) {
        loadMoreBtn.classList.add('loading');
        loadMoreBtn.disabled = true;
    }
    
    
    let filteredData = currentSeverityData;
    if (currentSeverityFilter !== 'All') {
        filteredData = currentSeverityData.filter(point => point.severity === currentSeverityFilter);
    }
    
    
    const startIndex = currentDisplayedItems;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredData.length);
    const itemsToShow = filteredData.slice(startIndex, endIndex);
    
    
    const groupedItems = groupItemsBySeverity(itemsToShow);
    
    
    if (isInitialLoad) {
        severityList.innerHTML = '';
    }
    
    
    setTimeout(() => {
        Object.entries(groupedItems).forEach(([severity, points]) => {
            addSeveritySection(severity, points, isInitialLoad);
        });
        
        
        currentDisplayedItems = endIndex;
        
        
        updateLoadMoreButton();
        updateSeverityStats();
        
        
        if (!isInitialLoad) {
            loadMoreBtn.classList.remove('loading');
            loadMoreBtn.disabled = false;
        }
    }, isInitialLoad ? 0 : 500);
}


function groupItemsBySeverity(items) {
    return items.reduce((acc, point) => {
        if (!acc[point.severity]) acc[point.severity] = [];
        acc[point.severity].push(point);
        return acc;
    }, {});
}


function addSeveritySection(severity, points, isInitialLoad) {
    const severityList = document.getElementById('severity-list');
    let existingSection = severityList.querySelector(`[data-severity="${severity}"]`);
    
    if (!existingSection) {
        
        const section = document.createElement('div');
        section.className = 'severity-section';
        section.setAttribute('data-severity', severity);
        
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'severity-items-container';
        itemsContainer.innerHTML = `
            <h6 class="severity-title p-3 mb-0 border-bottom">
                <span class="severity-badge severity-${severity.toLowerCase()}">${severity}</span>
                <span class="count" data-count="${severity}">0</span>
            </h6>
            <div class="severity-items" data-severity-items="${severity}"></div>
        `;
        
        section.appendChild(itemsContainer);
        severityList.appendChild(section);
        existingSection = section;
    }
    
    
    const itemsContainer = existingSection.querySelector(`[data-severity-items="${severity}"]`);
    const countElement = existingSection.querySelector(`[data-count="${severity}"]`);
    
    points.forEach(point => {
        const itemElement = document.createElement('div');
        itemElement.className = `severity-item ${!isInitialLoad ? 'new-item' : ''}`;
        itemElement.onclick = () => highlightMarker(point.lat, point.lng);
        itemElement.innerHTML = `
            <div class="d-flex justify-content-between align-items-start p-3 border-bottom">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center mb-1">
                        <i class="fas fa-map-marker-alt text-muted me-2"></i>
                        <strong>${point.highway} - ${point.lane}</strong>
                    </div>
                    <div class="item-details">
                        <small class="text-muted d-block">${point.type}: ${point.value} ${point.unit}</small>
                        <small class="text-muted">Chainage: ${point.startChainage} - ${point.endChainage}</small>
                    </div>
                </div>
                <div class="text-end">
                    <span class="severity-badge severity-${point.severity.toLowerCase()}">${point.severity}</span>
                </div>
            </div>
        `;
        
        itemsContainer.appendChild(itemElement);
    });
    
    
    const currentCount = parseInt(countElement.textContent.replace(/[()]/g, '')) || 0;
    countElement.textContent = `(${currentCount + points.length})`;
}


function updateLoadMoreButton() {
    const loadMoreContainer = document.getElementById('load-more-container');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const loadMoreInfo = document.getElementById('load-more-info');
    
    if (!loadMoreContainer || !currentSeverityData.length) return;
    
    
    let filteredData = currentSeverityData;
    if (currentSeverityFilter !== 'All') {
        filteredData = currentSeverityData.filter(point => point.severity === currentSeverityFilter);
    }
    
    const remainingItems = filteredData.length - currentDisplayedItems;
    
    if (remainingItems > 0) {
        loadMoreContainer.style.display = 'block';
        const itemsToLoad = Math.min(itemsPerPage, remainingItems);
        loadMoreBtn.innerHTML = `<i class="fas fa-plus"></i> Load More (${itemsToLoad})`;
        loadMoreInfo.textContent = `${remainingItems} items remaining`;
    } else {
        loadMoreContainer.style.display = 'none';
    }
}


function updateSeverityStats() {
    const showingCount = document.getElementById('showing-count');
    const totalCount = document.getElementById('total-count');
    
    if (!showingCount || !totalCount) return;
    
    
    let filteredData = currentSeverityData;
    if (currentSeverityFilter !== 'All') {
        filteredData = currentSeverityData.filter(point => point.severity === currentSeverityFilter);
    }
    
    showingCount.textContent = Math.min(currentDisplayedItems, filteredData.length);
    totalCount.textContent = filteredData.length;
}


function filterSeverityList(severity) {
    currentSeverityFilter = severity;
    currentDisplayedItems = 0;
    
    
    document.querySelectorAll('[id^="filter"]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById('filter' + severity).classList.add('active');
    
    
    generateSeverityList(currentSeverityData);
}

function highlightMarker(lat, lng) {
    const marker = markers.find(m => 
        Math.abs(m.getLatLng().lat - lat) < 0.001 && 
        Math.abs(m.getLatLng().lng - lng) < 0.001
    );
    
    if (marker) {
        
        const currentZoom = map.getZoom();
        let targetZoom;
        
        if (currentZoom < 12) {
            targetZoom = 16; 
        } else if (currentZoom < 15) {
            targetZoom = 17; 
        } else {
            targetZoom = Math.min(18, currentZoom + 2); 
        }
        
        
        map.flyTo([lat, lng], targetZoom, {
            animate: true,
            duration: 1.2,
            easeLinearity: 0.1
        });
        
        
        setTimeout(() => {
            
            const originalRadius = marker.getRadius();
            const originalColor = marker.options.color;
            const originalWeight = marker.options.weight;
            
            
            let pulseCount = 0;
            const pulseInterval = setInterval(() => {
                if (pulseCount % 2 === 0) {
                    marker.setStyle({
                        color: '#ffff00',
                        weight: 5,
                        radius: originalRadius + 3
                    });
                } else {
                    marker.setStyle({
                        color: originalColor,
                        weight: originalWeight,
                        radius: originalRadius
                    });
                }
                
                pulseCount++;
                if (pulseCount >= 4) { 
                    clearInterval(pulseInterval);
                    
                    marker.setStyle({
                        color: originalColor,
                        weight: originalWeight,
                        radius: originalRadius
                    });
                }
            }, 300);
            
            
            marker.openPopup();
            
        }, 600);
    }
}


function showLoadingSpinner(show = true) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show notification`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.getElementById('notification-container') || document.body;
    container.appendChild(notification);
    
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}


function updateTopStatisticsCards(stats) {
    
    originalStatistics = {
        total: stats.total || 0,
        high: stats.high || 0,
        medium: stats.medium || 0,
        low: stats.low || 0
    };
    
    
    document.getElementById('totalPoints').textContent = originalStatistics.total;
    document.getElementById('highSeverity').textContent = originalStatistics.high;
    document.getElementById('mediumSeverity').textContent = originalStatistics.medium;
    document.getElementById('lowSeverity').textContent = originalStatistics.low;
}


function updateDetailedStatistics(stats) {
    const statsContainer = document.getElementById('statistics');
    if (!statsContainer) return;
    
    if (stats.total > 0) {
        statsContainer.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>By Measurement Type</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Total</th>
                                    <th>High</th>
                                    <th>Medium</th>
                                    <th>Low</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(stats.by_type || {}).map(([type, counts]) => `
                                    <tr>
                                        <td>${type}</td>
                                        <td>${counts.total}</td>
                                        <td class="text-danger">${counts.high}</td>
                                        <td class="text-warning">${counts.medium}</td>
                                        <td class="text-success">${counts.low}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="col-md-6">
                    <h6>By Highway</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Highway</th>
                                    <th>Total</th>
                                    <th>High</th>
                                    <th>Medium</th>
                                    <th>Low</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.entries(stats.by_highway || {}).map(([highway, counts]) => `
                                    <tr>
                                        <td>${highway}</td>
                                        <td>${counts.total}</td>
                                        <td class="text-danger">${counts.high}</td>
                                        <td class="text-warning">${counts.medium}</td>
                                        <td class="text-success">${counts.low}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } else {
        statsContainer.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-chart-line fa-2x mb-2"></i>
                <p>No statistics available</p>
                <small>Upload data to see detailed statistics</small>
            </div>
        `;
    }
}


function resetStatisticsCards() {
    originalStatistics = { total: 0, high: 0, medium: 0, low: 0 };
    document.getElementById('totalPoints').textContent = 0;
    document.getElementById('highSeverity').textContent = 0;
    document.getElementById('mediumSeverity').textContent = 0;
    document.getElementById('lowSeverity').textContent = 0;
}

function updateFilterDropdowns(data) {
    const highways = [...new Set(data.map(d => d.highway))];
    const measurementTypes = [...new Set(data.map(d => d.type))];
    
    const highwaySelect = document.getElementById('highway-filter');
    const typeSelect = document.getElementById('type-filter');
    
    if (highwaySelect) {
        highwaySelect.innerHTML = '<option value="">All Highways</option>';
        highways.forEach(highway => {
            highwaySelect.innerHTML += `<option value="${highway}">${highway}</option>`;
        });
    }
    
    if (typeSelect) {
        typeSelect.innerHTML = '<option value="">All Types</option>';
        measurementTypes.forEach(type => {
            typeSelect.innerHTML += `<option value="${type}">${type}</option>`;
        });
    }
}


function initializeEventHandlers() {
    
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                try {
                    const result = await uploadFiles(files);
                    pavementData = result.data;
                    addMarkersToMap(pavementData);
                    updateTopStatisticsCards(result.statistics); 
                    updateDetailedStatistics(result.statistics); 
                    updateFilterDropdowns(pavementData);
                    showNotification(`Successfully uploaded ${files.length} file(s)`, 'success');
                } catch (error) {
                    showNotification(`Upload failed: ${error.message}`, 'error');
                }
            }
        });
    }
    
    
    const sampleDataBtn = document.getElementById('sample-data-btn');
    if (sampleDataBtn) {
        sampleDataBtn.addEventListener('click', async () => {
            try {
                const result = await loadSampleData();
                pavementData = result.data;
                addMarkersToMap(pavementData);
                updateTopStatisticsCards(result.statistics); 
                updateDetailedStatistics(result.statistics); 
                updateFilterDropdowns(pavementData);
                showNotification('Sample data loaded successfully', 'success');
            } catch (error) {
                showNotification(`Failed to load sample data: ${error.message}`, 'error');
            }
        });
    }
    
  
    const clearDataBtn = document.getElementById('clear-data-btn');
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to clear all data?')) {
                try {
                    await clearAllData();
                    pavementData = [];
                    clearMarkers();
                    resetStatisticsCards(); 
                    updateDetailedStatistics({ total: 0, high: 0, medium: 0, low: 0 }); 
                    showNotification('All data cleared successfully', 'success');
                } catch (error) {
                    showNotification(`Failed to clear data: ${error.message}`, 'error');
                }
            }
        });
    }

    const exportDataBtn = document.getElementById('export-data-btn');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            if (!pavementData || pavementData.length === 0) {
                showNotification('No data available to export', 'warning');
                return;
            }
            showExportModal();
        });
    }
    
    
    const severityFilter = document.getElementById('severity-filter');
    const typeFilter = document.getElementById('type-filter');
    const highwayFilter = document.getElementById('highway-filter');
    
    const applyFilters = async () => {
        const severity = severityFilter?.value || null;
        const type = typeFilter?.value || null;
        const highway = highwayFilter?.value || null;
        
        try {
            const result = await filterData(severity, type, highway);
            addMarkersToMap(result.data);
            
            updateDetailedStatistics(result.statistics); 
            showNotification(`Filter applied: ${result.total_points} points shown`, 'info');
        } catch (error) {
            showNotification(`Filter failed: ${error.message}`, 'error');
        }
    };
    
    severityFilter?.addEventListener('change', applyFilters);
    typeFilter?.addEventListener('change', applyFilters);
    highwayFilter?.addEventListener('change', applyFilters);
    
    
    const refreshDataBtn = document.getElementById('refresh-data-btn');
    if (refreshDataBtn) {
        refreshDataBtn.addEventListener('click', async () => {
            try {
                const result = await fetchData();
                pavementData = result.data;
                addMarkersToMap(pavementData);
                updateTopStatisticsCards(result.statistics);
                updateDetailedStatistics(result.statistics); 
                updateFilterDropdowns(pavementData);
                showNotification('Data refreshed successfully', 'success');
            } catch (error) {
                showNotification(`Refresh failed: ${error.message}`, 'error');
            }
        });
    }
    
    const previewExportBtn = document.getElementById('preview-export-btn');
    if (previewExportBtn) {
        previewExportBtn.addEventListener('click', previewExportData);
    }
    
    const confirmExportBtn = document.getElementById('confirm-export-btn');
    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', exportFilteredData);
    }
    
    
    const exportFilters = ['export-severity-filter', 'export-type-filter', 'export-highway-filter', 'export-limit'];
    exportFilters.forEach(filterId => {
        const filterElement = document.getElementById(filterId);
        if (filterElement) {
            filterElement.addEventListener('change', previewExportData);
        }
    });
    
    
    const exportModal = document.getElementById('exportModal');
    if (exportModal) {
        exportModal.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                previewExportData();
            }
        });
    }
    document.addEventListener('submit', function(e) {
    
    if (e.target.closest('#videoUploadArea') || 
        e.target.querySelector('#video-file-input')) {
        e.preventDefault();
        console.log('Form submission prevented to avoid page refresh');
    }
});
}


document.addEventListener('DOMContentLoaded', () => {
    console.log('NHAI NSV Dashboard initializing...');
    
    try {
        initializeMap();
        initializeEventHandlers();
        
        
        fetchData().then(result => {
            if (result.data.length > 0) {
                pavementData = result.data;
                addMarkersToMap(pavementData);
                updateTopStatisticsCards(result.statistics); 
                updateDetailedStatistics(result.statistics); 
                updateFilterDropdowns(pavementData);
            }
        }).catch(error => {
            console.log('No initial data available:', error.message);
        });
        
        console.log('NHAI NSV Dashboard initialized successfully');
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        showNotification('Failed to initialize dashboard', 'error');
    }
});


function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatValue(value, unit) {
    if (typeof value === 'number') {
        return `${value.toFixed(2)} ${unit}`;
    }
    return `${value} ${unit}`;
}

function getSeverityClass(severity) {
    return `severity-${severity.toLowerCase()}`;
}


window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    showNotification('An unexpected error occurred', 'error');
});


window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (event.reason.message && event.reason.message.includes('fetch')) {
        showNotification('Unable to connect to server. Please check if the backend is running.', 'error');
    }
});

let currentVideo = null;
let videoSyncData = [];
let currentSyncIndex = 0;
let autoNavigateEnabled = true;


const videoFileInput = document.getElementById('video-file-input');
if (videoFileInput) {
    videoFileInput.addEventListener('change', function(event) {
        event.preventDefault();
        handleVideoUpload(event);
    });
}


function handleVideoUpload(event) {
    
    event.preventDefault();
    
    const file = event.target.files[0];
    if (!file) return;
    
    
    if (!file.type.startsWith('video/')) {
        showNotification('Please select a valid video file', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    
    const videoStatus = document.getElementById('video-status');
    const processBtn = document.getElementById('process-video-btn');
    
    if (videoStatus) videoStatus.style.display = 'block';
    if (processBtn) processBtn.disabled = true;
    
    
    fetch(`${CONFIG.apiBaseUrl}/upload-video`, {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showNotification('Video uploaded successfully!', 'success');
            currentVideo = data;
            if (processBtn) processBtn.disabled = false;
            updateVideoStatus('Video uploaded. Ready for processing.');
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    })
    .catch(error => {
        console.error('Video upload error:', error);
        showNotification('Error uploading video: ' + error.message, 'error');
        updateVideoStatus('Upload failed.');
       
        event.target.value = '';
    });
}


const processVideoBtn = document.getElementById('process-video-btn');
if (processVideoBtn) {
    processVideoBtn.addEventListener('click', processVideo);
}

function processVideo() {
    if (!currentVideo) return;
    
    updateVideoStatus('Processing video for GPS extraction...');
    document.getElementById('process-video-btn').disabled = true;
    
    
    checkVideoProcessingStatus(currentVideo.video_id);
}

function checkVideoProcessingStatus(videoId) {
    fetch(`${CONFIG.apiBaseUrl}/videos/${videoId}`)  
        .then(response => response.json())
        .then(data => {
            if (data.status === 'completed') {
                updateVideoStatus('Video processing completed!');
                document.getElementById('sync-video-btn').disabled = false;
                loadVideoForPlayback(data);
            } else if (data.status === 'failed') {
                updateVideoStatus('Video processing failed: ' + data.error);
            } else {
                
                setTimeout(() => checkVideoProcessingStatus(videoId), 2000);
            }
        })
        .catch(error => {
            console.error('Video processing status error:', error);
            updateVideoStatus('Error checking video status: ' + error.message);
        });
}


const syncVideoBtn = document.getElementById('sync-video-btn');
if (syncVideoBtn) {
    syncVideoBtn.addEventListener('click', syncVideoWithData);
}

function syncVideoWithData() {
    if (!currentVideo) return;
    
    updateVideoStatus('Syncing video with survey data...');
    
    fetch(`${CONFIG.apiBaseUrl}/sync-video-data?video_id=${currentVideo.video_id}`, {  
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Video synchronized successfully!', 'success');
            loadVideoSyncResults(currentVideo.video_id);
            document.getElementById('gps-sync-status').className = 'badge bg-success';
            document.getElementById('gps-sync-status').textContent = 'Synced';
        } else {
            showNotification('Sync failed: ' + data.error, 'error');
        }
        updateVideoStatus('Sync process completed.');
    })
    .catch(error => {
        console.error('Video sync error:', error);
        showNotification('Error syncing video: ' + error.message, 'error');
        updateVideoStatus('Sync failed.');
    });
}

function loadVideoForPlayback(videoData) {
    const videoElement = document.getElementById('survey-video');
    const placeholder = document.getElementById('video-placeholder');
    
    
    videoElement.src = `${CONFIG.apiBaseUrl}/uploads/videos/${videoData.filename}`;
    
    
    videoElement.style.display = 'block';
    placeholder.style.display = 'none';
    
    
    document.getElementById('video-info').style.display = 'block';
    document.getElementById('video-duration').textContent = formatTime(videoData.duration);
    
    
    document.getElementById('video-controls-btn').disabled = false;
    
    
    videoElement.addEventListener('timeupdate', updateVideoTime);
    videoElement.addEventListener('loadedmetadata', function() {
        document.getElementById('video-navigation').style.display = 'block';
    });
}

function loadVideoSyncResults(videoId) {
    fetch(`${CONFIG.apiBaseUrl}/videos/${videoId}/mappings`)  
        .then(response => response.json())
        .then(data => {
            videoSyncData = data.mappings;
            updateSyncStatistics();
            displaySyncResults();
            document.getElementById('video-sync-section').style.display = 'block';
        })
        .catch(error => {
            console.error('Sync results error:', error);
            showNotification('Error loading sync results: ' + error.message, 'error');
        });
}

function updateSyncStatistics() {
    const totalPoints = videoSyncData.length;
    const matchedPoints = videoSyncData.filter(item => item.distance_meters <= 50).length;
    const matchRate = totalPoints > 0 ? (matchedPoints / totalPoints * 100).toFixed(1) : 0;
    const avgDistance = totalPoints > 0 ? 
        (videoSyncData.reduce((sum, item) => sum + item.distance_meters, 0) / totalPoints).toFixed(1) : 0;
    
    document.getElementById('total-sync-points').textContent = totalPoints;
    document.getElementById('matched-points').textContent = matchedPoints;
    document.getElementById('match-rate').textContent = matchRate + '%';
    document.getElementById('avg-distance').textContent = avgDistance + 'm';
}

function displaySyncResults() {
    const tbody = document.getElementById('sync-results-table');
    tbody.innerHTML = '';
    
    videoSyncData.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>Point ${item.survey_point_id}</td>
            <td>
                <a href="#" class="video-time-link" onclick="jumpToVideoTime(${item.video_timestamp})">
                    ${formatTime(item.video_timestamp)}
                </a>
            </td>
            <td>${item.distance_meters.toFixed(1)}m</td>
            <td>
                <span class="badge bg-${getSeverityColor(item.survey_data.severity)}">
                    ${item.survey_data.severity}
                </span>
            </td>
            <td class="sync-actions">
                <button class="btn btn-sm btn-outline-primary btn-video-action" onclick="jumpToVideoTime(${item.video_timestamp})">
                    <i class="fas fa-play"></i>
                </button>
                <button class="btn btn-sm btn-outline-success btn-video-action" onclick="showOnMap(${item.survey_data.lat}, ${item.survey_data.lng})">
                    <i class="fas fa-map-marker-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}


function jumpToVideoTime(timestamp) {
    const videoElement = document.getElementById('survey-video');
    if (videoElement) {
        videoElement.currentTime = timestamp;
        videoElement.play();
    }
}

function updateVideoTime() {
    const videoElement = document.getElementById('survey-video');
    document.getElementById('video-current-time').textContent = formatTime(videoElement.currentTime);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}


const prevPointBtn = document.getElementById('prev-point-btn');
if (prevPointBtn) {
    prevPointBtn.addEventListener('click', function() {
        if (currentSyncIndex > 0) {
            currentSyncIndex--;
            jumpToSyncPoint(currentSyncIndex);
        }
    });
}

const nextPointBtn = document.getElementById('next-point-btn');
if (nextPointBtn) {
    nextPointBtn.addEventListener('click', function() {
        if (currentSyncIndex < videoSyncData.length - 1) {
            currentSyncIndex++;
            jumpToSyncPoint(currentSyncIndex);
        }
    });
}

function jumpToSyncPoint(index) {
    if (index >= 0 && index < videoSyncData.length) {
        const syncPoint = videoSyncData[index];
        jumpToVideoTime(syncPoint.video_timestamp);
        document.getElementById('current-survey-point').textContent = 
            `Point ${syncPoint.survey_point_id} - ${syncPoint.survey_data.severity}`;
        currentSyncIndex = index;
    }
}


const videoControlsBtn = document.getElementById('video-controls-btn');
if (videoControlsBtn) {
    videoControlsBtn.addEventListener('click', function() {
        new bootstrap.Modal(document.getElementById('videoControlsModal')).show();
    });
}


const applyVideoSettingsBtn = document.getElementById('apply-video-settings');
if (applyVideoSettingsBtn) {
    applyVideoSettingsBtn.addEventListener('click', function() {
        const speed = document.getElementById('playback-speed').value;
        const autoNav = document.getElementById('auto-navigate').checked;
        

        const videoElement = document.getElementById('survey-video');
        if (videoElement) {
            videoElement.playbackRate = parseFloat(speed);
        }
        

        autoNavigateEnabled = autoNav;
        

        bootstrap.Modal.getInstance(document.getElementById('videoControlsModal')).hide();
        
        showNotification('Video settings applied!', 'success');
    });
}


const syncToleranceInput = document.getElementById('sync-tolerance');
if (syncToleranceInput) {
    syncToleranceInput.addEventListener('input', function() {
        const toleranceValue = document.getElementById('tolerance-value');
        if (toleranceValue) {
            toleranceValue.textContent = this.value + 'm';
        }
    });
}


function updateVideoStatus(message) {
    const statusElement = document.getElementById('video-status');
    statusElement.innerHTML = `<div class="alert alert-info"><i class="fas fa-info-circle"></i> ${message}</div>`;
}

function getSeverityColor(severity) {
    switch(severity) {
        case 'High': return 'danger';
        case 'Medium': return 'warning';
        case 'Low': return 'success';
        default: return 'secondary';
    }
}

function showOnMap(lat, lng) {
    if (map) {
        map.setView([lat, lng], 16);

        const marker = L.marker([lat, lng]).addTo(map);
        setTimeout(() => map.removeLayer(marker), 3000);
    }
}


document.addEventListener('DOMContentLoaded', function() {
    const videoUploadArea = document.getElementById('videoUploadArea');
    const videoFileInput = document.getElementById('video-file-input');

    if (videoUploadArea && videoFileInput) {
        videoUploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            videoUploadArea.classList.add('drag-over');
        });

        videoUploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            videoUploadArea.classList.remove('drag-over');
        });

        videoUploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            videoUploadArea.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                
                const changeEvent = new Event('change', { bubbles: true });
                videoFileInput.files = files;
                
                
                handleVideoUpload({ 
                    target: videoFileInput, 
                    preventDefault: () => {},
                    files: files 
                });
            }
        });

        videoUploadArea.addEventListener('click', function(e) {
            e.preventDefault();
            if (e.target.tagName !== 'BUTTON') {
                videoFileInput.click();
            }
        });
    }
});