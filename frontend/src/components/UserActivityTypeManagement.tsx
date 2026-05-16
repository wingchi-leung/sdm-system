import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, RefreshCw, Search } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { buildTypeSyncPlan, extractUserActivityTypeIds } from '../lib/user-activity-types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { useToast } from '../hooks/use-toast';

interface UserItem {
  id: number;
  name?: string | null;
  phone?: string | null;
}

interface ActivityTypeItem {
  id: number;
  type_name: string;
}

interface UserActivityTypeItem {
  id: number;
  user_id: number;
  activity_type_id: number;
  tenant_id: number;
  create_time?: string;
}

interface UserActivityTypeListResponse {
  items: UserActivityTypeItem[];
  total: number;
}

const pageSize = 20;

const UserActivityTypeManagement = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityTypeItem[]>([]);
  const [userActivityTypes, setUserActivityTypes] = useState<Map<number, number[]>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (currentPage - 1) * pageSize;
      const keywordQuery = keyword.trim() ? `&keyword=${encodeURIComponent(keyword.trim())}` : '';
      const response = await apiRequest<{ items: UserItem[]; total: number }>(
        `${API_PATHS.users.adminAll}?skip=${skip}&limit=${pageSize}${keywordQuery}`,
      );
      if (response.error) {
        throw new Error(response.error);
      }
      if (response.data) {
        setUsers(response.data.items);
        setSelectedUserIds([]);
      }
    } catch (error) {
      toast({ title: '获取用户列表失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentPage, keyword, toast]);

  const fetchActivityTypes = useCallback(async () => {
    try {
      const response = await apiRequest<ActivityTypeItem[]>(API_PATHS.activityTypes.list);
      if (response.error) {
        throw new Error(response.error);
      }
      if (response.data) {
        setActivityTypes(response.data);
      }
    } catch (error) {
      toast({ title: '获取活动类型失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' });
    }
  }, [toast]);

  const fetchUserActivityTypes = useCallback(async (userIds: number[]) => {
    if (userIds.length === 0) return;
    try {
      const promises = userIds.map(userId =>
        apiRequest<UserActivityTypeListResponse>(API_PATHS.userActivityTypes.listByUser(userId))
      );
      const results = await Promise.all(promises);
      const newMap = new Map<number, number[]>();
      results.forEach((res, index) => {
        if (!res.error && res.data) {
          const typeIds = extractUserActivityTypeIds(res.data);
          newMap.set(userIds[index], typeIds);
        }
      });
      setUserActivityTypes(prev => {
        const merged = new Map(prev);
        newMap.forEach((v, k) => merged.set(k, v));
        return merged;
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchActivityTypes();
  }, [fetchUsers, fetchActivityTypes]);

  useEffect(() => {
    if (users.length > 0) {
      fetchUserActivityTypes(users.map(u => u.id));
    }
  }, [users, fetchUserActivityTypes]);

  const openBindDialog = (user: UserItem | null, userIds: number[]) => {
    setSelectedUser(user);
    setSelectedUserIds(userIds);
    if (userIds.length === 1) {
      setSelectedTypes(userActivityTypes.get(userIds[0]) || []);
    } else {
      setSelectedTypes([]);
    }
    setBindDialogOpen(true);
  };

  const syncUserTypes = useCallback(async (userId: number, nextTypeIds: number[]) => {
    const currentTypeIds = userActivityTypes.get(userId) || [];
    const { toAdd, toRemove } = buildTypeSyncPlan(currentTypeIds, nextTypeIds);

    if (toAdd.length > 0) {
      const bindRes = await apiRequest(API_PATHS.userActivityTypes.bind, {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          activity_type_ids: toAdd,
        }),
      });
      if (bindRes.error) {
        throw new Error(bindRes.error);
      }
    }

    if (toRemove.length > 0) {
      const unbindRes = await apiRequest(API_PATHS.userActivityTypes.unbindBatch, {
        method: 'DELETE',
        body: JSON.stringify({
          user_id: userId,
          activity_type_ids: toRemove,
        }),
      });
      if (unbindRes.error) {
        throw new Error(unbindRes.error);
      }
    }
  }, [userActivityTypes]);

  const handleBindTypes = async () => {
    if (selectedUserIds.length === 0) return;
    setSubmitting(true);
    try {
      await Promise.all(selectedUserIds.map((userId) => syncUserTypes(userId, selectedTypes)));
      toast({ title: selectedUserIds.length > 1 ? '批量分配成功' : '分配成功', className: 'bg-green-50 text-green-700' });
      setBindDialogOpen(false);
      setSelectedUser(null);
      setSelectedUserIds([]);
      await fetchUserActivityTypes(users.map((u) => u.id));
    } catch (err) {
      toast({ title: '分配失败', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTypeSelection = (typeId: number) => {
    setSelectedTypes(prev =>
      prev.includes(typeId) ? prev.filter(id => id !== typeId) : [...prev, typeId]
    );
  };

  const getUserTypeNames = (userId: number): string[] => {
    const typeIds = userActivityTypes.get(userId) || [];
    return typeIds.map(id => activityTypes.find(t => t.id === id)?.type_name || `类型#${id}`);
  };

  const allCurrentPageSelected = useMemo(() => {
    return users.length > 0 && users.every((user) => selectedUserIds.includes(user.id));
  }, [users, selectedUserIds]);

  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds((prev) => (
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    ));
  };

  const toggleSelectAllCurrentPage = () => {
    if (allCurrentPageSelected) {
      setSelectedUserIds([]);
      return;
    }
    setSelectedUserIds(users.map((user) => user.id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">用户活动类型分配</h1>
          <p className="mt-2 text-sm text-slate-600">
            分配用户到特定活动类型，用户只能看到公开活动及其所属类型的活动。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => openBindDialog(null, selectedUserIds)}
            disabled={selectedUserIds.length === 0}
          >
            <Link2 className="h-4 w-4" />
            批量分配（{selectedUserIds.length}）
          </Button>
          <Button variant="outline" onClick={fetchUsers}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      <Card className="bg-white/90">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-xl">用户列表</CardTitle>
            <p className="mt-1 text-sm text-slate-500">选择用户分配活动类型</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-slate-600">搜索</label>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setCurrentPage(1);
                      fetchUsers();
                    }
                  }}
                  className="pl-9"
                  placeholder="姓名 / 手机号"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">
                  <input type="checkbox" checked={allCurrentPageSelected} onChange={toggleSelectAllCurrentPage} />
                </TableHead>
                <TableHead>用户</TableHead>
                <TableHead>手机号</TableHead>
                <TableHead>已分配活动类型</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-slate-500">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-slate-500">
                    暂无用户
                  </TableCell>
                </TableRow>
              ) : (
                users.map(user => {
                  const userTypes = getUserTypeNames(user.id);
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-900">{user.name || `用户 #${user.id}`}</p>
                      </TableCell>
                      <TableCell>{user.phone || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {userTypes.length === 0 ? (
                            <span className="text-slate-400 text-sm">未分配</span>
                          ) : (
                            userTypes.map((name, idx) => (
                              <span key={idx} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                {name}
                              </span>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openBindDialog(user, [user.id])}>
                            <Link2 className="h-4 w-4" />
                            分配类型
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t pt-4 text-sm text-slate-500 lg:flex-row lg:items-center lg:justify-between">
            <div>共 {users.length} 条记录</div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                上一页
              </Button>
              <Button variant="outline" onClick={() => setCurrentPage(p => p + 1)}>
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={bindDialogOpen} onOpenChange={setBindDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedUserIds.length > 1 ? '批量分配活动类型' : '分配活动类型'}</DialogTitle>
            <DialogDescription>
              {selectedUserIds.length > 1
                ? `为 ${selectedUserIds.length} 个用户批量分配活动类型`
                : `为用户「${selectedUser?.name || selectedUser?.id}」分配活动类型`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block text-sm text-slate-600">选择活动类型</label>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {activityTypes.map(type => (
                <label key={type.id} className="flex items-center gap-2 rounded-lg border p-3 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type.id)}
                    onChange={() => toggleTypeSelection(type.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{type.type_name}</span>
                </label>
              ))}
            </div>
            {activityTypes.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">暂无可选活动类型</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBindDialogOpen(false)}>取消</Button>
            <Button onClick={handleBindTypes} disabled={submitting}>
              {submitting ? '提交中...' : '确认分配'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserActivityTypeManagement;
