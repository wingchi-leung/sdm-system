import { fetchAllListItems, fetchAllPaginatedItems } from './api-pagination';

jest.mock('../config/api', () => ({
  apiRequest: jest.fn(),
}));

const { apiRequest } = jest.requireMock('../config/api') as {
  apiRequest: jest.Mock;
};

describe('api-pagination helpers', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  test('fetchAllPaginatedItems 按 total 拉取全部分页数据', async () => {
    apiRequest
      .mockResolvedValueOnce({ data: { items: [{ id: 1 }, { id: 2 }], total: 3 } })
      .mockResolvedValueOnce({ data: { items: [{ id: 3 }], total: 3 } });

    await expect(fetchAllPaginatedItems<{ id: number }>(
      (skip, limit) => `/items?skip=${skip}&limit=${limit}`,
      2,
    )).resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  test('fetchAllListItems 在返回页不足 pageSize 时停止', async () => {
    apiRequest
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ data: [{ id: 3 }] });

    await expect(fetchAllListItems<{ id: number }>(
      (skip, limit) => `/logs?skip=${skip}&limit=${limit}`,
      2,
    )).resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});
