// 内容脚本 - 在页面加载时检查是否需要显示提醒
(async function() {
  // 避免重复执行
  if (window.dailyReminderLoaded) return;
  window.dailyReminderLoaded = true;

  // 检查是否需要显示提醒
  async function checkReminders() {
    try {
      const configs = await Utils.getConfigs();
      
      for (const config of configs) {
        const lastOpenDate = await Utils.getLastOpenDate(config.id);
        
        if (Utils.shouldTrigger(config, lastOpenDate)) {
          if (config.mode === 'auto') {
            // 自动打开页面
            await autoOpenPage(config);
          } else if (config.mode === 'toast') {
            // 显示提醒
            showToastReminder(config);
          }
        }
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }

  // 监听来自后台脚本的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'newDayStarted') {
      console.log('[Content] 收到新日期通知，检查提醒配置');
      checkReminders();
      sendResponse({ success: true });
      return true;
    }
  });

  // 自动打开页面
  async function autoOpenPage(config) {
    try {
      // 发送消息给后台脚本来打开新标签页
      chrome.runtime.sendMessage({
        action: 'openUrl',
        url: config.url
      });
      
      // 更新最后打开日期
      await Utils.setLastOpenDate(config.id);
    } catch (error) {
      console.error('Error auto-opening page:', error);
    }
  }

  // 显示Toast提醒
  function showToastReminder(config) {
    // 检查是否已经存在提醒
    if (document.querySelector('.daily-reminder-toast')) {
      return;
    }

    // 使用浏览器原生confirm对话框
    const message = `Daily Reminder\n\n${config.note || 'Time to check this site!'}\n\n网站: ${config.url}\n\n点击"确定"打开网站，点击"取消"忽略提醒。`;
    
    setTimeout(async () => {
      // 无论用户选择什么，都先标记为已触发（避免重复提醒）
      await Utils.setLastOpenDate(config.id);
      
      const userConfirmed = confirm(message);
      
      if (userConfirmed) {
        // 用户点击确定，打开网站
        window.open(config.url, '_blank');
      }
      // 用户点击取消也已经标记为已触发，今天不会再次提醒
    }, 500); // 延迟显示，避免干扰页面加载
  }

  // 页面加载后延迟检查，避免干扰页面正常加载
  setTimeout(checkReminders, 1000);

  // 监听页面可见性变化，当页面重新变为可见时检查日期
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // 页面变为可见，通知后台检查日期
      console.log('[Content] 页面变为可见，通知后台检查日期');
      Utils.notifyBackgroundCheckDay();
    }
  });

  // 监听窗口焦点变化
  window.addEventListener('focus', () => {
    console.log('[Content] 窗口获得焦点，通知后台检查日期');
    Utils.notifyBackgroundCheckDay();
  });
})(); 