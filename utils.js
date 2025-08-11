// 工具函数
const Utils = {
  // Debug Log 功能
  DEBUG_LOG_KEY: 'daily_reminder_debug_log',
  
  // 获取debug状态
  async getDebugEnabled() {
    try {
      if (!chrome || !chrome.storage) {
        return false;
      }
      const result = await chrome.storage.local.get([this.DEBUG_LOG_KEY]);
      return result[this.DEBUG_LOG_KEY] === true;
    } catch (error) {
      return false;
    }
  },
  
  // 设置debug状态
  async setDebugEnabled(enabled) {
    try {
      if (!chrome || !chrome.storage) {
        return;
      }
      await chrome.storage.local.set({ [this.DEBUG_LOG_KEY]: enabled });
    } catch (error) {
      console.error('Failed to set debug state:', error);
    }
  },
  
  // Debug日志函数
  async debugLog(...args) {
    try {
      const enabled = await this.getDebugEnabled();
      if (enabled) {
        console.log(...args);
      }
    } catch (error) {
      // Silent fail to avoid infinite loops
    }
  },
  // 获取今天的日期字符串 (YYYY-MM-DD)
  getTodayString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
  },

  // 检查是否是工作日 (周一到周五)
  isWeekday(date = new Date()) {
    const day = date.getDay();
    return day >= 1 && day <= 5;
  },

  // 计算两个日期之间的天数差
  daysDifference(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    const firstDate = new Date(date1);
    const secondDate = new Date(date2);
    return Math.round((secondDate - firstDate) / oneDay);
  },

  // 检查配置是否应该触发
  shouldTrigger(config, lastOpenDate) {
    const today = this.getTodayString();
    
    // 如果今天已经触发过，则不再触发
    if (lastOpenDate === today) {
      Utils.debugLog(`[Utils] 配置 ${config.url} 今日已触发，跳过`);
      return false;
    }

    const rule = config.rule;
    
            switch (rule.type) {
      case 'daily':
        Utils.debugLog(`[Utils] 每日规则检查通过: ${config.url}`);
        return true;
      
      case 'weekday':
        return this.isWeekday();
      
      case 'interval':
        // 如果设置了首次触发日期
        if (rule.firstTriggerDate) {
          const firstDate = rule.firstTriggerDate;
          // 如果今天还没到首次触发日期
          if (today < firstDate) {
            return false;
          }
          
          // 如果没有记录或者是首次触发日期
          if (!lastOpenDate) {
            return today >= firstDate;
          }
          
          // 计算从首次触发日期开始的间隔
          const daysSinceFirst = this.daysDifference(firstDate, today);
          const daysSinceLast = this.daysDifference(lastOpenDate, today);
          
          // 检查是否满足间隔要求
          return daysSinceLast >= rule.days && daysSinceFirst % rule.days === 0;
        } else {
          // 原来的逻辑：没有设置首次触发日期
          if (!lastOpenDate) return true;
          const daysDiff = this.daysDifference(lastOpenDate, today);
          return daysDiff >= rule.days;
        }
      
      default:
        return false;
    }
  },

  // 从存储中获取配置
  async getConfigs() {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome || !chrome.storage) {
          reject(new Error('Chrome storage API not available'));
          return;
        }
        
        chrome.storage.local.get(['configs'], (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result.configs || []);
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // 保存配置到存储
  async saveConfigs(configs) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome || !chrome.storage) {
          reject(new Error('Chrome storage API not available'));
          return;
        }
        
        chrome.storage.local.set({ configs }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // 获取最后打开日期
  async getLastOpenDate(configId) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome || !chrome.storage) {
          const error = new Error('Chrome storage API not available');
          console.error('[Utils] getLastOpenDate failed:', error);
          reject(error);
          return;
        }
        
        Utils.debugLog(`[Utils] 正在读取 lastOpen_${configId}...`);
        chrome.storage.local.get([`lastOpen_${configId}`], (result) => {
          if (chrome.runtime.lastError) {
            const error = new Error(chrome.runtime.lastError.message);
            console.error(`[Utils] getLastOpenDate chrome.runtime.lastError:`, error);
            reject(error);
            return;
          }
          
          const value = result[`lastOpen_${configId}`] || null;
          Utils.debugLog(`[Utils] 读取结果 lastOpen_${configId}:`, value);
          resolve(value);
        });
      } catch (error) {
        console.error(`[Utils] getLastOpenDate catch error:`, error);
        reject(error);
      }
    });
  },

  // 设置最后打开日期
  async setLastOpenDate(configId, date) {
    if (arguments.length === 2 && date === null) {
      // 如果明确传入null，则删除记录
      return new Promise((resolve, reject) => {
        try {
          if (!chrome || !chrome.storage) {
            reject(new Error('Chrome storage API not available'));
            return;
          }
          
          chrome.storage.local.remove([`lastOpen_${configId}`], () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    }
    
    const dateToSave = date || this.getTodayString();
    Utils.debugLog(`[Utils] 准备保存 lastOpen_${configId} = ${dateToSave}`);
    
    return new Promise((resolve, reject) => {
      try {
        if (!chrome || !chrome.storage) {
          const error = new Error('Chrome storage API not available');
          console.error('[Utils] setLastOpenDate failed:', error);
          reject(error);
          return;
        }
        
        chrome.storage.local.set({ [`lastOpen_${configId}`]: dateToSave }, () => {
          if (chrome.runtime.lastError) {
            const error = new Error(chrome.runtime.lastError.message);
            console.error(`[Utils] setLastOpenDate chrome.runtime.lastError:`, error);
            reject(error);
            return;
          }
          Utils.debugLog(`[Utils] ✅ 成功保存 lastOpen_${configId} = ${dateToSave}`);
          resolve();
        });
      } catch (error) {
        console.error(`[Utils] setLastOpenDate catch error:`, error);
        reject(error);
      }
    });
  },

  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // 通知后台脚本检查日期变化
  async notifyBackgroundCheckDay() {
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        await chrome.runtime.sendMessage({ action: 'checkCurrentDay' });
      }
    } catch (error) {
      console.warn('[Utils] 无法通知后台脚本:', error);
    }
  }
}; 