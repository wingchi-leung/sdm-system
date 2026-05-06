import { formatApiError, loginApi } from './api';

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
