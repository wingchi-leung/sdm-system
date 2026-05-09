import { API_PATHS, formatApiError, loginApi } from './api';

describe('api error formatting', () => {
  test('formatApiError 将 FastAPI 校验错误数组转换为可展示文本', () => {
    expect(formatApiError([
      {
        type: 'string_too_short',
        loc: ['body', 'tenant_code'],
        msg: 'String should have at least 1 character',
        input: '',
      },
      {
        type: 'missing',
        loc: ['body', 'password'],
        msg: 'Field required',
        input: null,
      },
    ], '请求失败')).toBe(
      'body.tenant_code: String should have at least 1 character；body.password: Field required',
    );
  });

  test('loginApi 在登录失败时返回字符串错误而不是对象数组', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        detail: [
          {
            type: 'string_too_short',
            loc: ['body', 'tenant_code'],
            msg: 'String should have at least 1 character',
            input: '',
          },
        ],
      }),
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(loginApi('admin', '123456', '')).resolves.toEqual({
      error: 'body.tenant_code: String should have at least 1 character',
    });
  });
});

describe('api path configuration', () => {
  test('集合接口使用后端真实路径，避免跨域预检请求被尾斜杠重定向', () => {
    expect(API_PATHS.activities.list).toMatch(/\/activities\/$/);
    expect(API_PATHS.activities.create).toMatch(/\/activities\/$/);
    expect(API_PATHS.users.list).toMatch(/\/users\/$/);
    expect(API_PATHS.checkins.list).toMatch(/\/checkins\/$/);
    expect(API_PATHS.checkins.add).toMatch(/\/checkins\/$/);
  });
});
