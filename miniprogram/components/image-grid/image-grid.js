/**
 * image-grid 组件
 * 图片网格:1/2-4/5+ 三种排布;view 模式预览,edit 模式增加/删除
 */
Component({
  properties: {
    // images:图片 URL 数组
    images: {
      type: Array,
      value: [],
    },
    // mode:view(只读预览)/ edit(可增删)
    mode: {
      type: String,
      value: 'view',
    },
    // max:最大图片张数
    max: {
      type: Number,
      value: 9,
    },
  },

  data: {
    layout: 'single', // single / grid-2 / grid-3
  },

  observers: {
    'images': function updateLayout(images) {
      const list = Array.isArray(images) ? images : [];
      let layout = 'single';
      if (list.length >= 5) {
        layout = 'grid-3';
      } else if (list.length >= 2) {
        layout = 'grid-2';
      } else {
        layout = 'single';
      }
      this.setData({ layout });
    },
  },

  methods: {
    /** 校验 mode 合法 */
    isEditMode() {
      return this.data.mode === 'edit';
    },

    /**
     * view 模式:点击图片预览
     * detail = { index, url }
     */
    onTapImage(e) {
      const { index, url } = e.currentTarget.dataset;
      // 默认调 wx.previewImage
      try {
        const urls = (this.data.images || []).map((it) => it);
        wx.previewImage({
          current: url,
          urls,
          fail(err) {
            // 静默失败:外层监听者会兜底
            console.warn('[image-grid] previewImage fail', err);
          },
        });
      } catch (err) {
        console.error('[image-grid] preview error', err);
      }
      this.triggerEvent('preview', { index, url });
    },

    /**
     * edit 模式:点击 + 占位
     * detail = { current, max }
     */
    onTapAdd() {
      const current = (this.data.images || []).length;
      this.triggerEvent('add', { current, max: this.data.max });
    },

    /**
     * edit 模式:点击 × 删除
     * detail = { index, url }
     */
    onTapRemove(e) {
      const { index, url } = e.currentTarget.dataset;
      this.triggerEvent('remove', { index, url });
    },
  },
});
