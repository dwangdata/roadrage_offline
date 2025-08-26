# FleetSense: Intelligent Road Quality Monitoring for Fleet Operations

## Project Overview

FleetSense is an intelligent road quality monitoring system that transforms company smartphones into smart sensors for optimizing fleet operations. Using device accelerometer data combined with GPS tracking, it creates comprehensive intelligence about road conditions on routes critical to drilling operations and enables data-driven operational decisions.

### 🚛 Key Features
- **Real-time Road Quality Detection**: Uses smartphone sensors to measure vehicle vibrations and road conditions
- **Offline-First Architecture**: Full functionality without internet connectivity during remote site trips
- **Route Intelligence Mapping**: Interactive maps with color-coded roughness indicators for operational routes
- **Historical Trip Data**: Company-controlled road condition database from previous trips
- **Comprehensive Documentation**: Video, audio, GPS, and sensor data synchronization
- **Authority Engagement Tools**: Evidence-based data for infrastructure improvement advocacy
- **Operational Analytics**: Real-time analysis and cost impact insights

### 🛠️ Technology Stack
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Mapping**: Leaflet.js with OpenStreetMap integration
- **Visualization**: Chart.js for real-time data display
- **Storage**: IndexedDB for offline data persistence
- **APIs**: Device Motion, Geolocation, MediaRecorder
- **Deployment**: GitHub Pages with Jekyll

## 📊 Business Presentation Materials

This repository includes comprehensive business presentation materials for pitching FleetSense as an operational improvement initiative for company fleet operations:

### 📁 Presentation Documents
- **[BUSINESS_PRESENTATION.md](BUSINESS_PRESENTATION.md)** - Complete 10-minute slide deck for internal leadership presentation
- **[EXECUTIVE_SUMMARY.md](EXECUTIVE_SUMMARY.md)** - Detailed business case and operational impact analysis  
- **[PRESENTATION_NOTES.md](PRESENTATION_NOTES.md)** - Comprehensive speaking notes with timing for internal pitch
- **[DEMO_SCRIPT.md](DEMO_SCRIPT.md)** - Step-by-step live demonstration guide adapted for fleet operations
- **[VISUAL_ASSETS_GUIDE.md](VISUAL_ASSETS_GUIDE.md)** - Visual specifications and image requirements for truck fleet context

### 🎯 Presentation Structure (10 Minutes Total)
1. **The Hook** (1 min) - Fleet operational challenges and opportunity
2. **Business Problem** (1 min) - Current operational costs and inefficiencies  
3. **Our Solution** (1.5 min) - FleetSense platform overview for truck operations
4. **Live Demo** (2 min) - Interactive application demonstration showing fleet use cases
5. **Business Impact** (1 min) - ROI analysis and operational benefits
6. **Implementation Strategy** (1 min) - Phased deployment approach
7. **Technical Advantages** (1 min) - Why this technology works for our operations
8. **Authority Engagement** (1 min) - Strategic infrastructure advocacy approach
9. **Project Investment** (1 min) - Resource requirements and expected returns
10. **Vision & Next Steps** (0.5 min) - Future operational excellence

### 💼 Key Business Value Propositions
- **"Intelligent Route Intelligence"** - Data-driven operational decision making  
- **Cost Reduction** - 20-30% savings in vehicle maintenance and operational delays
- **Authority Engagement** - Evidence-based infrastructure improvement advocacy
- **Fleet Optimization** - Route planning based on real condition data
- **Strategic Positioning** - Industry leadership in operational intelligence

## 🚀 Running the Application

### Local Development
```bash
# Clone the repository
git clone https://github.com/RupinDalvi/roadrage_offline.git
cd roadrage_offline

# Start local web server
python3 -m http.server 8080

# Access application
open http://localhost:8080
```

### Live Demo
The application is deployed and accessible at: [GitHub Pages URL]

### Browser Requirements
- Modern web browser with ES6+ support
- HTTPS required for device sensor access
- Geolocation and camera permissions needed
- Works on mobile and desktop platforms

## 📱 How It Works

### For Fleet Operations:
1. **Install the app** on company smartphones in fleet vehicles
2. **Grant permissions** for location, motion sensors, and camera access
3. **Start a trip** - app begins automatic data collection during route to drill sites
4. **Drive normally** - sensors detect road roughness and conditions in real-time
5. **View live intelligence** - color-coded route quality data for operational decisions
6. **Access insights** - historical data and route optimization recommendations
7. **Generate reports** - Evidence for authority engagement and operational analysis

### For Management:
1. **Access operational dashboard** with fleet-wide route intelligence
2. **Identify problem routes** using comprehensive roughness and cost data
3. **Optimize route planning** based on actual road conditions and operational costs
4. **Plan maintenance** through predictive analysis based on route exposure
5. **Engage authorities** using evidence-based data for infrastructure improvements

## 🏢 Business Model

### Internal Value Creation:
- **Operational Efficiency**: 20-30% reduction in vehicle maintenance costs
- **Route Optimization**: Data-driven route planning reducing delays and fuel costs  
- **Risk Management**: Proactive hazard identification and safety improvement
- **Strategic Advocacy**: Evidence-based infrastructure improvement requests

### Implementation Costs:
- **Initial Setup**: $25,000 for full fleet integration
- **Annual Operating**: $5,000 for system maintenance and improvements
- **Expected Savings**: $75,000 annually in operational improvements

### Target Benefits:
- Fleet operations and dispatch planning
- Vehicle maintenance and cost management
- Driver safety and operational efficiency
- Authority engagement and infrastructure advocacy
- Strategic route planning and optimization

## 🔧 Technical Architecture

### Sensor Data Processing:
```javascript
// High-pass filter for vibration detection
lastLowPassZ = HPF_ALPHA * lastLowPassZ + (1 - HPF_ALPHA) * z;
accelerometerBuffer.push(z - lastLowPassZ);

// Roughness calculation using variance
const roughness = calculateVariance(accelerometerBuffer);
```

### Offline Storage:
- IndexedDB for ride data and historical roughness maps
- Local data persistence with cloud sync capabilities
- Geospatial indexing for efficient location-based queries

### Real-time Visualization:
- Live updating charts showing vibration levels
- Color-coded map overlays (green = smooth, red = rough)
- Interactive historical data from previous rides

## 📈 Operational Impact

### Quantified Business Benefits: $75,000 Annual Savings
- Vehicle maintenance cost reduction: $35,000 (20-30% improvement)
- Operational efficiency improvements: $25,000 (reduced delays, fuel optimization)
- Risk management and safety: $15,000 (decreased vehicle damage, safety incidents)

### Strategic Advantages:
- **Data-Driven Operations**: Route planning based on real condition intelligence
- **Predictive Maintenance**: Vehicle maintenance scheduling informed by route analysis
- **Authority Partnerships**: Evidence-based infrastructure advocacy positioning
- **Operational Excellence**: Industry leadership in intelligent fleet management
- **Cost Control**: Systematic approach to operational cost reduction

## 🤝 Project Development

This project is currently in implementation planning stage for internal company deployment. For project inquiries and technical support:

- **Project Manager**: [Name], [Title]
- **Technical Lead**: [Name], [Title]
- **Operations Contact**: [Name], [Title]
- **Email**: [internal-contact@company.com]

---

**FleetSense**: Building intelligent operational excellence, one truck trip at a time.