// 内容脚本 - 在页面加载时检查是否需要显示提醒
(async function () {
  // 避免重复执行
  if (window.dailyReminderLoaded) return;
  window.dailyReminderLoaded = true;

  // 检查扩展上下文是否有效
  if (!chrome || !chrome.storage || !chrome.runtime) {
    console.warn('[Content] 扩展上下文无效，content script将不会启动');
    return;
  }

  // 🔥 新架构：检查标识驱动的配置检查
  async function checkConfigsIfNeeded() {
    try {
      // 检查扩展上下文是否有效
      if (!chrome || !chrome.storage || !chrome.runtime) {
        console.warn('[Content] 扩展上下文失效，停止检查');
        return;
      }

      Utils.debugLog('[Content] 查询是否需要检查配置...');

      // 查询后台的检查标识
      let response;
      try {
        response = await chrome.runtime.sendMessage({
          action: 'checkIfNeeded',
        });
        Utils.debugLog('[Content] 收到后台响应:', response);
      } catch (error) {
        console.error('[Content] 发送消息失败:', error);
        return;
      }

      if (!response || !response.needsCheck) {
        Utils.debugLog('[Content] 后台标识显示无需检查，跳过');
        return;
      }

      Utils.debugLog('[Content] 后台标识显示需要检查，开始检查配置...');

      // 执行配置检查和触发
      await performConfigCheck();

      // 通知后台检查已完成
      chrome.runtime
        .sendMessage({
          action: 'checkCompleted',
        })
        .catch((error) => {
          console.warn('[Content] 通知检查完成失败:', error);
        });
    } catch (error) {
      if (error.message.includes('Extension context invalidated') || error.message.includes('Chrome storage API not available')) {
        console.warn('[Content] 扩展上下文失效，content script将停止工作');
        // 标记脚本为失效，避免进一步的API调用
        window.dailyReminderInvalidated = true;
      } else {
        console.error('[Content] 检查提醒时出错:', error);
      }
    }
  }

  // 执行配置检查和触发（处理所有模式，统一在content.js中处理）
  async function performConfigCheck() {
    try {
      Utils.debugLog('[Content] 开始检查所有配置...');
      const configs = await Utils.getConfigs();
      Utils.debugLog('[Content] 找到配置数量:', configs.length);

      let triggeredCount = 0;
      const currentUrl = window.location.href;

      // 先收集所有需要触发的配置（分类）
      const autoConfigs = [];
      const toastConfigs = [];
      const targetPageConfigs = [];

      for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        Utils.debugLog(`[Content] 检查配置 ${i + 1}/${configs.length}: ${config.url} (${config.mode})`);

        const lastOpenDate = await Utils.getLastOpenDate(config.id);
        const shouldTrigger = Utils.shouldTrigger(config, lastOpenDate);

        Utils.debugLog(`[Content] 配置检查: ${config.url} (${config.mode}), 最后打开: ${lastOpenDate}, 应该触发: ${shouldTrigger}`);

        if (!shouldTrigger) {
          continue;
        }

        // 检查当前页面是否就是目标页面
        if (urlsMatch(currentUrl, config.url)) {
          Utils.debugLog(`[Content] 当前页面 ${currentUrl} 与目标页面 ${config.url} 匹配`);
          targetPageConfigs.push(config);
          continue;
        }

        // 根据模式分类
        if (config.mode === 'auto') {
          autoConfigs.push(config);
        } else if (config.mode === 'toast') {
          toastConfigs.push(config);
        }
      }

      Utils.debugLog(`[Content] 配置分类完成: auto=${autoConfigs.length}, toast=${toastConfigs.length}, target=${targetPageConfigs.length}`);

      // 处理目标页面配置（当前页面就是目标）
      for (const config of targetPageConfigs) {
        Utils.debugLog(`[Content] 处理目标页面配置: ${config.url}`);
        await Utils.setLastOpenDate(config.id);
        showTargetPageNotification(config);
        triggeredCount++;
      }

      // 处理自动打开配置
      for (const config of autoConfigs) {
        Utils.debugLog('[Content] 处理自动打开配置:', config.url);
        await Utils.setLastOpenDate(config.id);
        chrome.runtime.sendMessage({
          action: 'openUrl',
          url: config.url,
        }).catch(err => {
          console.error('[Content] 发送打开页面请求失败:', err);
        });
        triggeredCount++;
      }

      // 处理Toast配置（先收集所有决定，再统一打开）
      const urlsToOpen = [];
      for (let i = 0; i < toastConfigs.length; i++) {
        const config = toastConfigs[i];
        Utils.debugLog('[Content] 处理Toast配置:', config.url);
        await Utils.setLastOpenDate(config.id);
        
        const remainingCount = toastConfigs.length - i - 1;
        const queueInfo = remainingCount > 0 ? `\n\n[还有 ${remainingCount} 个待处理提醒]` : '';
        const message = `Daily Reminder (${i + 1}/${toastConfigs.length})\n\n============\n${config.note || 'Time to check this site!'}\n============\n\n网站: ${config.url}${queueInfo}\n\n点击"确定"标记为打开，点击"取消"忽略提醒。`;
        
        Utils.debugLog('[Content] 显示Toast确认对话框:', config.url);
        const userConfirmed = confirm(message);
        Utils.debugLog('[Content] 用户选择:', userConfirmed ? '确定' : '取消');
        
        if (userConfirmed) {
          // 记录用户想打开的URL
          urlsToOpen.push(config.url);
        }
        
        triggeredCount++;
      }
      
      // 🔥 所有 confirm 处理完后，统一打开页面
      if (urlsToOpen.length > 0) {
        Utils.debugLog('[Content] 开始打开用户选择的网站，共', urlsToOpen.length, '个');
        for (let i = 0; i < urlsToOpen.length; i++) {
          const url = urlsToOpen[i];
          Utils.debugLog('[Content] 打开网站:', url);
          
          // 第一个网站可能会切换焦点，后续的通过扩展API打开更可靠
          if (i === 0) {
            window.open(url, '_blank');
          } else {
            // 使用扩展API打开，更稳定
            try {
              await chrome.runtime.sendMessage({
                action: 'openUrl',
                url: url,
              });
            } catch (err) {
              console.error('[Content] 发送打开页面请求失败，回退到 window.open:', err);
              window.open(url, '_blank');
            }
          }
          
          // 每次打开之间稍微延迟，避免浏览器阻止
          if (i < urlsToOpen.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        Utils.debugLog('[Content] ✅ 所有网站已打开');
      }

      Utils.debugLog(`[Content] ✅ 配置检查完成，触发了 ${triggeredCount} 个配置`);
    } catch (error) {
      console.error('[Content] ❌ 执行配置检查时出错:', error);
      console.error('[Content] 错误堆栈:', error.stack);
    }
  }

  // URL匹配检查函数
  function urlsMatch(url1, url2, onlyMatchHost = true) {
    try {
      const parsed1 = new URL(url1);
      const parsed2 = new URL(url2);

      return onlyMatchHost ? parsed1.hostname === parsed2.hostname : parsed1.hostname === parsed2.hostname && parsed1.pathname === parsed2.pathname;
    } catch (error) {
      const clean1 = url1
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .split('?')[0]
        .split('#')[0];
      const clean2 = url2
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .split('?')[0]
        .split('#')[0];
      return clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1);
    }
  }



  // 显示目标页面通知（当前页面就是目标页面时）
  function showTargetPageNotification(config) {
    // 检查是否已经存在通知，避免重复显示
    if (document.getElementById('dailyReminderTargetNotification')) {
      Utils.debugLog('[Content] 目标页面通知已存在，跳过重复显示');
      return;
    }

    Utils.debugLog('[Content] 显示目标页面reload通知:', config.url);

    // 创建通知容器
    const notification = document.createElement('div');
    notification.id = 'dailyReminderTargetNotification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      max-width: 350px;
      min-width: 280px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      animation: dailyReminderSlideIn 0.3s ease-out;
    `;

    // 添加CSS动画样式
    if (!document.getElementById('dailyReminderNotificationStyles')) {
      const styles = document.createElement('style');
      styles.id = 'dailyReminderNotificationStyles';
      styles.textContent = `
        @keyframes dailyReminderSlideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes dailyReminderSlideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
        .daily-reminder-btn {
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          margin: 0 4px;
          font-weight: 500;
        }
        .daily-reminder-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
        }
        .daily-reminder-btn.primary {
          background: rgba(255, 255, 255, 0.9);
          color: #667eea;
        }
        .daily-reminder-btn.primary:hover {
          background: white;
        }
      `;
      document.head.appendChild(styles);
    }

    // 创建通知内容
    notification.innerHTML = `
      <div style="display: flex; align-items: flex-start; margin-bottom: 12px;">
        <div style="flex-shrink: 0; margin-right: 12px; font-size: 20px;">🎯</div>
        <div style="flex-grow: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">目标页面已到达</div>
          <div style="font-size: 13px; opacity: 0.9; line-height: 1.3;">
            ${config.note || '当前页面是待触发的目标页面'}
          </div>
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
        <button class="daily-reminder-btn" id="dailyReminderCloseBtn">关闭</button>
        <button class="daily-reminder-btn primary" id="dailyReminderReloadBtn">🔄 Reload</button>
      </div>
    `;

    // 添加到页面
    document.body.appendChild(notification);

    // 添加事件监听器
    const closeBtn = document.getElementById('dailyReminderCloseBtn');
    const reloadBtn = document.getElementById('dailyReminderReloadBtn');

    closeBtn.addEventListener('click', () => {
      Utils.debugLog('[Content] 用户点击关闭目标页面通知');
      hideTargetPageNotification();
    });

    reloadBtn.addEventListener('click', () => {
      Utils.debugLog('[Content] 用户点击reload目标页面');
      hideTargetPageNotification();
      // 短暂延迟后reload，让动画完成
      setTimeout(() => {
        location.reload();
      }, 200);
    });

    // 5秒后自动隐藏（可选）
    setTimeout(() => {
      if (document.getElementById('dailyReminderTargetNotification')) {
        Utils.debugLog('[Content] 目标页面通知自动隐藏');
        hideTargetPageNotification();
      }
    }, 8000);
  }

  // 隐藏目标页面通知
  function hideTargetPageNotification() {
    const notification = document.getElementById('dailyReminderTargetNotification');
    if (notification) {
      // 添加退出动画
      notification.style.animation = 'dailyReminderSlideOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }

  // 将函数暴露到全局作用域，以便popup.js调用
  window.checkConfigsIfNeeded = checkConfigsIfNeeded;

  // 页面加载后延迟检查，避免干扰页面正常加载
  setTimeout(checkConfigsIfNeeded, 1500);

  // 添加用户交互监听，确保在用户活动时也能触发检查
  let userInteracted = false;
  const interactionEvents = ['click', 'keydown', 'scroll', 'mousemove'];

  function onUserInteraction() {
    if (!userInteracted && !window.dailyReminderInvalidated) {
      userInteracted = true;
      Utils.debugLog('[Content] 检测到用户交互，延迟检查配置');
      setTimeout(checkConfigsIfNeeded, 1000);

      // 移除事件监听器，避免重复触发
      interactionEvents.forEach((event) => {
        document.removeEventListener(event, onUserInteraction);
      });
    }
  }

  // 添加用户交互监听器
  interactionEvents.forEach((event) => {
    document.addEventListener(event, onUserInteraction, { once: true, passive: true });
  });

  // 监听页面可见性变化，当页面重新变为可见时检查日期
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !window.dailyReminderInvalidated) {
      // 页面变为可见，通知后台检查日期并立即检查配置
      Utils.debugLog('[Content] 页面变为可见，通知后台检查日期并检查配置');
      Utils.notifyBackgroundCheckDay();
      // 延迟检查配置，确保日期状态已更新
      setTimeout(checkConfigsIfNeeded, 1000);
    }
  });

  // 监听窗口焦点变化
  window.addEventListener('focus', () => {
    if (!window.dailyReminderInvalidated) {
      Utils.debugLog('[Content] 窗口获得焦点，通知后台检查日期并检查配置');
      Utils.notifyBackgroundCheckDay();
      // 延迟检查配置，确保日期状态已更新
      setTimeout(checkConfigsIfNeeded, 1000);
    }
  });
})();
