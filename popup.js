// Popup 页面逻辑
document.addEventListener('DOMContentLoaded', async () => {
    // DOM 元素引用
    const totalConfigs = document.getElementById('totalConfigs');
    const enabledConfigs = document.getElementById('enabledConfigs');
    const todayTriggered = document.getElementById('todayTriggered');
    const pendingTriggers = document.getElementById('pendingTriggers');
    const currentDate = document.getElementById('currentDate');
    const openOptionsBtn = document.getElementById('openOptionsBtn');
    const checkNowBtn = document.getElementById('checkNowBtn');
    const resetTodayBtn = document.getElementById('resetTodayBtn');
    const popupTitle = document.getElementById('popupTitle');

    // 双击标题切换debug模式
    popupTitle.addEventListener('dblclick', async () => {
        try {
            const currentDebug = await Utils.getDebugEnabled();
            await Utils.setDebugEnabled(!currentDebug);
            const newState = !currentDebug;
            showMessage(`Debug日志已${newState ? '开启' : '关闭'}`, newState ? 'success' : 'info');
            Utils.debugLog('[Popup] Debug日志状态切换:', newState);
        } catch (error) {
            showMessage('Debug状态切换失败', 'error');
            console.error('Debug toggle failed:', error);
        }
    });

    // 打开选项页面
    openOptionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close();
    });

    // 立即检查
    checkNowBtn.addEventListener('click', async () => {
        try {
            // 1. 先设置检查标识为true，强制触发检查
            await chrome.runtime.sendMessage({
                action: 'configsUpdated'
            });
            Utils.debugLog('[Popup] 已设置强制检查标识');
            
            // 2. 向当前活动标签页发送消息触发检查
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab && tab.url && !tab.url.startsWith('chrome://')) {
                // 注入工具函数和触发检查
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['utils.js']
                });
                
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: async function() {
                        // 使用新架构的检查机制
                        if (window.checkConfigsIfNeeded) {
                            Utils.debugLog('[Popup] 触发页面检查...');
                            await window.checkConfigsIfNeeded();
                        } else {
                            // 如果页面没有content script，手动执行检查
                            const configs = await Utils.getConfigs();
                            let triggeredCount = 0;
                            
                            for (const config of configs) {
                                const lastOpenDate = await Utils.getLastOpenDate(config.id);
                                
                                if (Utils.shouldTrigger(config, lastOpenDate)) {
                                    if (config.mode === 'auto') {
                                        window.open(config.url, '_blank');
                                        await Utils.setLastOpenDate(config.id);
                                        triggeredCount++;
                                    } else if (config.mode === 'toast') {
                                        // 使用confirm对话框
                                        const message = `Daily Reminder (手动触发)\n\n${config.note || 'Time to check this site!'}\n\n网站: ${config.url}\n\n点击"确定"打开网站，点击"取消"忽略提醒。`;
                                        
                                        // 无论用户选择什么，都标记为已触发（避免重复提醒）
                                        await Utils.setLastOpenDate(config.id);
                                        
                                        const userConfirmed = confirm(message);
                                        
                                        if (userConfirmed) {
                                            window.open(config.url, '_blank');
                                        }
                                        
                                        triggeredCount++;
                                    }
                                }
                            }
                            
                            if (triggeredCount === 0) {
                                alert('当前没有需要触发的提醒配置。');
                            }
                        }
                    }
                });
                
                showMessage('检查已触发！');
                setTimeout(() => {
                    updateStats();
                }, 1000);
            } else {
                showMessage('无法在此页面执行检查，请切换到其他网页。');
            }
        } catch (error) {
            console.error('Error triggering check:', error);
            showMessage('检查失败，请稍后重试。');
        }
    });

    // 重置今日
    resetTodayBtn.addEventListener('click', async () => {
        try {
            const configs = await Utils.getConfigs();
            const today = Utils.getTodayString();
            
            // 清除所有今日的触发记录
            for (const config of configs) {
                const lastOpenDate = await Utils.getLastOpenDate(config.id);
                if (lastOpenDate === today) {
                    chrome.storage.local.remove([`lastOpen_${config.id}`]);
                }
            }
            
            // 通知后台设置检查标识，以便重新触发
            try {
                await chrome.runtime.sendMessage({
                    action: 'configsUpdated'
                });
                Utils.debugLog('[Popup] 已通知后台重置记录后需要重新检查');
            } catch (error) {
                Utils.debugLog('[Popup] 通知后台检查失败:', error);
            }
            
            showMessage('今日记录已重置！现在切换页面将重新触发配置。');
            updateStats();
        } catch (error) {
            console.error('Error resetting today:', error);
            showMessage('重置失败，请稍后重试。');
        }
    });

    // 确保获取最新的日期状态
    async function ensureCurrentDate() {
        try {
            // 通知后台检查日期
            await Utils.notifyBackgroundCheckDay();
        } catch (error) {
            console.warn('无法通知后台检查日期:', error);
        }
    }

    // 更新统计信息
    async function updateStats() {
        try {
            // 确保日期是最新的
            await ensureCurrentDate();
            
            const configs = await Utils.getConfigs();
            const today = Utils.getTodayString();
            
            totalConfigs.textContent = configs.length;
            
            let enabledCount = 0;
            let triggeredToday = 0;
            let pending = 0;
            
            for (const config of configs) {
                const enabled = config.enabled !== undefined ? config.enabled : true;
                if (enabled) {
                    enabledCount++;
                }
                
                const lastOpenDate = await Utils.getLastOpenDate(config.id);
                
                if (lastOpenDate === today) {
                    triggeredToday++;
                } else if (Utils.shouldTrigger(config, lastOpenDate)) {
                    pending++;
                }
            }
            
            enabledConfigs.textContent = enabledCount;
            todayTriggered.textContent = triggeredToday;
            pendingTriggers.textContent = pending;
            
        } catch (error) {
            console.error('Error updating stats:', error);
            totalConfigs.textContent = '?';
            enabledConfigs.textContent = '?';
            todayTriggered.textContent = '?';
            pendingTriggers.textContent = '?';
        }
    }

    // 显示消息
    function showMessage(message) {
        // 简单的消息显示，在popup中使用临时元素
        const messageEl = document.createElement('div');
        messageEl.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
        `;
        messageEl.textContent = message;
        
        document.body.appendChild(messageEl);
        
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 2000);
    }

    // 初始化
    currentDate.textContent = Utils.getTodayString();
    await updateStats();
}); 