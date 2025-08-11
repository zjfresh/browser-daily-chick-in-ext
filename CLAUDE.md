# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome/browser extension that provides daily website reminders with configurable schedules. The extension helps users automatically or manually open specific websites on daily, weekday, or custom interval schedules.

## Architecture

### Core Files Structure
- `manifest.json` - Manifest V3 extension configuration with service worker architecture
- `background.js` - Service worker that handles alarms, day change detection, and cross-tab communication
- `content.js` - Content script injected into all pages, handles reminder display and user interactions
- `utils.js` - Shared utility functions for date calculations and trigger logic
- `popup.js/popup.html` - Extension popup for quick status and manual actions
- `options.js/options.html` - Options page for configuration management

### Key Components

**Background Service Worker (`background.js`)**:
- Runs periodic checks (hourly) via chrome.alarms API to detect new days
- Maintains global check state using `daily_reminder_check_needed` flag
- Communicates with content scripts to trigger configuration checks
- Uses `importScripts('utils.js')` to share utility functions

**Content Script (`content.js`)**:
- Injected into all pages via manifest content_scripts
- Queries background for check state before performing expensive operations
- Displays native browser confirm dialogs for user interaction
- Handles cross-day detection via page focus/visibility events
- Uses message passing to coordinate with background script

**Configuration System**:
- Stored in `chrome.storage.local` as JSON array
- Each config has: `id`, `url`, `mode` (toast/auto), `rule` (daily/weekday/interval), `note`
- Last trigger dates tracked per configuration to prevent duplicate notifications
- Supports interval-based triggers with optional `firstTriggerDate`

## Development Commands

Since this is a browser extension without traditional build tools, development involves:

### Loading Extension
```bash
# No build step required - direct loading
# 1. Open chrome://extensions/
# 2. Enable Developer Mode
# 3. Click "Load unpacked" and select project folder
```

### Testing
The project includes multiple test HTML files for different scenarios:
- `test-extension.html` - Basic extension functionality test  
- `test-message-fix.html` - Message passing tests
- `test-session-fix.html` - Session management tests
- `test-target-notification.html` - Notification targeting tests
- `test-unified-modes.html` - Mode switching tests

### Configuration Testing
- `demo-config.json` - Example configuration for testing
- `test-user-config.json` - User configuration test file
- Options page provides import/export functionality for configurations

## Key Implementation Details

### Trigger Logic (`utils.js`)
The `Utils.shouldTrigger()` function implements the core scheduling logic:
- Daily: triggers every day
- Weekday: triggers Monday-Friday only  
- Interval: triggers every N days from a base date
- Respects last trigger date to prevent same-day duplicates

### Cross-Day Detection
- Background script sets hourly alarm to detect date changes
- Page visibility/focus events in content script trigger additional checks
- Uses message passing between background and content scripts for coordination

### Storage Schema
Configurations stored as:
```javascript
[{
  id: "unique_id",
  url: "https://example.com", 
  mode: "toast|auto",
  rule: { 
    type: "daily|weekday|interval",
    days?: number,
    firstTriggerDate?: "YYYY-MM-DD"
  },
  note: "description"
}]
```

### Permission Requirements
- `storage` - Configuration persistence
- `alarms` - Day change detection  
- `scripting` - Manual trigger functionality
- `<all_urls>` - Content script injection on any site

## Development Notes

- No package.json or build system - pure vanilla JavaScript
- Uses Manifest V3 with service worker (not background pages)
- Content scripts loaded on `<all_urls>` with CSS injection
- Extensive console logging for debugging (check background service worker logs)
- All user-facing text in Chinese with English technical comments
- Uses chrome.storage.local for all persistence (no external APIs)