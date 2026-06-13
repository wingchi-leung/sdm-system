const test = require('node:test');
const assert = require('node:assert/strict');

function loadPageHeaderComponent({ wxMock = {} } = {}) {
  let componentConfig = null;
  global.Component = (config) => {
    componentConfig = config;
  };
  global.wx = {
    getWindowInfo() {
      return { statusBarHeight: 24 };
    },
    getSystemInfoSync() {
      return { statusBarHeight: 24 };
    },
    navigateBack() {},
    ...wxMock,
  };

  const componentPath = require.resolve('../components/page-header/page-header.js');
  delete require.cache[componentPath];
  require(componentPath);
  return componentConfig;
}

function createComponentInstance(config, initialProperties = {}) {
  const instance = {
    properties: {
      title: '',
      titleStyle: '',
      statusBarHeight: 0,
      showBack: true,
      autoBack: true,
      ...initialProperties,
    },
    data: {
      ...config.data,
    },
    setData(update) {
      this.data = {
        ...this.data,
        ...update,
      };
    },
    triggerEvent(name, detail) {
      this.lastEvent = { name, detail };
    },
  };

  Object.keys(config).forEach((key) => {
    if (key === 'data' || key === 'lifetimes' || key === 'methods' || key === 'options' || key === 'properties') {
      return;
    }
    instance[key] = config[key];
  });

  if (config.methods) {
    Object.keys(config.methods).forEach((key) => {
      instance[key] = config.methods[key];
    });
  }

  if (config.lifetimes && typeof config.lifetimes.attached === 'function') {
    instance.lifetimes = config.lifetimes;
  }

  return instance;
}

test('page-header 会回填状态栏高度', () => {
  const componentConfig = loadPageHeaderComponent({
    wxMock: {
      getWindowInfo() {
        return { statusBarHeight: 37 };
      },
    },
  });

  const instance = createComponentInstance(componentConfig);
  componentConfig.lifetimes.attached.call(instance);

  assert.equal(instance.data.resolvedStatusBarHeight, 37);
});

test('page-header 自动返回时会调用 navigateBack', () => {
  let navigateBackCount = 0;
  const componentConfig = loadPageHeaderComponent({
    wxMock: {
      navigateBack() {
        navigateBackCount += 1;
      },
    },
  });

  const instance = createComponentInstance(componentConfig, { autoBack: true });
  componentConfig.methods.onBackTap.call(instance);

  assert.equal(navigateBackCount, 1);
  assert.equal(instance.lastEvent, undefined);
});

test('page-header 关闭自动返回时会抛出 back 事件', () => {
  const componentConfig = loadPageHeaderComponent();
  const instance = createComponentInstance(componentConfig, { autoBack: false });

  componentConfig.methods.onBackTap.call(instance);

  assert.deepEqual(instance.lastEvent, { name: 'back', detail: undefined });
});
