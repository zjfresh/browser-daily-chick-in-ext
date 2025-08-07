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
                        await loadConfigs();
                        showMessage('配置导入成功！', 'success');
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
        if (confirm('确定要重置所有配置的最后打开日期吗？这将使所有配置在下次浏览时重新触发。')) {
            const configs = await Utils.getConfigs();
            for (const config of configs) {
                await Utils.setLastOpenDate(config.id, null);
            }
            showMessage('所有日期已重置！', 'success');
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
    function testConfig(config) {
        if (config.mode === 'auto') {
            window.open(config.url, '_blank');
            showMessage('已在新标签页打开！', 'success');
        } else {
            // 使用confirm测试提醒功能
            const message = `提醒测试\n\n${config.note || '无备注'}\n\n网站: ${config.url}\n\n点击"确定"打开网站，点击"取消"关闭测试。`;
            const userConfirmed = confirm(message);
            
            if (userConfirmed) {
                window.open(config.url, '_blank');
                showMessage('测试成功，已打开网站！', 'success');
            } else {
                showMessage('测试取消', 'info');
            }
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
            const configs = await Utils.getConfigs();
            for (const config of configs) {
                const lastOpenDate = await Utils.getLastOpenDate(config.id);
                const element = document.getElementById(`lastOpen-${config.id}`);
                if (element) {
                    element.textContent = lastOpenDate || '从未';
                } else {
                    console.warn(`Element lastOpen-${config.id} not found`);
                }
            }
        } catch (error) {
            console.error('Error loading last open dates:', error);
        }
    }

    // 初始化
    await loadConfigs();
}); 