import { buildTenantPayload, getTenantStatusLabel } from './TenantManagementPage';

describe('TenantManagementPage helpers', () => {
  test('getTenantStatusLabel 区分正常、禁用和到期租户', () => {
    const now = new Date('2026-04-21T10:00:00+08:00');

    expect(getTenantStatusLabel({ status: 1, expire_at: null }, now)).toBe('正常');
    expect(getTenantStatusLabel({ status: 0, expire_at: null }, now)).toBe('已禁用');
    expect(getTenantStatusLabel({ status: 1, expire_at: '2026-04-20T10:00:00+08:00' }, now)).toBe('已到期');
  });

  test('buildTenantPayload 规范化租户表单并校验容量字段', () => {
    expect(buildTenantPayload({
      name: ' 华东中心 ',
      code: ' EAST ',
      plan: '',
      max_admins: '8',
      max_activities: '200',
      expire_at: '',
      contact_name: ' 李四 ',
      contact_phone: ' 13800138100 ',
    })).toEqual({
      name: '华东中心',
      code: 'east',
      plan: 'basic',
      max_admins: 8,
      max_activities: 200,
      expire_at: null,
      contact_name: '李四',
      contact_phone: '13800138100',
    });
  });

  test('buildTenantPayload 拒绝非法容量', () => {
    expect(() => buildTenantPayload({
      name: '测试租户',
      code: 'test',
      plan: 'basic',
      max_admins: '-1',
      max_activities: '100',
      expire_at: '',
      contact_name: '',
      contact_phone: '',
    })).toThrow('最大管理员数必须是非负整数');
  });
});
