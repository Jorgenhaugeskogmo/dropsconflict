// Globale variabler
let map;
let heatLayer;
let helipadsGroup;
let currentData = [];
let filteredData = [];
let currentMapping = { latKey: '', lonKey: '', timeKey: '' };

// Initialiser kart når DOM er lastet
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    setupEventListeners();
    loadDemoData();
});

// 1) Init Leaflet-kart
function initMap() {
    // Opprett kart sentrert på Norge
    map = L.map('map').setView([64.5, 12.0], 5);
    
    // Legg til OSM tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    // Opprett heat layer
    heatLayer = L.heatLayer([], {
        radius: 25,
        blur: 15,
        maxZoom: 12,
        gradient: {
            0.4: 'blue',
            0.6: 'cyan',
            0.7: 'lime',
            0.8: 'yellow',
            1.0: 'red'
        }
    }).addTo(map);
    
    // Opprett helipads gruppe
    helipadsGroup = L.layerGroup().addTo(map);
}

// 2) Hjelpefunksjoner
function detectColumns(headers) {
    const latPatterns = ['lat', 'latitude', 'breddegrad', 'y'];
    const lonPatterns = ['lon', 'lng', 'long', 'longitude', 'lengdegrad', 'x'];
    const timePatterns = ['time', 'timestamp', 'ts', 'date', 'dato', 'fra', 'from', 'start'];
    
    const detected = {
        latKey: '',
        lonKey: '',
        timeKey: ''
    };
    
    headers.forEach(header => {
        const lowerHeader = header.toLowerCase().trim();
        
        if (latPatterns.some(pattern => lowerHeader.includes(pattern))) {
            detected.latKey = header;
        }
        if (lonPatterns.some(pattern => lowerHeader.includes(pattern))) {
            detected.lonKey = header;
        }
        if (timePatterns.some(pattern => lowerHeader.includes(pattern))) {
            detected.timeKey = header;
        }
    });
    
    return detected;
}

function toNumber(str) {
    if (typeof str === 'number') return str;
    if (typeof str !== 'string') return NaN;
    
    // Erstatt komma med punkt for norske desimaler
    const normalized = str.replace(',', '.');
    return parseFloat(normalized);
}

function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            worker: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.errors.length > 0) {
                    console.warn('CSV parsing warnings:', results.errors);
                }
                resolve({
                    rows: results.data,
                    headers: results.meta.fields || []
                });
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

function parseXLSX(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Les første sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Konverter til JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (jsonData.length === 0) {
                    reject(new Error('Excel-filen er tom'));
                    return;
                }
                
                // Første rad er headers
                const headers = jsonData[0];
                const rows = jsonData.slice(1).map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = row[index] || '';
                    });
                    return obj;
                });
                
                resolve({ rows, headers });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Kunne ikke lese fil'));
        reader.readAsArrayBuffer(file);
    });
}

function applyMapping(rows, mapping) {
    const validPoints = [];
    
    rows.forEach((row, index) => {
        try {
            const lat = toNumber(row[mapping.latKey]);
            const lon = toNumber(row[mapping.lonKey]);
            
            if (isNaN(lat) || isNaN(lon)) {
                console.warn(`Ugyldig koordinat på rad ${index + 1}:`, row);
                return;
            }
            
            // Sjekk at koordinatene er innenfor rimelige grenser
            if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                console.warn(`Koordinat utenfor gyldig område på rad ${index + 1}:`, { lat, lon });
                return;
            }
            
            let timestamp = null;
            if (mapping.timeKey && row[mapping.timeKey]) {
                const timeStr = row[mapping.timeKey];
                timestamp = new Date(timeStr);
                if (isNaN(timestamp.getTime())) {
                    console.warn(`Ugyldig tidsstempel på rad ${index + 1}:`, timeStr);
                    timestamp = null;
                }
            }
            
            validPoints.push({
                lat: lat,
                lon: lon,
                ts: timestamp,
                originalRow: row
            });
        } catch (error) {
            console.warn(`Feil ved prosessering av rad ${index + 1}:`, error);
        }
    });
    
    return validPoints;
}

