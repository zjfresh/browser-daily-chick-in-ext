// 后台脚本 - 处理定时任务和日期重置
const DATE_KEY = 'daily_reminder_current_date';

function getTodayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

// 检查并更新日期，通知所有标签页新的一天开始
async function checkAndUpdateDay() {
  const today = getTodayDateStr();
  
  try {
    const result = await chrome.storage.local.get([DATE_KEY]);
    const lastDate = result[DATE_KEY];
    
    if (lastDate !== today) {
      // 新的一天开始
      await chrome.storage.local.set({ [DATE_KEY]: today });
      console.log('[Background] 新的一天开始:', today, '上一次:', lastDate);
      
      // 通知所有活动标签页检查配置
      notifyAllTabsNewDay();
    }
  } catch (error) {
    console.error('[Background] 检查日期时出错:', error);
  }
}

// 通知所有标签页新的一天开始
async function notifyAllTabsNewDay() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      // 排除chrome://等特殊页面
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('moz-extension://')) {
        chrome.tabs.sendMessage(tab.id, { action: 'newDayStarted' }).catch(() => {
          // 忽略无法发送消息的标签页（可能没有加载content script）
        });
      }
    }
  } catch (error) {
    console.error('[Background] 通知标签页时出错:', error);
  }
}

// 扩展安装时初始化
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Daily Reminder Extension installed');
  
  // 设置每小时检查一次的闹钟
  chrome.alarms.create('dailyCheck', {
    delayInMinutes: 1,
    periodInMinutes: 60
  });
  
  // 立即检查一次
  await checkAndUpdateDay();
});

// 监听闹钟事件
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyCheck') {
    console.log('[Background] Daily check alarm triggered');
    checkAndUpdateDay();
  }
});

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openUrl') {
    // 在新标签页中打开URL
    chrome.tabs.create({ url: request.url });
    sendResponse({ success: true });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'checkCurrentDay') {
    // content script 请求检查当前日期
    checkAndUpdateDay();
    sendResponse({ success: true });
    return true;
  }
});

// 扩展启动时的初始化
chrome.runtime.onStartup.addListener(async () => {
  console.log('Daily Reminder Extension started');
  await checkAndUpdateDay();
}); 