// state-view 组件
// 用途: 列表/页面级空态、加载、错误三态展示
Component({
  options: {
    multipleSlots: false,
  },

  properties: {
    // 状态: loading / error / empty / idle
    state: {
      type: String,
      value: 'idle',
    },
    // 主标题(空则按 state 给默认中文文案)
    title: {
      type: String,
      value: '',
    },
    // 副标题描述
    description: {
      type: String,
      value: '',
    },
    // 按钮文案(空则不显示按钮)
    actionText: {
      type: String,
      value: '',
    },
    // 按钮跳转路径(非空则组件内部直接 navigateTo,否则只 triggerEvent)
    actionPath: {
      type: String,
      value: '',
    },
  },

  data: {
    // 展示用的最终文案(根据 state 与 props 计算)
    resolvedTitle: '',
    resolvedDescription: '',
    iconText: '',
  },

  observers: {
    'state, title, description': function updateTexts(state, title, description) {
      // 按 state 给默认中文文案
      const defaults = this._getDefaults(state);
      this.setData({
        resolvedTitle: title || defaults.title,
        resolvedDescription: description || defaults.description,
        iconText: defaults.icon,
      });
    },
  },

  lifetimes: {
    attached() {
      const { state, title, description } = this.data;
      const defaults = this._getDefaults(state);
      this.setData({
        resolvedTitle: title || defaults.title,
        resolvedDescription: description || defaults.description,
        iconText: defaults.icon,
      });
    },
  },

  methods: {
    /**
     * 按 state 给出默认标题/描述/图标
     * @param {string} state - loading/error/empty/idle
     * @returns {{title:string, description:string, icon:string}}
     */
    _getDefaults(state) {
      switch (state) {
        case 'loading':
          return { title: '加载中...', description: '', icon: '' };
        case 'error':
          return { title: '出错了', description: '请稍后再试', icon: '⚠️' };
        case 'empty':
          return { title: '暂无内容', description: '', icon: '📭' };
        case 'idle':
        default:
          return { title: '', description: '', icon: '' };
      }
    },

    /**
     * 按钮点击处理: 若 actionPath 非空则内部 navigateTo,否则 triggerEvent('action')
     */
    _onActionTap() {
      const path = this.data.actionPath;
      if (path) {
        // 内部直接跳转,不再向上抛事件
        wx.navigateTo({ url: path, fail: () => {
          try { wx.switchTab({ url: path }); } catch (e) { /* 静默失败,控制台提示 */ }
        } });
        return;
      }
      this.triggerEvent('action', { state: this.data.state });
    },
  },
});
