export interface UserActivityTypeRecord {
  activity_type_id: number;
}

export interface UserActivityTypeListPayload {
  items: UserActivityTypeRecord[];
  total: number;
}

export function extractUserActivityTypeIds(payload?: UserActivityTypeListPayload | null): number[] {
  if (!payload || !Array.isArray(payload.items)) {
    return [];
  }
  return payload.items.map((item) => item.activity_type_id);
}

export function buildTypeSyncPlan(currentTypeIds: number[], nextTypeIds: number[]): {
  toAdd: number[];
  toRemove: number[];
} {
  const currentSet = new Set(currentTypeIds);
  const nextSet = new Set(nextTypeIds);

  return {
    toAdd: nextTypeIds.filter((typeId) => !currentSet.has(typeId)),
    toRemove: currentTypeIds.filter((typeId) => !nextSet.has(typeId)),
  };
}
