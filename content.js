// 内容脚本 - 在页面加载时检查是否需要显示提醒
(async function() {
  // 避免重复执行
  if (window.dailyReminderLoaded) return;
  window.dailyReminderLoaded = true;

  // 检查扩展上下文是否有效
  if (!chrome || !chrome.storage || !chrome.runtime) {
    console.warn('[Content] 扩展上下文无效，content script将不会启动');
    return;
  }

  // 添加会话级别的触发防护，防止同一页面会话中重复触发
  if (!window.dailyReminderSessionTriggered) {
    window.dailyReminderSessionTriggered = new Set();
  }

  // 添加全局触发限制，防止短时间内重复触发
  const GLOBAL_TRIGGER_KEY = 'daily_reminder_last_global_check';
  const MIN_TRIGGER_INTERVAL = 30 * 1000; // 30秒最小间隔（防止死循环但允许正常使用）

  // 🔥 新架构：检查标识驱动的配置检查
  async function checkConfigsIfNeeded() {
    try {
      // 检查扩展上下文是否有效
      if (!chrome || !chrome.storage || !chrome.runtime) {
        console.warn('[Content] 扩展上下文失效，停止检查');
        return;
      }

      console.log('[Content] 查询是否需要检查配置...');
      
      // 查询后台的检查标识
      const response = await chrome.runtime.sendMessage({
        action: 'checkIfNeeded'
      });
      
      if (!response || !response.needsCheck) {
        console.log('[Content] 后台标识显示无需检查，跳过');
        return;
      }
      
      console.log('[Content] 后台标识显示需要检查，开始检查配置...');
      
      // 执行配置检查和触发
      await performConfigCheck();
      
      // 通知后台检查已完成
      chrome.runtime.sendMessage({
        action: 'checkCompleted'
      }).catch((error) => {
        console.warn('[Content] 通知检查完成失败:', error);
      });
    } catch (error) {
      if (error.message.includes('Extension context invalidated') || 
          error.message.includes('Chrome storage API not available')) {
        console.warn('[Content] 扩展上下文失效，content script将停止工作');
        // 标记脚本为失效，避免进一步的API调用
        window.dailyReminderInvalidated = true;
      } else {
        console.error('[Content] 检查提醒时出错:', error);
      }
    }
  }

  // 执行配置检查和触发（只处理toast模式，auto模式由background处理）
  async function performConfigCheck() {
    try {
      console.log('[Content] 开始检查Toast模式配置...');
      const configs = await Utils.getConfigs();
      const toastConfigs = configs.filter(c => c.mode === 'toast');
      console.log('[Content] 找到Toast配置数量:', toastConfigs.length);
      
      let triggeredCount = 0;
      const currentUrl = window.location.href;
      
      for (const config of toastConfigs) {
        const lastOpenDate = await Utils.getLastOpenDate(config.id);
        const shouldTrigger = Utils.shouldTrigger(config, lastOpenDate);
        
        console.log(`[Content] Toast配置检查: ${config.url}, 最后打开: ${lastOpenDate}, 应该触发: ${shouldTrigger}`);
        
        if (!shouldTrigger) {
          continue;
        }
        
        // 检查会话级别防护，避免同一会话中重复触发
        if (window.dailyReminderSessionTriggered.has(config.id)) {
          console.log(`[Content] 配置 ${config.url} 在本次会话中已触发，跳过`);
          continue;
        }
        
        // 检查当前页面是否就是目标页面，避免死循环
        if (urlsMatch(currentUrl, config.url)) {
          console.log(`[Content] 当前页面 ${currentUrl} 与目标页面 ${config.url} 匹配，直接标记为已触发`);
          window.dailyReminderSessionTriggered.add(config.id);
          await Utils.setLastOpenDate(config.id);
          console.log(`[Content] 已在目标页面标记 ${config.id} 为已触发`);
          continue;
        }
        
        // 触发Toast提醒
        triggeredCount++;
        window.dailyReminderSessionTriggered.add(config.id);
        
        console.log('[Content] 触发Toast提醒:', config.url);
        await Utils.setLastOpenDate(config.id);
        showToastReminder(config);
      }
      
      console.log(`[Content] Toast配置检查完成，触发了 ${triggeredCount} 个配置`);
    } catch (error) {
      console.error('[Content] 执行配置检查时出错:', error);
    }
  }
  
  // URL匹配检查函数
  function urlsMatch(url1, url2) {
    try {
      const parsed1 = new URL(url1);
      const parsed2 = new URL(url2);
      
      return parsed1.hostname === parsed2.hostname && 
             parsed1.pathname.replace(/\/$/, '') === parsed2.pathname.replace(/\/$/, '');
    } catch (error) {
      const clean1 = url1.replace(/^https?:\/\//, '').replace(/\/$/, '').split('?')[0].split('#')[0];
      const clean2 = url2.replace(/^https?:\/\//, '').replace(/\/$/, '').split('?')[0].split('#')[0];
      return clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1);
    }
  }

  // 注意：不再监听newDayStarted消息，采用按需激活模式

  // 注意：自动打开功能现在由background.js直接处理

  // 显示Toast提醒（简化版，触发记录由background.js处理）
  function showToastReminder(config) {
    // 检查是否已经存在提醒
    if (window.dailyReminderToastShowing) {
      console.log('[Content] Toast正在显示中，跳过重复显示');
      return;
    }

    // 检查会话级别防护
    if (window.dailyReminderSessionTriggered && window.dailyReminderSessionTriggered.has(config.id + '_toast_shown')) {
      console.log('[Content] Toast在本次会话中已显示过，跳过');
      return;
    }

    // 标记正在显示提醒和会话级别防护
    window.dailyReminderToastShowing = true;
    if (window.dailyReminderSessionTriggered) {
      window.dailyReminderSessionTriggered.add(config.id + '_toast_shown');
    }

    // 使用浏览器原生confirm对话框
    const message = `Daily Reminder\n\n${config.note || 'Time to check this site!'}\n\n网站: ${config.url}\n\n点击"确定"打开网站，点击"取消"忽略提醒。`;
    
    console.log('[Content] 显示Toast提醒:', config.url);
    
    setTimeout(() => {
      try {
        // 检查扩展上下文是否仍然有效
        if (window.dailyReminderInvalidated) {
          console.warn('[Content] 扩展上下文失效，取消Toast提醒');
          return;
        }

        // 显示确认对话框（触发状态已由background.js处理）
        const userConfirmed = confirm(message);
        console.log('[Content] 用户选择:', userConfirmed ? '确定' : '取消');
        
        if (userConfirmed) {
          // 用户点击确定，打开网站
          window.open(config.url, '_blank');
          console.log('[Content] 已打开网站:', config.url);
        }
      } catch (error) {
        console.error('[Content] Toast提醒出错:', error);
      } finally {
        // 重置标记
        window.dailyReminderToastShowing = false;
      }
    }, 800);
  }

  // 页面加载后延迟检查，避免干扰页面正常加载
  setTimeout(checkConfigsIfNeeded, 1500);

  // 添加用户交互监听，确保在用户活动时也能触发检查
  let userInteracted = false;
  const interactionEvents = ['click', 'keydown', 'scroll', 'mousemove'];
  
  function onUserInteraction() {
    if (!userInteracted && !window.dailyReminderInvalidated) {
      userInteracted = true;
      console.log('[Content] 检测到用户交互，延迟检查配置');
      setTimeout(checkConfigsIfNeeded, 1000);
      
      // 移除事件监听器，避免重复触发
      interactionEvents.forEach(event => {
        document.removeEventListener(event, onUserInteraction);
      });
    }
  }
  
  // 添加用户交互监听器
  interactionEvents.forEach(event => {
    document.addEventListener(event, onUserInteraction, { once: true, passive: true });
  });

  // 监听页面可见性变化，当页面重新变为可见时检查日期
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !window.dailyReminderInvalidated) {
      // 页面变为可见，通知后台检查日期并立即检查配置
      console.log('[Content] 页面变为可见，通知后台检查日期并检查配置');
      Utils.notifyBackgroundCheckDay();
      // 延迟检查配置，确保日期状态已更新
      setTimeout(checkConfigsIfNeeded, 1000);
    }
  });

  // 监听窗口焦点变化
  window.addEventListener('focus', () => {
    if (!window.dailyReminderInvalidated) {
      console.log('[Content] 窗口获得焦点，通知后台检查日期并检查配置');
      Utils.notifyBackgroundCheckDay();
      // 延迟检查配置，确保日期状态已更新
      setTimeout(checkConfigsIfNeeded, 1000);
    }
  });
})(); 