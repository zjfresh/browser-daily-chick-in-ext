// 工具函数
const Utils = {
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
      return false;
    }

    const rule = config.rule;
    
    switch (rule.type) {
      case 'daily':
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
    return new Promise((resolve) => {
      chrome.storage.local.get(['configs'], (result) => {
        resolve(result.configs || []);
      });
    });
  },

  // 保存配置到存储
  async saveConfigs(configs) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ configs }, resolve);
    });
  },

  // 获取最后打开日期
  async getLastOpenDate(configId) {
    return new Promise((resolve) => {
      chrome.storage.local.get([`lastOpen_${configId}`], (result) => {
        resolve(result[`lastOpen_${configId}`] || null);
      });
    });
  },

  // 设置最后打开日期
  async setLastOpenDate(configId, date = null) {
    const dateToSave = date || this.getTodayString();
    return new Promise((resolve) => {
      chrome.storage.local.set({ [`lastOpen_${configId}`]: dateToSave }, resolve);
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