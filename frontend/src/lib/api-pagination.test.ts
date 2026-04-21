import { fetchAllListItems, fetchAllPaginatedItems, mapWithConcurrency } from './api-pagination';

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

  test('mapWithConcurrency 限制并发并保持结果顺序', async () => {
    let runningCount = 0;
    let maxRunningCount = 0;

    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      runningCount += 1;
      maxRunningCount = Math.max(maxRunningCount, runningCount);
      await Promise.resolve();
      runningCount -= 1;
      return item * 2;
    });

    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(maxRunningCount).toBeLessThanOrEqual(2);
  });
});
