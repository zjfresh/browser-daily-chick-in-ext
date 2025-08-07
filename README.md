# 📘 Daily Reminder Extension

A Chrome extension to help you **automatically or manually open specific websites** on a daily, weekday, or custom interval schedule. Perfect for daily check-ins, monitoring dashboards, and reminders.

## 🚀 Features

- 🎯 Configure multiple websites with individual schedules.
- 🔔 Display confirmation dialog reminders when browsing.
- ⚙️ Optionally open pages automatically on trigger.
- 🗓️ Supports daily, weekday-only, or interval (e.g. every 3 days) triggers.
- 📅 Custom first trigger date for interval-based rules.
- 🧠 Remembers last open date per site to avoid duplicate triggers.
- 🧍‍♂️ Triggered during browser activity and across day transitions.
- 🌅 **Cross-day detection**: Automatically triggers when staying on open pages overnight.

## 📁 Project Structure

```
daily-reminder-extension/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── options.html
├── options.js
├── styles.css
└── utils.js
```

## 🛠️ How It Works

- **background.js**: Runs in the background, monitors day changes every hour, and notifies active tabs.
- **content.js**: Executes when pages load, checks site configs, and listens for new day notifications.
- **options.html/js**: Lets user manage site configurations.
- **popup.html/js**: Optional popup for quick access or status.

## 🧩 Example Configuration (Stored in `chrome.storage.local`)

```json
[
  {
    "id": "1",
    "url": "https://example.com/check-in",
    "mode": "toast",
    "rule": { "type": "interval", "days": 3 },
    "note": "Every 3 days check-in"
  },
  {
    "id": "2",
    "url": "https://dashboard.com",
    "mode": "auto",
    "rule": { "type": "weekday" },
    "note": "Open every weekday"
  },
  {
    "id": "3",
    "url": "https://stackoverflow.com",
    "mode": "toast",
    "rule": { 
      "type": "interval", 
      "days": 7,
      "firstTriggerDate": "2025-08-08"
    },
    "note": "Weekly learning"
  }
]
```

## 🧪 Development

1. Open `chrome://extensions` in your browser.
2. Enable **Developer Mode**.
3. Click **Load unpacked** and select the project folder.

## ⚙️ Permissions

- `storage`: To store your website configs.
- `alarms`: For hourly day change checks.
- `scripting`: For manual trigger functionality.
- `<all_urls>`: To allow reminders on any active tab.

## 📌 Notes

- 提醒使用浏览器原生确认对话框，简洁高效。
- 用户可以选择打开网站或忽略提醒。
- 无论选择什么，都会标记为已触发，避免重复提醒。
- 新的一天通过后台任务检测（每60分钟）。
- 自定义间隔支持设置首次触发日期。
- **跨天检测**: 页面焦点变化和可见性变化会触发日期检查。

## 🧳 License

MIT License.
