export interface UserRoleItem {
  id: number;
  user_id: number;
  role_id: number;
  role_name: string;
  scope_type?: string | null;
  scope_id?: number | null;
}

export interface ActivityTypeItem {
  id: number;
  type_name: string;
}

export function formatScopeLabel(
  scopeType?: string | null,
  scopeId?: number | null,
  activityTypes?: ActivityTypeItem[],
): string {
  if (!scopeType) {
    return '全局权限';
  }

  if (scopeId == null) {
    return `${scopeType} 范围`;
  }

  if (scopeType === 'activity_type') {
    if (activityTypes && activityTypes.length > 0) {
      const found = activityTypes.find((at) => at.id === scopeId);
      if (found) {
        return found.type_name;
      }
    }
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
