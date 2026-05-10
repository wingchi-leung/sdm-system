import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Unlink, Users, RefreshCw, Search } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
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
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (currentPage - 1) * pageSize;
      const keywordQuery = keyword.trim() ? `&keyword=${encodeURIComponent(keyword.trim())}` : '';
      const response = await apiRequest<{ items: UserItem[]; total: number }>(
        `${API_PATHS.users.adminAll}?skip=${skip}&limit=${pageSize}${keywordQuery}`,
      );
      if (response.data) {
        setUsers(response.data.items);
      }
    } catch {
      toast({ title: '获取用户列表失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentPage, keyword, toast]);

  const fetchActivityTypes = useCallback(async () => {
    try {
      const response = await apiRequest<ActivityTypeItem[]>(API_PATHS.activityTypes.list);
      if (response.data) {
        setActivityTypes(response.data);
      }
    } catch {
      toast({ title: '获取活动类型失败', variant: 'destructive' });
    }
  }, [toast]);

  const fetchUserActivityTypes = useCallback(async (userIds: number[]) => {
    if (userIds.length === 0) return;
    try {
      const promises = userIds.map(userId =>
        apiRequest<UserActivityTypeItem[]>(API_PATHS.userActivityTypes.listByUser(userId))
      );
      const results = await Promise.all(promises);
      const newMap = new Map<number, number[]>();
      results.forEach((res, index) => {
        if (res.data) {
          const typeIds = res.data.map(item => item.activity_type_id);
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

  const openBindDialog = (user: UserItem) => {
    setSelectedUser(user);
    setSelectedTypes(userActivityTypes.get(user.id) || []);
    setBindDialogOpen(true);
  };

  const handleBindTypes = async () => {
    if (!selectedUser) return;
    try {
      await apiRequest(API_PATHS.userActivityTypes.bind, {
        method: 'POST',
        body: JSON.stringify({
          user_id: selectedUser.id,
          activity_type_ids: selectedTypes,
        }),
      });
      toast({ title: '绑定成功', className: 'bg-green-50 text-green-700' });
      setBindDialogOpen(false);
      fetchUserActivityTypes([selectedUser.id]);
    } catch (err) {
      toast({ title: '绑定失败', description: String(err), variant: 'destructive' });
    }
  };

  const handleUnbindType = async (userId: number, typeId: number) => {
    try {
      await apiRequest(API_PATHS.userActivityTypes.unbind(userId, typeId), {
        method: 'DELETE',
      });
      toast({ title: '解除绑定成功', className: 'bg-green-50 text-green-700' });
      fetchUserActivityTypes([userId]);
    } catch {
      toast({ title: '解除绑定失败', variant: 'destructive' });
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
                <TableHead>用户</TableHead>
                <TableHead>手机号</TableHead>
                <TableHead>已分配活动类型</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-slate-500">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-slate-500">
                    暂无用户
                  </TableCell>
                </TableRow>
              ) : (
                users.map(user => {
                  const userTypes = getUserTypeNames(user.id);
                  return (
                    <TableRow key={user.id}>
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
                          <Button variant="outline" size="sm" onClick={() => openBindDialog(user)}>
                            <Link2 className="h-4 w-4" />
                            分配类型
                          </Button>
                          {userTypes.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                const typeId = userActivityTypes.get(user.id)?.[0];
                                if (typeId) handleUnbindType(user.id, typeId);
                              }}
                            >
                              <Unlink className="h-4 w-4" />
                              解除
                            </Button>
                          )}
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
            <DialogTitle>分配活动类型</DialogTitle>
            <DialogDescription>
              为用户「{selectedUser?.name || selectedUser?.id}」分配活动类型
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
            <Button onClick={handleBindTypes} disabled={selectedTypes.length === 0}>
              确认绑定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserActivityTypeManagement;