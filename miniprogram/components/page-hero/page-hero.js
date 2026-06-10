/**
 * page-hero 组件
 * 页面顶部 hero 区，统一 eyebrow / title / description / tools slot 布局
 */
Component({
  properties: {
    // eyebrow:小标签文案(eyebrow 20rpx 灰色字距 2rpx)
    eyebrow: {
      type: String,
      value: '',
    },
    // title:主标题(42rpx 600)
    title: {
      type: String,
      value: '',
    },
    // description:副标题描述(26rpx 次要色)
    description: {
      type: String,
      value: '',
    },
    // tone:主题色(default / soft)
    tone: {
      type: String,
      value: 'default',
    },
  },
});
