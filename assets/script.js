// Globale variabler
let map;
let heatLayer;
let helipadsGroup;
let currentData = [];
let helipads = [];

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
    
    const detected = {
        latKey: '',
        lonKey: ''
    };
    
    headers.forEach(header => {
        const lowerHeader = header.toLowerCase().trim();
        
        if (latPatterns.some(pattern => lowerHeader.includes(pattern))) {
            detected.latKey = header;
        }
        if (lonPatterns.some(pattern => lowerHeader.includes(pattern))) {
            detected.lonKey = header;
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

function processData(rows, mapping) {
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
            
            validPoints.push({
                lat: lat,
                lon: lon,
                originalRow: row
            });
        } catch (error) {
            console.warn(`Feil ved prosessering av rad ${index + 1}:`, error);
        }
    });
    
    return validPoints;
}

function updateCount(total) {
    document.getElementById('pointCount').textContent = `Punkter: ${total}`;
}

function updateHelipadCount(total) {
    document.getElementById('helipadCount').textContent = `Helipads: ${total}`;
}

function drawHeat(points) {
    const heatPoints = points.map(point => [point.lat, point.lon, 1]);
    
    heatLayer.setLatLngs(heatPoints);
    
    // Oppdater helipad-telling hvis vi har helipads
    if (helipads.length > 0) {
        updateHelipadCounts(points);
    }
    
    // Fit bounds hvis vi har punkter
    if (points.length > 0) {
        const group = new L.featureGroup();
        points.forEach(point => {
            group.addLayer(L.marker([point.lat, point.lon]));
        });
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Funksjon for å telle punkter rundt helipads
function countPointsAroundHelipad(helipad, points, radiusKm = 1) {
    return points.filter(point => {
        const distance = calculateDistance(
            helipad.lat, helipad.lon,
            point.lat, point.lon
        );
        return distance <= radiusKm;
    }).length;
}

// Funksjon for å beregne avstand mellom to punkter (i km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Jordens radius i km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Oppdater telling rundt hver helipad
function updateHelipadCounts(points) {
    helipads.forEach(helipad => {
        const count = countPointsAroundHelipad(helipad, points);
        helipad.count = count;
        
        // Oppdater popup med ny telling
        const popupContent = `<b>${helipad.name}</b><br>
                             Lat: ${helipad.lat.toFixed(6)}<br>
                             Lon: ${helipad.lon.toFixed(6)}<br>
                             <strong>Punkter innen 1km: ${count}</strong>`;
        
        helipad.marker.setPopupContent(popupContent);
    });
}

// 3) UI-hendelser
function setupEventListeners() {
    // Hoveddata filopplasting
    document.getElementById('dataFile').addEventListener('change', handleDataFile);
    
    // Helipads filopplasting
    document.getElementById('helipadsFile').addEventListener('change', handleHelipadsFile);
    
    // Demo knapp
    document.getElementById('loadDemo').addEventListener('click', loadDemoData);
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
        
        // Prøv autodeteksjon av kolonner
        const detected = detectColumns(result.headers);
        
        if (!detected.latKey || !detected.lonKey) {
            throw new Error('Kunne ikke finne latitude og longitude kolonner. Sjekk at filen har kolonner som "lat", "latitude", "lon", "longitude" etc.');
        }
        
        // Prosesser data
        const processedData = processData(result.rows, detected);
        
        if (processedData.length === 0) {
            throw new Error('Ingen gyldige koordinater funnet i filen');
        }
        
        currentData = processedData;
        updateCount(processedData.length);
        drawHeat(processedData);
        
        console.log(`Lastet ${processedData.length} punkter fra ${file.name}`);
        
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
        
        const result = await parseCSV(file);
        
        // Fjern eksisterende helipads
        helipadsGroup.clearLayers();
        helipads = [];
        
        result.data.forEach(row => {
            const lat = toNumber(row.lat);
            const lon = toNumber(row.lon);
            const name = row.name || 'Helipad';
            
            if (isNaN(lat) || isNaN(lon)) {
                console.warn('Ugyldig helipad koordinat:', row);
                return;
            }
            
            // Opprett marker
            const marker = L.circleMarker([lat, lon], {
                radius: 8,
                fillColor: '#FF5722',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });
            
            // Opprett popup
            const popupContent = `<b>${name}</b><br>
                                 Lat: ${lat.toFixed(6)}<br>
                                 Lon: ${lon.toFixed(6)}<br>
                                 <strong>Punkter innen 1km: 0</strong>`;
            
            marker.bindPopup(popupContent);
            helipadsGroup.addLayer(marker);
            
            // Lagre helipad data
            helipads.push({
                name: name,
                lat: lat,
                lon: lon,
                marker: marker,
                count: 0
            });
            
            // Legg til sirkel for 1km radius
            const circle = L.circle([lat, lon], {
                radius: 1000, // 1km i meter
                color: '#FF5722',
                weight: 2,
                fill: false,
                dashArray: '5,5'
            });
            helipadsGroup.addLayer(circle);
        });
        
        updateHelipadCount(helipads.length);
        
        // Oppdater telling hvis vi allerede har data
        if (currentData.length > 0) {
            updateHelipadCounts(currentData);
        }
        
        console.log(`Lastet ${helipads.length} helipads`);
        
    } catch (error) {
        alert('Feil ved lasting av helipads: ' + error.message);
        console.error('Helipads lasting feil:', error);
    } finally {
        showLoading(false);
    }
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
        
        // Autodeteksjon
        const detected = detectColumns(result.headers);
        
        if (!detected.latKey || !detected.lonKey) {
            throw new Error('Demo-data har ikke riktige kolonnenavn');
        }
        
        // Prosesser data
        const processedData = processData(result.rows, detected);
        
        currentData = processedData;
        updateCount(processedData.length);
        drawHeat(processedData);
        
        // Last også demo helipads
        try {
            const helipadsResponse = await fetch('data/helipads.csv');
            if (helipadsResponse.ok) {
                const helipadsText = await helipadsResponse.text();
                const helipadsResult = await parseCSV(new Blob([helipadsText], { type: 'text/csv' }));
                
                // Fjern eksisterende helipads
                helipadsGroup.clearLayers();
                helipads = [];
                
                helipadsResult.data.forEach(row => {
                    const lat = toNumber(row.lat);
                    const lon = toNumber(row.lon);
                    const name = row.name || 'Helipad';
                    
                    if (isNaN(lat) || isNaN(lon)) return;
                    
                    // Opprett marker
                    const marker = L.circleMarker([lat, lon], {
                        radius: 8,
                        fillColor: '#FF5722',
                        color: '#fff',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    });
                    
                    // Opprett popup
                    const popupContent = `<b>${name}</b><br>
                                         Lat: ${lat.toFixed(6)}<br>
                                         Lon: ${lon.toFixed(6)}<br>
                                         <strong>Punkter innen 1km: 0</strong>`;
                    
                    marker.bindPopup(popupContent);
                    helipadsGroup.addLayer(marker);
                    
                    // Lagre helipad data
                    helipads.push({
                        name: name,
                        lat: lat,
                        lon: lon,
                        marker: marker,
                        count: 0
                    });
                    
                    // Legg til sirkel for 1km radius
                    const circle = L.circle([lat, lon], {
                        radius: 1000,
                        color: '#FF5722',
                        weight: 2,
                        fill: false,
                        dashArray: '5,5'
                    });
                    helipadsGroup.addLayer(circle);
                });
                
                updateHelipadCount(helipads.length);
                updateHelipadCounts(processedData);
            }
        } catch (error) {
            console.warn('Kunne ikke laste demo helipads:', error);
        }
        
        console.log(`Lastet ${processedData.length} demo-punkter`);
        
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