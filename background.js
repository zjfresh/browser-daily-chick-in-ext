// 后台脚本 - 处理定时任务和日期重置
const DATE_KEY = 'daily_reminder_current_date';
const CHECK_NEEDED_KEY = 'daily_reminder_check_needed';

// 导入Utils功能
importScripts('utils.js');

// 全局检查标识
let needsCheck = true;

function getTodayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

// 设置需要检查标识
async function setCheckNeeded(needed = true) {
  needsCheck = needed;
  try {
    await chrome.storage.local.set({ [CHECK_NEEDED_KEY]: needed });
    console.log('[Background] 设置检查标识:', needed);
  } catch (error) {
    console.error('[Background] 设置检查标识失败:', error);
  }
}

// 获取检查标识
async function getCheckNeeded() {
  try {
    const result = await chrome.storage.local.get([CHECK_NEEDED_KEY]);
    const needed = result[CHECK_NEEDED_KEY] !== false; // 默认为true
    needsCheck = needed;
    return needed;
  } catch (error) {
    console.error('[Background] 获取检查标识失败:', error);
    return true; // 出错时默认需要检查
  }
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
    
    // 设置需要检查标识
    await setCheckNeeded(true);
    
    // 不再主动通知所有页面，等待页面激活时触发
    console.log('[Background] 已设置检查标识，等待页面激活时触发检查');
  }
  } catch (error) {
    console.error('[Background] 检查日期时出错:', error);
  }
}

// 注意：不再主动通知所有标签页，采用按需激活模式

// 扩展安装时初始化
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Daily Reminder Extension installed');
  
  // 设置每小时检查一次的闹钟
  chrome.alarms.create('dailyCheck', {
    delayInMinutes: 1,
    periodInMinutes: 60
  });
  
  // 设置需要检查标识
  await setCheckNeeded(true);
  
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
  // 处理异步操作
  (async () => {
    try {
      if (request.action === 'openUrl') {
        // 在新标签页中打开URL
        chrome.tabs.create({ url: request.url });
        sendResponse({ success: true });
        return;
      }
      
      if (request.action === 'checkCurrentDay') {
        // content script 请求检查当前日期
        await checkAndUpdateDay();
        sendResponse({ success: true });
        return;
      }
      
      if (request.action === 'checkIfNeeded') {
        // content script 查询是否需要检查配置
        const needed = await getCheckNeeded();
        console.log('[Background] Content查询检查标识:', needed, '来自:', sender.tab?.url);
        
        sendResponse({ needsCheck: needed });
        return;
      }
      
      if (request.action === 'configsUpdated') {
        // 配置更新通知（导入新配置时）
        console.log('[Background] 收到配置更新通知，设置检查标识为true');
        await setCheckNeeded(true);
        sendResponse({ success: true });
        return;
      }
      
      if (request.action === 'checkCompleted') {
        // content script 完成检查后通知
        console.log('[Background] Content完成检查，重置检查标识');
        await setCheckNeeded(false);
        sendResponse({ success: true });
        return;
      }
    } catch (error) {
      console.error('[Background] 处理消息时出错:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // 保持消息通道开放，等待异步响应
});

// 注意：所有配置检查和触发逻辑现在都由content.js统一处理

// 扩展启动时的初始化
chrome.runtime.onStartup.addListener(async () => {
  console.log('Daily Reminder Extension started');
  
  // 初始化检查标识
  await getCheckNeeded();
  
  // 检查日期变化
  await checkAndUpdateDay();
}); 