function filterByDate(points, fromDate, toDate) {
    if (!fromDate && !toDate) return points;
    
    return points.filter(point => {
        if (!point.ts) return true; // Behold punkter uten tidsstempel
        
        const pointTime = point.ts.getTime();
        const fromTime = fromDate ? new Date(fromDate).getTime() : 0;
        const toTime = toDate ? new Date(toDate).getTime() : Number.MAX_SAFE_INTEGER;
        
        return pointTime >= fromTime && pointTime <= toTime;
    });
}

function updateCount(total, filtered) {
    document.getElementById('pointCount').textContent = `Punkter: ${total}`;
    document.getElementById('filteredCount').textContent = `Filtrert: ${filtered}`;
}

function drawHeat(points, options = {}) {
    const heatPoints = points.map(point => [point.lat, point.lon, 1]);
    
    heatLayer.setLatLngs(heatPoints);
    heatLayer.setOptions({
        radius: options.radius || 25,
        blur: options.blur || 15
    });
    
    // Fit bounds hvis vi har punkter
    if (points.length > 0) {
        const group = new L.featureGroup();
        points.forEach(point => {
            group.addLayer(L.marker([point.lat, point.lon]));
        });
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

function loadHelipads(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            worker: true,
            skipEmptyLines: true,
            complete: function(results) {
                try {
                    // Fjern eksisterende helipads
                    helipadsGroup.clearLayers();
                    
                    results.data.forEach(row => {
                        const lat = toNumber(row.lat);
                        const lon = toNumber(row.lon);
                        const name = row.name || 'Helipad';
                        
                        if (isNaN(lat) || isNaN(lon)) {
                            console.warn('Ugyldig helipad koordinat:', row);
                            return;
                        }
                        
                        // Legg til marker
                        const marker = L.circleMarker([lat, lon], {
                            radius: 6,
                            fillColor: '#FF5722',
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).bindPopup(`<b>${name}</b><br>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}`);
                        
                        helipadsGroup.addLayer(marker);
                        
                        // Legg til sirkler for 250m, 500m, 1000m
                        const circles = [
                            { radius: 250, color: '#FF5722', className: 'helipad-circle-250' },
                            { radius: 500, color: '#FF9800', className: 'helipad-circle-500' },
                            { radius: 1000, color: '#4CAF50', className: 'helipad-circle-1000' }
                        ];
                        
                        circles.forEach(circle => {
                            const circleLayer = L.circle([lat, lon], {
                                radius: circle.radius,
                                color: circle.color,
                                weight: 2,
                                fill: false,
                                dashArray: '5,5'
                            });
                            helipadsGroup.addLayer(circleLayer);
                        });
                    });
                    
                    resolve(results.data.length);
                } catch (error) {
                    reject(error);
                }
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

// 3) UI-hendelser
function setupEventListeners() {
    // Hoveddata filopplasting
    document.getElementById('dataFile').addEventListener('change', handleDataFile);
    
    // Helipads filopplasting
    document.getElementById('helipadsFile').addEventListener('change', handleHelipadsFile);
    
    // Kolonnemapping endringer
    document.getElementById('latColumn').addEventListener('change', handleMappingChange);
    document.getElementById('lonColumn').addEventListener('change', handleMappingChange);
    document.getElementById('timeColumn').addEventListener('change', handleMappingChange);
    
    // Slider endringer
    document.getElementById('radiusSlider').addEventListener('input', handleSliderChange);
    document.getElementById('blurSlider').addEventListener('input', handleSliderChange);
    
    // Dato filter endringer
    document.getElementById('fromDate').addEventListener('change', handleDateFilter);
    document.getElementById('toDate').addEventListener('change', handleDateFilter);
    
    // Demo knapp
    document.getElementById('loadDemo').addEventListener('click', loadDemoData);
    
    // Oppdater slider labels
    document.getElementById('radiusSlider').addEventListener('input', function() {
        document.getElementById('radiusValue').textContent = this.value;
    });
    
    document.getElementById('blurSlider').addEventListener('input', function() {
        document.getElementById('blurValue').textContent = this.value;
    });
}

async function handleDataFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        showLoading(true);
        
        let result;
        if (file.name.toLowerCase().endsWith('.csv')) {
            result = await parseCSV(file);
        } else if (file.name.toLowerCase().endsWith('.xlsx')) {
            result = await parseXLSX(file);
        } else {
            throw new Error('Ustøttet filformat');
        }
        
        currentData = result.rows;
        populateColumnSelects(result.headers);
        
        // Prøv autodeteksjon
        const detected = detectColumns(result.headers);
        if (detected.latKey) {
            document.getElementById('latColumn').value = detected.latKey;
        }
        if (detected.lonKey) {
            document.getElementById('lonColumn').value = detected.lonKey;
        }
        if (detected.timeKey) {
            document.getElementById('timeColumn').value = detected.timeKey;
            document.getElementById('dateFilterGroup').style.display = 'block';
        }
        
        handleMappingChange();
        
    } catch (error) {
        alert('Feil ved lasting av fil: ' + error.message);
        console.error('Fil lasting feil:', error);
    } finally {
        showLoading(false);
    }
}

async function handleHelipadsFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        showLoading(true);
        const count = await loadHelipads(file);
        console.log(`Lastet ${count} helipads`);
    } catch (error) {
        alert('Feil ved lasting av helipads: ' + error.message);
        console.error('Helipads lasting feil:', error);
    } finally {
        showLoading(false);
    }
}

function populateColumnSelects(headers) {
    const selects = ['latColumn', 'lonColumn', 'timeColumn'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        const currentValue = select.value;
        
        // Behold første option (placeholder)
        select.innerHTML = selectId === 'timeColumn' ? 
            '<option value="">Ingen tidskolonne</option>' : 
            '<option value="">Velg kolonne...</option>';
        
        headers.forEach(header => {
            const option = document.createElement('option');
            option.value = header;
            option.textContent = header;
            select.appendChild(option);
        });
        
        // Prøv å gjenopprett valgt verdi
        if (currentValue && headers.includes(currentValue)) {
            select.value = currentValue;
        }
    });
}

