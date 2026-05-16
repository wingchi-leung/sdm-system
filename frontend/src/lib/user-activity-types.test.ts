import { buildTypeSyncPlan, extractUserActivityTypeIds } from './user-activity-types';

describe('user-activity-types helpers', () => {
  test('extractUserActivityTypeIds 能解析后端 items 响应', () => {
    const ids = extractUserActivityTypeIds({
      items: [
        { activity_type_id: 3 },
        { activity_type_id: 8 },
      ],
      total: 2,
    });

    expect(ids).toEqual([3, 8]);
  });

  test('buildTypeSyncPlan 能产出增删差异', () => {
    const plan = buildTypeSyncPlan([1, 2, 3], [2, 4]);
    expect(plan).toEqual({
      toAdd: [4],
      toRemove: [1, 3],
    });
  });
});
