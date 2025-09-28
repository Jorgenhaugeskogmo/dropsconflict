// Globale variabler
let map;
let heatLayer;
let currentData = [];

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

function drawHeat(points) {
    const heatPoints = points.map(point => [point.lat, point.lon, 1]);
    
    heatLayer.setLatLngs(heatPoints);
    
    // Fit bounds hvis vi har punkter
    if (points.length > 0) {
        const group = new L.featureGroup();
        points.forEach(point => {
            group.addLayer(L.marker([point.lat, point.lon]));
        });
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// 3) UI-hendelser
function setupEventListeners() {
    // Hoveddata filopplasting
    document.getElementById('dataFile').addEventListener('change', handleDataFile);
    
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