function handleMappingChange() {
    const latKey = document.getElementById('latColumn').value;
    const lonKey = document.getElementById('lonColumn').value;
    const timeKey = document.getElementById('timeColumn').value;
    
    if (!latKey || !lonKey) {
        updateCount(0, 0);
        drawHeat([]);
        return;
    }
    
    currentMapping = { latKey, lonKey, timeKey };
    
    const mappedData = applyMapping(currentData, currentMapping);
    currentData = mappedData;
    
    handleDateFilter();
}

function handleDateFilter() {
    const fromDate = document.getElementById('fromDate').value;
    const toDate = document.getElementById('toDate').value;
    
    filteredData = filterByDate(currentData, fromDate, toDate);
    
    updateCount(currentData.length, filteredData.length);
    
    const radius = parseInt(document.getElementById('radiusSlider').value);
    const blur = parseInt(document.getElementById('blurSlider').value);
    
    drawHeat(filteredData, { radius, blur });
}

function handleSliderChange() {
    if (filteredData.length === 0) return;
    
    const radius = parseInt(document.getElementById('radiusSlider').value);
    const blur = parseInt(document.getElementById('blurSlider').value);
    
    drawHeat(filteredData, { radius, blur });
}

// 4) Demo-data
async function loadDemoData() {
    try {
        showLoading(true);
        
        // Last sample.csv
        const response = await fetch('data/sample.csv');
        if (!response.ok) {
            throw new Error('Kunne ikke laste demo-data');
        }
        
        const csvText = await response.text();
        const result = await parseCSV(new Blob([csvText], { type: 'text/csv' }));
        
        currentData = result.rows;
        populateColumnSelects(result.headers);
        
        // Sett opp mapping
        document.getElementById('latColumn').value = 'lat';
        document.getElementById('lonColumn').value = 'lon';
        document.getElementById('timeColumn').value = 'timestamp';
        document.getElementById('dateFilterGroup').style.display = 'block';
        
        handleMappingChange();
        
        // Last helipads
        try {
            const helipadsResponse = await fetch('data/helipads.csv');
            if (helipadsResponse.ok) {
                const helipadsText = await helipadsResponse.text();
                await loadHelipads(new Blob([helipadsText], { type: 'text/csv' }));
            }
        } catch (error) {
            console.warn('Kunne ikke laste helipads:', error);
        }
        
    } catch (error) {
        alert('Feil ved lasting av demo-data: ' + error.message);
        console.error('Demo data feil:', error);
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    const sidebar = document.getElementById('sidebar');
    if (show) {
        sidebar.classList.add('loading');
    } else {
        sidebar.classList.remove('loading');
    }
}

// Initialiser app
console.log('🚁 Drone Heatmap app initialisert');
