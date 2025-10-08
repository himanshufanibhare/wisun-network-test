# Network Test Web Application

A Flask-based web interface for running network tests on your devices.

## Features

- **Multiple Test Types**: Ping, RSSI, RPL Rank, Disconnections, and Availability tests
- **Real-time Progress Tracking**: Live progress bars and device status updates
- **Configurable Parameters**: Customize timeout, packet count, and other test parameters
- **Start/Stop Control**: Start and stop tests as needed
- **Live Log Viewing**: Real-time log updates during test execution
- **Log Download**: Download test logs for analysis
- **Responsive Design**: Works on desktop and mobile devices

## Prerequisites

- Python 3.7+
- `coap-client-notls` command-line tool (for CoAP tests)
- Network access to test devices

## Installation

1. Navigate to the project directory:
```bash
cd /home/wisun/wisun-codes/network-test-webapp
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Running the Application

1. Start the Flask application:
```bash
python app.py
```

2. Open your web browser and navigate to:
```
http://localhost:5000
```

## Usage

### Home Page
- Select the test you want to run from the available options
- Each test has a description explaining its purpose

### Test Configuration
- Configure test parameters (timeout, packet count, etc.)
- Click "Start Test" to begin
- Monitor real-time progress with the progress bar
- View live logs as the test runs
- Use "Stop Test" to halt execution if needed
- Download logs when the test completes

### Available Tests

1. **Ping Test**: Tests basic connectivity using ICMP ping
   - Configurable: Packet count, timeout
   
2. **RSSI Test**: Measures signal strength (RSL In/Out) via CoAP
   - Configurable: Timeout
   
3. **RPL Rank Test**: Checks routing protocol rank via CoAP
   - Configurable: Timeout
   
4. **Disconnections Test**: Checks disconnection statistics via CoAP
   - Configurable: Timeout
   
5. **Availability Test**: Tests device availability via CoAP
   - Configurable: Timeout

## Project Structure

```
network-test-webapp/
├── app.py              # Main Flask application
├── requirements.txt    # Python dependencies
├── tests/             # Test modules
│   ├── __init__.py
│   ├── ip.py          # Device IP mappings
│   ├── logger.py      # Logging utilities
│   ├── pingTest.py    # Ping test implementation
│   ├── rssiTest.py    # RSSI test implementation
│   ├── rplTest.py     # RPL rank test implementation
│   ├── disconnectionsTest.py  # Disconnections test
│   └── availabilityTest.py    # Availability test
├── templates/         # HTML templates
│   ├── base.html      # Base template
│   ├── index.html     # Home page
│   └── test.html      # Test execution page
├── static/           # Static files
│   ├── css/
│   │   └── style.css  # Custom styles
│   └── js/
│       └── test.js    # JavaScript for test pages
└── logs/             # Test log files (created automatically)
```

## API Endpoints

- `GET /` - Home page
- `GET /test/<test_type>` - Test configuration page
- `POST /api/start_test` - Start a test
- `POST /api/stop_test` - Stop a running test
- `GET /api/test_status/<test_type>` - Get test status
- `GET /api/logs/<test_type>` - Get test logs
- `GET /download_logs/<test_type>` - Download log file

## WebSocket Events

- `test_progress` - Real-time progress updates
- `test_completed` - Test completion notification
- `test_stopped` - Test stop notification
- `test_error` - Error notifications

## Customization

### Adding New Devices
Edit `tests/ip.py` to add new device IP mappings:

```python
FAN11_FSK_IPV6 = {
    "Device-Name": "IPv6-Address",
    # Add more devices here
}
```

### Adding New Tests
1. Create a new test module in the `tests/` directory
2. Implement the test function with progress and stop callbacks
3. Add the test configuration to `TEST_CONFIGS` in `app.py`
4. Update the route handler in `run_test()` function

## Troubleshooting

1. **Test not starting**: Check that all required dependencies are installed
2. **CoAP tests failing**: Ensure `coap-client-notls` is installed and accessible
3. **Connection issues**: Verify network connectivity to test devices
4. **Log files not found**: Check that the `logs/` directory is writable

## License

This project is for internal use and testing purposes.