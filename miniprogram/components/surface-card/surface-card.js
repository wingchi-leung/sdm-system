// surface-card 组件
// 用途: 统一的白色卡片容器,圆角 + 轻阴影,可点击
Component({
  options: {
    multipleSlots: true,
  },

  properties: {
    // 内边距档位: none / sm / md / lg
    padding: {
      type: String,
      value: 'md',
    },
    // 是否可点击
    clickable: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    // 实际 class 串(根据 padding 切换)
    paddingClass: 'surface-card--padding-md',
  },

  observers: {
    'padding': function updatePadding(padding) {
      // 只接受白名单档位,非法值回落 md
      const allowed = ['none', 'sm', 'md', 'lg'];
      const safe = allowed.indexOf(padding) >= 0 ? padding : 'md';
      this.setData({
        paddingClass: `surface-card--padding-${safe}`,
      });
    },
  },

  lifetimes: {
    attached() {
      const { padding } = this.data;
      const allowed = ['none', 'sm', 'md', 'lg'];
      const safe = allowed.indexOf(padding) >= 0 ? padding : 'md';
      this.setData({
        paddingClass: `surface-card--padding-${safe}`,
      });
    },
  },

  methods: {
    /**
     * 仅 clickable=true 时触发 tap 事件
     */
    _onTap() {
      if (!this.data.clickable) return;
      this.triggerEvent('tap', {});
    },
  },
});
