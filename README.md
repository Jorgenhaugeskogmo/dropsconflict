# 🚁 Drone Heatmap - GitHub Pages

Et statisk webprosjekt for visualisering av drone-data som heatmap på Leaflet-kart. Prosjektet kjører 100% i nettleseren med lokal filbehandling - ingen server nødvendig.

## ✨ Funksjoner

- **📊 Filopplasting**: Støtter CSV og XLSX-filer
- **🗺️ Interaktivt kart**: Leaflet med OpenStreetMap
- **🔥 Heatmap visualisering**: Justerbar radius og blur
- **📍 Helipad-visning**: Med sirkler for 250m, 500m og 1000m
- **⏰ Tidsfilter**: Filtrer data basert på dato
- **🔍 Autodeteksjon**: Automatisk gjenkjenning av kolonnenavn
- **📱 Responsivt design**: Fungerer på desktop og mobil
- **🔒 Personvern**: All behandling skjer lokalt i nettleseren

## 🚀 Kom i gang

### 1. Last ned prosjektet
```bash
git clone <ditt-repo-url>
cd drone-heatmap-ghpages
```

### 2. Åpne i nettleser
Åpne `index.html` i en moderne nettleser (Chrome, Firefox, Safari).

### 3. Test med demo-data
Klikk på "🎯 Last demo-data" for å se eksempeldata.

## 📁 Filformat

### Hoveddata (CSV/XLSX)
Forventede kolonnenavn:
- **Latitude**: `lat`, `latitude`, `breddegrad`, `y`
- **Longitude**: `lon`, `lng`, `long`, `longitude`, `lengdegrad`, `x`
- **Tid** (valgfritt): `time`, `timestamp`, `ts`, `date`, `dato`, `fra`, `from`, `start`

Eksempel CSV:
```csv
lat,lon,timestamp,drone_id,altitude
59.9139,10.7522,2024-01-15T08:30:00Z,DRONE001,120
60.3913,5.3221,2024-01-15T09:15:00Z,DRONE002,95
```

### Helipads (CSV)
```csv
name,lat,lon
Oslo Lufthavn,59.9139,10.7522
Bergen Lufthavn,60.2934,5.2181
```

## 🌐 GitHub Pages deploy

### 1. Opprett GitHub repository
```bash
git init
git add .
git commit -m "Initial commit: Drone Heatmap app"
git branch -M main
git remote add origin https://github.com/ditt-brukernavn/drone-heatmap-ghpages.git
git push -u origin main
```

### 2. Aktiver GitHub Pages
1. Gå til repository på GitHub
2. Klikk på **Settings** tab
3. Scroll ned til **Pages** seksjon
4. Under **Source**, velg **Deploy from a branch**
5. Velg **Branch: main** og **Folder: / (root)**
6. Klikk **Save**

### 3. Åpne siden
Din app vil være tilgjengelig på:
`https://ditt-brukernavn.github.io/drone-heatmap-ghpages`

## 🛠️ Bruk

### 1. Last opp data
- Klikk "📊 Last opp data" og velg CSV eller XLSX-fil
- Appen vil automatisk prøve å gjenkjenne kolonnenavn

### 2. Mapp kolonner
- Velg riktige kolonner for Latitude og Longitude
- Velg tidskolonne hvis tilgjengelig

### 3. Juster heatmap
- **Radius**: Styr størrelsen på heatmap-punktene (5-50px)
- **Blur**: Styr hvor mye heatmap-punktene blandes (5-30px)

### 4. Filtrer på tid
- Hvis tidskolonne er valgt, kan du filtrere på dato
- Velg "Fra dato" og "Til dato" for å begrense tidsperiode

### 5. Legg til helipads
- Last opp `helipads.csv` for å vise helipad-posisjoner
- Hver helipad vises med sirkler for 250m, 500m og 1000m

## 🔧 Tekniske detaljer

### Biblioteker (CDN)
- **Leaflet 1.9.4**: Kartbibliotek
- **leaflet.heat 0.2.0**: Heatmap plugin
- **PapaParse 5.4.1**: CSV parsing med web worker
- **SheetJS 0.18.5**: XLSX parsing

### Ytelse
- CSV-parsing bruker web worker for å unngå UI-blokkering
- Støtter store filer (hundretusener av rader)
- Alle beregninger skjer lokalt i nettleseren

### Kompatibilitet
- **Chrome**: Full støtte
- **Firefox**: Full støtte  
- **Safari**: Full støtte
- **Edge**: Full støtte

## ⚠️ Begrensninger

- Store XLSX-filer kan være trege - konverter til CSV for bedre ytelse
- Maksimal filstørrelse begrenses av nettleserens minne
- Krever moderne nettleser med ES6+ støtte

## 📄 Lisens

MIT License - se [LICENSE](LICENSE) fil for detaljer.

## 🤝 Bidrag

Bidrag er velkomne! Opprett en issue eller pull request.

## 📞 Support

Hvis du opplever problemer:
1. Sjekk at filformatet er korrekt
2. Sjekk at koordinatene er gyldige (lat: -90 til 90, lon: -180 til 180)
3. Prøv med demo-data først
4. Sjekk nettleserens konsoll for feilmeldinger

---

**Utviklet med ❤️ for drone-operatører**
