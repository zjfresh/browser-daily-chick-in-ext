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

      console.log('[Content] 查询是否需要检查配置...');

      // 查询后台的检查标识
      let response;
      try {
        response = await chrome.runtime.sendMessage({
          action: 'checkIfNeeded',
        });
        console.log('[Content] 收到后台响应:', response);
      } catch (error) {
        console.error('[Content] 发送消息失败:', error);
        return;
      }

      if (!response || !response.needsCheck) {
        console.log('[Content] 后台标识显示无需检查，跳过');
        return;
      }

      console.log('[Content] 后台标识显示需要检查，开始检查配置...');

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
      console.log('[Content] 开始检查所有配置...');
      const configs = await Utils.getConfigs();
      console.log('[Content] 找到配置数量:', configs.length);

      let triggeredCount = 0;
      const currentUrl = window.location.href;

      for (const config of configs) {
        const lastOpenDate = await Utils.getLastOpenDate(config.id);
        const shouldTrigger = Utils.shouldTrigger(config, lastOpenDate);

        console.log(`[Content] 配置检查: ${config.url} (${config.mode}), 最后打开: ${lastOpenDate}, 应该触发: ${shouldTrigger}`);

        if (!shouldTrigger) {
          continue;
        }

        // 检查当前页面是否就是目标页面，显示reload通知
        if (urlsMatch(currentUrl, config.url)) {
          console.log(`[Content] 当前页面 ${currentUrl} 与目标页面 ${config.url} 匹配，显示reload通知`);
          await Utils.setLastOpenDate(config.id);
          showTargetPageNotification(config);
          console.log(`[Content] 已在目标页面标记 ${config.id} 为已触发并显示通知`);
          continue;
        }

        // 根据模式触发相应动作
        triggeredCount++;

        if (config.mode === 'auto') {
          // 自动打开模式：通过background.js打开新标签页
          console.log('[Content] 触发自动打开:', config.url);
          await Utils.setLastOpenDate(config.id);
          chrome.runtime.sendMessage({
            action: 'openUrl',
            url: config.url,
          });
          console.log('[Content] 已发送打开页面请求:', config.url);
        } else if (config.mode === 'toast') {
          // Toast提醒模式：显示确认对话框
          console.log('[Content] 触发Toast提醒:', config.url);
          await Utils.setLastOpenDate(config.id);
          showToastReminder(config);
        }
      }

      console.log(`[Content] 配置检查完成，触发了 ${triggeredCount} 个配置`);
    } catch (error) {
      console.error('[Content] 执行配置检查时出错:', error);
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

  // 注意：不再监听newDayStarted消息，采用按需激活模式

  // 注意：自动打开功能现在由background.js直接处理

  // 显示Toast提醒（依赖日期检查和needsCheck标识防止重复）
  function showToastReminder(config) {
    // 检查是否已经存在提醒
    if (window.dailyReminderToastShowing) {
      console.log('[Content] Toast正在显示中，跳过重复显示');
      return;
    }

    // 标记正在显示提醒
    window.dailyReminderToastShowing = true;

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

  // 显示目标页面通知（当前页面就是目标页面时）
  function showTargetPageNotification(config) {
    // 检查是否已经存在通知，避免重复显示
    if (document.getElementById('dailyReminderTargetNotification')) {
      console.log('[Content] 目标页面通知已存在，跳过重复显示');
      return;
    }

    console.log('[Content] 显示目标页面reload通知:', config.url);

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
      console.log('[Content] 用户点击关闭目标页面通知');
      hideTargetPageNotification();
    });

    reloadBtn.addEventListener('click', () => {
      console.log('[Content] 用户点击reload目标页面');
      hideTargetPageNotification();
      // 短暂延迟后reload，让动画完成
      setTimeout(() => {
        location.reload();
      }, 200);
    });

    // 5秒后自动隐藏（可选）
    setTimeout(() => {
      if (document.getElementById('dailyReminderTargetNotification')) {
        console.log('[Content] 目标页面通知自动隐藏');
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
      console.log('[Content] 检测到用户交互，延迟检查配置');
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
