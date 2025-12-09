# Distance Calculation Test - Quick Start Guide

## 🎯 What This Test Does

Calculate the physical distance between parent and child nodes in a Wi-SUN network based on GPS coordinates.

## 🚀 Quick Start

### Step 1: Access the Test
1. Start the application: `python app.py`
2. Open browser: http://localhost:5000
3. Click **"Distance Calculation Test"** card

### Step 2: Choose Input Method

#### Option A: Upload File
- Click "Upload File" button
- Select your Wi-SUN tree .txt file
- Click "Calculate Distances"

#### Option B: Paste Text
- Click "Paste Text" button
- Copy and paste your Wi-SUN tree structure
- Click "Calculate Distances"

### Step 3: View Results
- See statistics (Total, Max, Min, Average distances)
- Browse the results table
- Check skipped connections (if any)

### Step 4: Download Report
- Click "Download Word Report"
- Save the .docx file
- Open in Microsoft Word or compatible software

## 📋 Input Example

Your Wi-SUN tree text should look like this:

```
fd12:3456::b635:22ff:fe98:2536 
  |- fd12:3456::62a4:23ff:fe37:a3a9 
  |    `- fd12:3456::b635:22ff:fe98:2529 
  |         |- fd12:3456::62a4:23ff:fe37:a3a8 
  |         |    `- fd12:3456::b635:22ff:fe98:253f 
  |         |- fd12:3456::62a4:23ff:fe37:a3ac 
  |         `- fd12:3456::92fd:9fff:feee:9d40 
  |              |- fd12:3456::62a4:23ff:fe37:a39f 
  |              |- fd12:3456::b635:22ff:fe98:2524 
  |              |    `- fd12:3456::62a4:23ff:fe37:a3ab 
  |              `- fd12:3456::b635:22ff:fe98:2534 
```

## 📊 What You Get

### On-Screen Display:
- **Total Connections**: Number of parent-child pairs
- **Max Distance**: Longest connection in meters
- **Min Distance**: Shortest connection in meters
- **Average Distance**: Mean distance across all connections
- **Results Table**: Complete list with Sr No, Parent, Child, Distance
- **Skipped List**: Nodes without GPS coordinates (if any)

### Word Document Contains:
1. Title and timestamp
2. Complete distance table with all connections
3. Statistics summary
4. Skipped connections (if any)
5. Professional formatting with page breaks

## 🔧 Adding New Node Coordinates

Edit `node_coordinates.py`:

```python
NODE_COORDS = {
    "fd12:3456::your:new:address": [latitude, longitude],
    # Example: [17.4453477, 78.3495126]
}
```

Coordinates format:
- **Latitude**: Decimal degrees (-90 to +90)
- **Longitude**: Decimal degrees (-180 to +180)

## ❓ Troubleshooting

### "Skipped Connections" shown?
→ Add GPS coordinates for those nodes in `node_coordinates.py`

### Invalid tree structure?
→ Ensure proper ASCII tree format with IPv6 addresses

### No file upload?
→ Check file is .txt format and contains tree structure

### Distance seems wrong?
→ Verify GPS coordinates are correct in `node_coordinates.py`

## 📸 Visual Flow

```
┌─────────────────────────────────────┐
│   Select Input Method               │
│   [Upload File] [Paste Text]        │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   Input Wi-SUN Tree                 │
│   (File or Text)                    │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   [Calculate Distances]             │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   Statistics Summary                │
│   Total: 28  Max: 450.2m            │
│   Min: 45.1m  Avg: 180.5m           │
└─────────────────────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   Results Table                     │
│   Sr  Parent      Child    Distance │
│   1   fd12:...    fd12:... 450.234 m│
│   2   fd12:...    fd12:... 380.156 m│
│   ...                                │
└─────────────────────────────────────┘
               ↓
┌─────────────────────────────────────┐
│   [Download Word Report]            │
└─────────────────────────────────────┘
```

## 🎓 Understanding the Results

**Distance Values**: 
- Measured in meters
- Calculated using Haversine formula
- Based on GPS coordinates (latitude/longitude)
- Accounts for Earth's curvature

**Connection**: 
- Parent → Child relationship in network tree
- Physical distance between their GPS locations

**Skipped**: 
- Nodes without GPS coordinates in database
- Cannot calculate distance without both coordinates

## ✅ Features

- ✅ File upload support (.txt)
- ✅ Text paste support
- ✅ Real-time calculation
- ✅ Interactive results table
- ✅ Statistics summary
- ✅ Word document export
- ✅ Error handling
- ✅ Responsive design
- ✅ Loading indicators
- ✅ Alert messages

## 📞 Need Help?

Check these files for more details:
- `DISTANCE_TEST_README.md` - Complete documentation
- `IMPLEMENTATION_SUMMARY.md` - Technical details
- `node_coordinates.py` - GPS coordinates database

---

**Developed by Himanshu Fanibhare**
