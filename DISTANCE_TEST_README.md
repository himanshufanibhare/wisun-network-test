# Distance Calculation Test - Documentation

## Overview
The Distance Calculation Test is a new feature that calculates the physical distances between parent and child nodes in a Wi-SUN network tree based on GPS coordinates using the Haversine formula.

## Features

### Input Methods
1. **File Upload**: Upload a text file containing the Wi-SUN tree structure
2. **Text Paste**: Paste the Wi-SUN tree text directly into a textarea

### Output
- **Interactive Table**: Displays all calculated distances in a sortable table
- **Statistics Summary**: Shows total connections, max/min/average distances
- **Word Document Export**: Download a professionally formatted Word document with:
  - Complete distance table
  - Statistics summary
  - Skipped connections (if any)

## File Structure

### Backend Files
- `node_coordinates.py` - Contains GPS coordinates for all nodes
- `tests/distanceTest.py` - Main distance calculation logic with Haversine formula
- Routes in `app.py`:
  - `/distance_test` - Main test page
  - `/api/distance/calculate` - Calculate distances endpoint
  - `/api/distance/download-word` - Download Word document endpoint

### Frontend Files
- `templates/distance_test.html` - Main test interface
- `static/css/distance_test.css` - Styling
- `static/js/distance_test.js` - Frontend logic

## Usage

1. Navigate to the Distance Calculation Test from the home page
2. Choose input method:
   - **Upload File**: Click "Upload File" and select a .txt file with the Wi-SUN tree
   - **Paste Text**: Click "Paste Text" and paste the tree structure
3. Click "Calculate Distances" button
4. View results in the table and statistics
5. Click "Download Word Report" to export results

## Input Format

The Wi-SUN tree should be in ASCII tree format:

```
fd12:3456::b635:22ff:fe98:2536 
  |- fd12:3456::62a4:23ff:fe37:a3a9 
  |    `- fd12:3456::b635:22ff:fe98:2529 
  |         |- fd12:3456::62a4:23ff:fe37:a3a8 
  |         |    `- fd12:3456::b635:22ff:fe98:253f 
```

## Technical Details

### Haversine Formula
The distance calculation uses the Haversine formula to calculate the great-circle distance between two points on Earth given their latitude and longitude coordinates.

Formula:
```
a = sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2)
c = 2 * atan2(√a, √(1−a))
d = R * c
```

Where:
- φ is latitude, λ is longitude, R is Earth's radius (6,371 km or 6,371,000 m)
- Angles are in radians
- Result is distance in meters

### Node Coordinates
GPS coordinates are stored in `node_coordinates.py` as a dictionary:
```python
NODE_COORDS = {
    "fd12:3456::b635:22ff:fe98:2536": [17.4453477, 78.3495126],
    # ... more coordinates
}
```

## Word Document Structure

The generated Word document includes:

1. **Title Page**
   - Report title
   - Generation timestamp
   - Total connections analyzed

2. **Distance Table**
   - Serial Number
   - Parent Node
   - Child Node
   - Distance (meters)
   - Automatic page breaks every 20 rows

3. **Statistics Summary**
   - Total Connections
   - Maximum Distance
   - Minimum Distance
   - Average Distance
   - Skipped Edges

4. **Skipped Connections** (if applicable)
   - Lists nodes without GPS coordinates

## Adding New Node Coordinates

To add coordinates for new nodes, edit `node_coordinates.py`:

```python
NODE_COORDS = {
    "your:new:ipv6:address": [latitude, longitude],
    # ... existing coordinates
}
```

Coordinates should be in decimal degrees format (e.g., 17.4453477, 78.3495126).

## Error Handling

The system handles:
- Missing GPS coordinates for nodes
- Invalid tree structure
- File reading errors
- Network errors during API calls

Nodes without coordinates are displayed in the "Skipped Connections" section.

## Dependencies

Required Python packages (already in requirements.txt):
- `python-docx==0.8.11` - For Word document generation
- `Flask==2.3.3` - Web framework
- Standard library: `re`, `math`, `datetime`

## Browser Compatibility

Tested and working on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

Requires JavaScript enabled for full functionality.
