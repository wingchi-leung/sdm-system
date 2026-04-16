export interface UserRoleItem {
  id: number;
  user_id: number;
  role_id: number;
  role_name: string;
  scope_type?: string | null;
  scope_id?: number | null;
}

export function formatScopeLabel(scopeType?: string | null, scopeId?: number | null): string {
  if (!scopeType) {
    return '全局权限';
  }

  if (scopeId == null) {
    return `${scopeType} 范围`;
  }

  if (scopeType === 'activity_type') {
    return `活动类型 #${scopeId}`;
  }

  if (scopeType === 'activity') {
    return `活动 #${scopeId}`;
  }

  return `${scopeType} #${scopeId}`;
}

export function groupPermissionsByResource<T extends { resource: string; code: string }>(permissions: T[]) {
  return permissions.reduce<Record<string, T[]>>((groups, permission) => {
    const key = permission.resource || 'other';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(permission);
    return groups;
  }, {});
}
