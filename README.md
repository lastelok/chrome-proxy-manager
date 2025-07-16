# Chrome Proxy Manager

Professional proxy management extension for Chrome with geolocation display.

## Features

- 🌐 HTTP/HTTPS and SOCKS4/5 proxy support
- 🔐 Automatic authentication handling
- 📍 Geolocation display for proxy IPs
- 💾 Import/Export proxy profiles
- 🎨 Modern UI with dark mode support
- ⚡ Quick toggle functionality
- 📱 Side panel support

## Recent Fixes (v1.2.1)

### 1. Fixed proxy status display on connection errors
- The extension now maintains the active proxy status (green indicator) even when connection errors occur
- Users receive error notifications without disrupting the visual state
- This prevents confusion when temporary connection issues happen

### 2. Fixed authentication for multiple imported proxies
- Previously, only the first imported proxy would have its credentials saved correctly
- Now all imported proxies retain their authentication credentials properly
- Each proxy profile maintains its own username/password combination

### 3. Fixed proxy error logging
- Error details are now properly logged to console instead of showing `[object Object]`
- Added structured error information for better debugging
- Connection errors are displayed as toast notifications

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension directory

## Usage

### Adding Proxies

1. Click the "Add Profile" button
2. Enter proxy details:
   - Name: Custom name for the profile
   - Type: HTTP/HTTPS, SOCKS4, or SOCKS5
   - IP address and port
   - Optional authentication credentials

### Importing Proxies

Supported formats:
- `user:pass@ip:port` - With authentication
- `ip:port:user:pass` - Alternative format
- `ip:port` - Without authentication
- `Name;any_format` - With custom name
- `SOCKS5 ip:port` - With protocol specification

### Quick Toggle

- Click the toggle button to switch between the last active proxy and direct connection
- The extension remembers your last used proxy for quick access

### Debugging

A debug button is available in the header (gear icon) to check:
- Current proxy status
- Active profile details
- Authentication credentials status

## Permissions

- `proxy` - To manage proxy settings
- `storage` - To save proxy profiles
- `webRequest` - To handle proxy authentication
- `sidePanel` - For side panel functionality

## Privacy

- Geolocation data is cached locally to reduce API requests
- No personal data is transmitted to external servers
- Authentication credentials are stored locally in Chrome's secure storage

## Development

### Project Structure

```
chrome-proxy-manager/
├── manifest.json       # Extension manifest
├── background.js       # Service worker for proxy management
├── popup.js           # Popup UI logic
├── popup.html         # Popup UI structure
├── popup.css          # Styles
└── icons/             # Extension icons
```

### Building from Source

No build process required - the extension runs directly from source files.

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details
