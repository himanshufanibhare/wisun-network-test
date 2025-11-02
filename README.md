# Wi-SUN Network Test Application

A comprehensive Flask-based web application for testing and monitoring Wi-SUN (Wireless Smart Ubiquitous Network) devices. This application provides a user-friendly interface to run various network tests, analyze connectivity, and generate detailed reports.

## 🌟 Features

### Network Tests
- **Ping Test**: Measure latency, packet loss, and connection stability
- **RSSI Test**: Monitor Received Signal Strength Indicator values
- **RPL Test**: Analyze IPv6 Routing Protocol for Low-Power and Lossy Networks
- **Availability Test**: Check device availability and uptime
- **Disconnections Test**: Monitor network disconnection patterns

### Reporting & Analytics
- **Multiple Report Formats**: TXT, PDF, Word
- **Real-time Updates**: Live test results with auto-refresh
- **Retry Functionality**: Re-run failed tests with a single click
- **Summary Statistics**: Comprehensive test summaries and connection status
- **Hop Count Analysis**: Network topology and routing information

### User Interface
- **Responsive Design**: Bootstrap-based UI works on all devices
- **Real-time Progress**: Live progress bars and status updates
- **Interactive Tables**: Sortable results with retry buttons
- **Export Options**: Download reports in preferred format

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Wi-SUN network devices (for actual testing)
- Linux/Unix environment (recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/himanshufanibhare/wisun-network-test.git
   cd wisun-network-test
   ```

2. **Create virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**
   ```bash
   python app.py
   ```

5. **Access the application**
   Open your browser and navigate to `http://localhost:5000`

## 📁 Project Structure

```
wisun-network-test/
├── app.py                      # Main Flask application
├── requirements.txt            # Python dependencies
├── hop_counts.json            # Network topology configuration
├── 
├── static/                    # Static assets
│   ├── css/                   # Stylesheets
│   │   ├── style.css         # Main styles
│   │   ├── ping_test.css     # Ping test specific styles
│   │   ├── rssi_test.css     # RSSI test specific styles
│   │   ├── rpl_test.css      # RPL test specific styles
│   │   ├── availability_test.css  # Availability test styles
│   │   └── disconnections_test.css # Disconnections test styles
│   └── js/                    # JavaScript files
│       ├── ping_test.js      # Ping test functionality
│       ├── rssi_test.js      # RSSI test functionality
│       ├── rpl_test.js       # RPL test functionality
│       ├── availability_test.js   # Availability test functionality
│       └── disconnections_test.js # Disconnections test functionality
│
├── templates/                 # HTML templates
│   ├── base.html             # Base template
│   ├── index.html            # Home page
│   ├── ping_test.html        # Ping test page
│   ├── rssi_test.html        # RSSI test page
│   ├── rpl_test.html         # RPL test page
│   ├── availability_test.html # Availability test page
│   └── disconnections_test.html # Disconnections test page
│
├── tests/                     # Test modules
│   ├── __init__.py           # Package initialization
│   ├── pingTest.py           # Ping test implementation
│   ├── rssiTest.py           # RSSI test implementation
│   ├── rplTest.py            # RPL test implementation
│   ├── availabilityTest.py   # Availability test implementation
│   ├── disconnectionsTest.py # Disconnections test implementation
│   ├── hopCountTest.py       # Hop count analysis
│   ├── hopCountUtils.py      # Hop count utilities
│   ├── ip.py                 # IP utility functions
│   └── logger.py             # Logging utilities
│
├── utils/                     # Utility modules
│   ├── report_generator.py   # Report generation utilities
│   └── test_result_writer.py # Test result writing utilities
│
├── logs/                      # Application logs
├── reports/                   # Generated reports
│   ├── txt/                  # Text reports
│   ├── pdf/                  # PDF reports
│   └── word/                 # Word documents
└── venv/                      # Virtual environment
```

## 🧪 Test Types

### 1. Ping Test
**Purpose**: Measure network latency and packet loss
- **Parameters**: Packet count, timeout interval
- **Metrics**: Min/Max/Average RTT, packet loss percentage, connection status
- **Use Case**: Basic connectivity and performance testing

### 2. RSSI Test
**Purpose**: Monitor signal strength and quality
- **Parameters**: Sample count, measurement interval
- **Metrics**: Signal strength (dBm), signal quality, connection stability
- **Use Case**: RF optimization and coverage analysis

### 3. RPL Test
**Purpose**: Analyze IPv6 routing protocol performance
- **Parameters**: Route discovery timeout, metric collection
- **Metrics**: Routing table size, preferred parents, route metrics
- **Use Case**: Mesh network optimization and troubleshooting

### 4. Availability Test
**Purpose**: Monitor device uptime and availability
- **Parameters**: Check interval, monitoring duration
- **Metrics**: Uptime percentage, availability windows, downtime events
- **Use Case**: Service level monitoring and reliability analysis

### 5. Disconnections Test
**Purpose**: Track network disconnection patterns
- **Parameters**: Monitoring period, disconnection threshold
- **Metrics**: Disconnection frequency, duration, patterns
- **Use Case**: Network stability analysis and fault detection

## 📊 Report Generation

### Supported Formats
- **TXT**: Plain text reports for simple analysis
- **PDF**: Professional formatted reports with charts
- **Word (DOCX)**: Editable documents for documentation

### Report Features
- **Executive Summary**: High-level test results and recommendations
- **Detailed Metrics**: Complete test data and statistics
- **Visual Elements**: Charts, graphs, and status indicators
- **Timestamp Information**: Test execution details and duration
- **Device Information**: Network topology and device details

## 🔧 Configuration

### Environment Variables
```bash
FLASK_ENV=development          # Development/production mode
FLASK_DEBUG=1                 # Enable debug mode
PORT=5000                     # Application port
HOST=0.0.0.0                  # Host interface
```

### Network Configuration
Edit `hop_counts.json` to configure your Wi-SUN network topology:
```json
{
  "devices": {
    "192.168.1.100": {
      "label": "Border Router",
      "hop_count": 0,
      "type": "coordinator"
    },
    "192.168.1.101": {
      "label": "End Device 1",
      "hop_count": 1,
      "type": "router"
    }
  }
}
```

### Test Parameters
Each test type supports customizable parameters:
- **Timeout values**: Adjust for network conditions
- **Packet counts**: Balance between accuracy and speed
- **Retry attempts**: Configure automatic retry behavior
- **Reporting options**: Select output formats and detail levels

## 🛠️ API Endpoints

### Test Execution
- `POST /run_ping_test` - Execute ping test
- `POST /run_rssi_test` - Execute RSSI test
- `POST /run_rpl_test` - Execute RPL test
- `POST /run_availability_test` - Execute availability test
- `POST /run_disconnections_test` - Execute disconnections test

### Report Generation
- `POST /generate_report` - Generate test report
- `GET /download_report/<format>` - Download report in specified format

### Utility Endpoints
- `GET /get_hop_counts` - Retrieve network topology
- `POST /refresh_hop_counts` - Update topology information
- `GET /test_status/<test_id>` - Check test execution status

## 🔍 Troubleshooting

### Common Issues

**1. Connection Timeouts**
- Check network connectivity
- Verify device IP addresses
- Adjust timeout parameters

**2. Permission Errors**
- Ensure proper file permissions for logs and reports
- Check network interface access permissions

**3. Report Generation Failures**
- Verify required packages are installed
- Check disk space for report output
- Ensure proper write permissions

**4. Test Execution Issues**
- Validate network device accessibility
- Check Wi-SUN network configuration
- Review application logs in `logs/` directory

### Debug Mode
Enable debug mode for detailed error information:
```bash
export FLASK_DEBUG=1
python app.py
```

### Logging
Application logs are stored in the `logs/` directory:
- Test execution logs: `{test_type}_{timestamp}.log`
- Application logs: Check console output in debug mode

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Code Style
- Follow PEP 8 for Python code
- Use meaningful variable and function names
- Add docstrings for public functions
- Include error handling and logging

### Testing
Run tests before submitting changes:
```bash
python -m pytest tests/
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👨‍💻 Developer

**Himanshu Fanibhare**
- Portfolio: [View Portfolio](https://himanshufanibhare.github.io)
- GitHub: [@himanshufanibhare](https://github.com/himanshufanibhare)

## 🆘 Support

For support and questions:
1. Check the troubleshooting section above
2. Review existing GitHub issues
3. Create a new issue with detailed information
4. Include application logs and error messages

## 📈 Future Enhancements

### Planned Features
- **Real-time Monitoring**: Continuous network monitoring dashboard
- **Alert System**: Email/SMS notifications for network issues
- **Historical Analysis**: Long-term trend analysis and reporting
- **API Integration**: REST API for external system integration
- **Multi-Network Support**: Support for multiple Wi-SUN networks
- **Performance Optimization**: Enhanced test execution speed
- **Mobile App**: Companion mobile application for field testing

### Technology Roadmap
- **Database Integration**: Persistent data storage
- **Microservices Architecture**: Scalable service-oriented design
- **Container Support**: Docker containerization
- **Cloud Deployment**: AWS/Azure deployment options
- **Machine Learning**: Predictive network analysis

## 🔧 Technical Details

### Dependencies
- **Flask 2.3.3**: Web framework
- **Flask-SocketIO 5.3.6**: Real-time communication
- **ReportLab 4.0.4**: PDF generation
- **python-docx 0.8.11**: Word document generation
- **Bootstrap 5.x**: Frontend framework
- **Font Awesome**: Icon library

### System Requirements
- **Python**: 3.8 or higher
- **Memory**: 512MB RAM minimum (1GB recommended)
- **Storage**: 100MB available space
- **Network**: Access to Wi-SUN devices under test
- **Browser**: Modern web browser with JavaScript enabled

### Performance Considerations
- Test execution time varies by network size and parameters
- Large networks may require increased timeout values
- Report generation time scales with data volume
- Concurrent test execution is not recommended

---

## 🎯 Quick Reference

### Start Application
```bash
source venv/bin/activate
python app.py
```

### Run Tests
```bash
# Access web interface
http://localhost:5000

# Select test type
# Configure parameters
# Execute test
# Download reports
```

### Generate Reports
```bash
# Reports automatically generated after test completion
# Available formats: TXT, PDF, DOCX, JSON, CSV, XML
# Download from web interface or check reports/ directory
```

This Wi-SUN Network Test Application provides a comprehensive solution for testing and monitoring wireless mesh networks, offering professional-grade reporting and analysis capabilities in an easy-to-use web interface.