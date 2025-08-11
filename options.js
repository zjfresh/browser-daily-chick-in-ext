// 选项页面逻辑
document.addEventListener('DOMContentLoaded', async () => {
    let editingConfigId = null;

    // DOM 元素引用
    const configUrl = document.getElementById('configUrl');
    const configNote = document.getElementById('configNote');
    const configMode = document.getElementById('configMode');
    const configRuleType = document.getElementById('configRuleType');
    const intervalDays = document.getElementById('intervalDays');
    const intervalDaysGroup = document.getElementById('intervalDaysGroup');
    const firstTriggerDate = document.getElementById('firstTriggerDate');
    const firstTriggerGroup = document.getElementById('firstTriggerGroup');
    const addConfigBtn = document.getElementById('addConfigBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const configsList = document.getElementById('configsList');
    const configCount = document.getElementById('configCount');
    const exportConfigsBtn = document.getElementById('exportConfigsBtn');
    const importConfigsBtn = document.getElementById('importConfigsBtn');
    const importFileInput = document.getElementById('importFileInput');
    const resetAllBtn = document.getElementById('resetAllBtn');
    const resetGlobalLimitBtn = document.getElementById('resetGlobalLimitBtn');

    // 监听规则类型变化
    configRuleType.addEventListener('change', () => {
        if (configRuleType.value === 'interval') {
            intervalDaysGroup.style.display = 'block';
            firstTriggerGroup.style.display = 'block';
            // 设置默认日期为今天
            if (!firstTriggerDate.value) {
                firstTriggerDate.value = Utils.getTodayString();
            }
        } else {
            intervalDaysGroup.style.display = 'none';
            firstTriggerGroup.style.display = 'none';
        }
    });

    // 添加/更新配置
    addConfigBtn.addEventListener('click', async () => {
        if (!validateForm()) return;

        const config = {
            id: editingConfigId || Utils.generateId(),
            url: configUrl.value.trim(),
            note: configNote.value.trim(),
            mode: configMode.value,
            rule: buildRule()
        };

        const configs = await Utils.getConfigs();
        
        if (editingConfigId) {
            // 更新现有配置
            const index = configs.findIndex(c => c.id === editingConfigId);
            if (index !== -1) {
                configs[index] = config;
            }
        } else {
            // 添加新配置
            configs.push(config);
        }

        await Utils.saveConfigs(configs);
        resetForm();
        await loadConfigs();
        showMessage('配置保存成功！', 'success');
    });

    // 取消编辑
    cancelEditBtn.addEventListener('click', resetForm);

    // 导出配置
    exportConfigsBtn.addEventListener('click', async () => {
        const configs = await Utils.getConfigs();
        const dataStr = JSON.stringify(configs, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `daily-reminder-configs-${Utils.getTodayString()}.json`;
        link.click();
    });

    // 导入配置
    importConfigsBtn.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const configs = JSON.parse(e.target.result);
                    if (Array.isArray(configs)) {
                        await Utils.saveConfigs(configs);
                        // 通知后台配置已更新，触发立即检查
                        chrome.runtime.sendMessage({
                            action: 'configsUpdated'
                        }).catch((error) => {
                            console.warn('[Options] 通知后台配置更新失败:', error);
                        });
                        Utils.debugLog('[Options] 已通知后台配置更新，将触发立即检查');
                        await loadConfigs();
                        showMessage('配置导入成功！新配置将立即检查触发。', 'success');
                    } else {
                        showMessage('无效的配置文件格式！', 'error');
                    }
                } catch (error) {
                    showMessage('配置文件解析失败！', 'error');
                }
            };
            reader.readAsText(file);
        }
    });

    // 重置所有日期
    resetAllBtn.addEventListener('click', async () => {
        if (confirm('确定要清空所有配置的最后打开记录吗？这将使所有配置在下次浏览时重新触发。')) {
            const configs = await Utils.getConfigs();
            for (const config of configs) {
                // 使用Utils函数清空记录
                await Utils.setLastOpenDate(config.id, null);
            }
            showMessage('所有记录已清空！', 'success');
            // 重新加载配置以更新显示
            await loadConfigs();
        }
    });

    // 重置全局频率限制
    resetGlobalLimitBtn.addEventListener('click', () => {
        if (confirm('确定要重置全局频率限制吗？这将允许立即触发检查配置。')) {
            localStorage.removeItem('daily_reminder_last_global_check');
            Utils.debugLog('[Options] 全局频率限制已重置');
            showMessage('全局频率限制已重置！现在可以立即触发检查。', 'success');
        }
    });

    // 验证表单
    function validateForm() {
        if (!configUrl.value.trim()) {
            showMessage('请输入网站URL！', 'error');
            configUrl.focus();
            return false;
        }

        try {
            new URL(configUrl.value.trim());
        } catch {
            showMessage('请输入有效的URL！', 'error');
            configUrl.focus();
            return false;
        }

        if (configRuleType.value === 'interval') {
            const days = parseInt(intervalDays.value);
            if (!days || days < 1 || days > 365) {
                showMessage('间隔天数必须在1-365之间！', 'error');
                intervalDays.focus();
                return false;
            }
        }

        return true;
    }

    // 构建规则对象
    function buildRule() {
        const rule = { type: configRuleType.value };
        if (configRuleType.value === 'interval') {
            rule.days = parseInt(intervalDays.value);
            // 如果设置了首次触发日期，则保存
            if (firstTriggerDate.value) {
                rule.firstTriggerDate = firstTriggerDate.value;
            }
        }
        return rule;
    }

    // 重置表单
    function resetForm() {
        editingConfigId = null;
        configUrl.value = '';
        configNote.value = '';
        configMode.value = 'toast';
        configRuleType.value = 'daily';
        intervalDays.value = '3';
        firstTriggerDate.value = '';
        intervalDaysGroup.style.display = 'none';
        firstTriggerGroup.style.display = 'none';
        addConfigBtn.textContent = '添加配置';
        cancelEditBtn.style.display = 'none';
    }

    // 加载配置列表
    async function loadConfigs() {
        const configs = await Utils.getConfigs();
        configCount.textContent = configs.length;

        if (configs.length === 0) {
            configsList.innerHTML = '<p style="text-align: center; color: #666;">暂无配置，请添加您的第一个提醒配置。</p>';
            return;
        }

        const html = configs.map(config => createConfigHTML(config)).join('');
        configsList.innerHTML = html;

        // 添加事件监听器
        configs.forEach(config => {
            document.getElementById(`edit-${config.id}`).addEventListener('click', () => editConfig(config));
            document.getElementById(`delete-${config.id}`).addEventListener('click', () => deleteConfig(config.id));
            document.getElementById(`test-${config.id}`).addEventListener('click', () => testConfig(config));
        });

        // DOM 更新后立即加载最后打开日期
        await loadLastOpenDates();
    }

    // 创建配置HTML
    function createConfigHTML(config) {
        const ruleText = getRuleText(config.rule);
        const modeText = config.mode === 'auto' ? '自动打开' : '显示提醒';
        
        return `
            <div class="config-item">
                <div class="config-header">
                    <div class="config-url">${config.url}</div>
                    <div class="config-actions">
                        <button id="test-${config.id}" class="btn btn-secondary" style="font-size: 12px; padding: 4px 8px;">测试</button>
                        <button id="edit-${config.id}" class="btn btn-primary" style="font-size: 12px; padding: 4px 8px;">编辑</button>
                        <button id="delete-${config.id}" class="btn btn-danger" style="font-size: 12px; padding: 4px 8px;">删除</button>
                    </div>
                </div>
                <div class="config-details">
                    <div class="config-detail">
                        <div class="config-detail-label">模式</div>
                        <div>${modeText}</div>
                    </div>
                    <div class="config-detail">
                        <div class="config-detail-label">触发规则</div>
                        <div>${ruleText}</div>
                    </div>
                    <div class="config-detail">
                        <div class="config-detail-label">备注</div>
                        <div>${config.note || '无'}</div>
                    </div>
                    <div class="config-detail">
                        <div class="config-detail-label">最后打开</div>
                        <div id="lastOpen-${config.id}">加载中...</div>
                    </div>
                </div>
            </div>
        `;
    }

    // 获取规则文本描述
    function getRuleText(rule) {
        switch (rule.type) {
            case 'daily': return '每天';
            case 'weekday': return '仅工作日';
            case 'interval': 
                let text = `每${rule.days}天`;
                if (rule.firstTriggerDate) {
                    text += ` (首次: ${rule.firstTriggerDate})`;
                }
                return text;
            default: return '未知';
        }
    }

    // 编辑配置
    function editConfig(config) {
        editingConfigId = config.id;
        configUrl.value = config.url;
        configNote.value = config.note || '';
        configMode.value = config.mode;
        configRuleType.value = config.rule.type;
        
        if (config.rule.type === 'interval') {
            intervalDays.value = config.rule.days;
            firstTriggerDate.value = config.rule.firstTriggerDate || '';
            intervalDaysGroup.style.display = 'block';
            firstTriggerGroup.style.display = 'block';
        }

        addConfigBtn.textContent = '更新配置';
        cancelEditBtn.style.display = 'inline-block';
        
        // 滚动到表单顶部
        document.getElementById('addConfigForm').scrollIntoView({ behavior: 'smooth' });
    }

    // 删除配置
    async function deleteConfig(configId) {
        if (confirm('确定要删除这个配置吗？')) {
            const configs = await Utils.getConfigs();
            const newConfigs = configs.filter(c => c.id !== configId);
            await Utils.saveConfigs(newConfigs);
            
            // 同时删除相关的最后打开日期
            chrome.storage.local.remove([`lastOpen_${configId}`]);
            
            await loadConfigs();
            showMessage('配置已删除！', 'success');
        }
    }

    // 测试配置
    async function testConfig(config) {
        try {
            // 🔥 修复：测试时也要更新触发记录
            Utils.debugLog('[Options] 测试配置开始:', config.id);
            Utils.debugLog('[Options] 当前时间:', new Date().toISOString());
            Utils.debugLog('[Options] Utils.getTodayString():', Utils.getTodayString());
            
            // 先读取当前值，用于对比
            const beforeValue = await Utils.getLastOpenDate(config.id);
            Utils.debugLog('[Options] 测试前的lastOpenDate:', beforeValue);
            
            // 先标记为已触发（模拟真实触发行为）
            Utils.debugLog('[Options] 调用 Utils.setLastOpenDate(config.id)...');
            await Utils.setLastOpenDate(config.id);
            Utils.debugLog('[Options] setLastOpenDate调用完成');
            
            // 立即验证存储结果
            const afterValue = await Utils.getLastOpenDate(config.id);
            Utils.debugLog('[Options] 测试后的lastOpenDate:', afterValue);
            Utils.debugLog('[Options] 存储是否成功:', afterValue === Utils.getTodayString());
            
            if (config.mode === 'auto') {
                window.open(config.url, '_blank');
                showMessage('已在新标签页打开！测试记录已更新。', 'success');
            } else {
                // 使用confirm测试提醒功能
                const message = `提醒测试\n\n${config.note || '无备注'}\n\n网站: ${config.url}\n\n点击"确定"打开网站，点击"取消"关闭测试。`;
                const userConfirmed = confirm(message);
                
                if (userConfirmed) {
                    window.open(config.url, '_blank');
                    showMessage('测试成功，已打开网站！测试记录已更新。', 'success');
                } else {
                    showMessage('测试取消，但测试记录已更新。', 'info');
                }
            }
            
            // 等待一下再刷新显示
            Utils.debugLog('[Options] 等待1秒后刷新显示...');
            setTimeout(async () => {
                try {
                    await loadLastOpenDates();
                    Utils.debugLog('[Options] 页面显示已刷新');
                } catch (error) {
                    console.error('[Options] 刷新显示失败:', error);
                }
            }, 1000);
            
        } catch (error) {
            console.error('[Options] 测试配置失败:', error);
            showMessage('测试失败: ' + error.message, 'error');
        }
    }

    // 显示消息
    function showMessage(message, type = 'info') {
        // 创建消息元素
        const messageEl = document.createElement('div');
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
        `;
        messageEl.textContent = message;
        
        document.body.appendChild(messageEl);
        
        // 3秒后自动移除
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 3000);
    }

    // 加载最后打开日期
    async function loadLastOpenDates() {
        try {
            Utils.debugLog('[Options] 开始加载最后打开日期...');
            const configs = await Utils.getConfigs();
            Utils.debugLog('[Options] 找到配置数量:', configs.length);
            
            for (const config of configs) {
                Utils.debugLog(`[Options] 加载配置 ${config.id} 的最后打开日期...`);
                const lastOpenDate = await Utils.getLastOpenDate(config.id);
                Utils.debugLog(`[Options] 配置 ${config.id} 最后打开日期:`, lastOpenDate);
                
                const element = document.getElementById(`lastOpen-${config.id}`);
                if (element) {
                    element.textContent = lastOpenDate || '从未';
                    Utils.debugLog(`[Options] 已更新页面显示: ${config.id} -> ${lastOpenDate || '从未'}`);
                } else {
                    console.warn(`[Options] Element lastOpen-${config.id} not found`);
                }
            }
            Utils.debugLog('[Options] 最后打开日期加载完成');
        } catch (error) {
            console.error('[Options] Error loading last open dates:', error);
        }
    }

    // 初始化
    await loadConfigs();
}); 