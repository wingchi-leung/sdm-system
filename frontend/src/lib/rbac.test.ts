import { formatScopeLabel, groupPermissionsByResource } from './rbac';

describe('rbac helpers', () => {
  it('formats scope labels', () => {
    expect(formatScopeLabel()).toBe('全局权限');
    expect(formatScopeLabel('activity_type', 12)).toBe('活动类型 #12');
    expect(formatScopeLabel('activity', 8)).toBe('活动 #8');
  });

  it('groups permissions by resource', () => {
    const grouped = groupPermissionsByResource([
      { resource: 'activity', code: 'activity.create' },
      { resource: 'activity', code: 'activity.edit' },
      { resource: 'user', code: 'user.view' },
    ]);

    expect(grouped.activity).toHaveLength(2);
    expect(grouped.user[0].code).toBe('user.view');
  });
});
