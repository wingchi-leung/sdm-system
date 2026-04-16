import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, RefreshCw, Search, ShieldAlert, UserPlus } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { formatDateTime } from '../lib/admin';
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

interface UserItem {
  id: number;
  tenant_id?: number;
  name?: string | null;
  identity_number?: string | null;
  identity_type?: string | null;
  phone?: string | null;
  email?: string | null;
  sex?: string | null;
  age?: number | null;
  occupation?: string | null;
  industry?: string | null;
  isblock: number;
  block_reason?: string | null;
  create_time?: string;
  update_time?: string;
}

interface UserAdminListResponse {
  items: UserItem[];
  total: number;
  skip: number;
  limit: number;
}

interface UserFormData {
  name: string;
  identity_number: string;
  identity_type: string;
  phone: string;
  email: string;
  sex: string;
}

const emptyFormData: UserFormData = {
  name: '',
  identity_number: '',
  identity_type: 'mainland',
  phone: '',
  email: '',
  sex: 'M',
};

const pageSize = 10;

const UserManagement = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyFormData);
  const [blockReason, setBlockReason] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const skip = (currentPage - 1) * pageSize;
      const keywordQuery = keyword.trim() ? `&keyword=${encodeURIComponent(keyword.trim())}` : '';
      const response = await apiRequest<UserAdminListResponse>(
        `${API_PATHS.users.adminAll}?skip=${skip}&limit=${pageSize}${keywordQuery}`,
      );

      if (response.error) {
        throw new Error(response.error);
      }

      setUsers(response.data?.items ?? []);
      setTotal(response.data?.total ?? 0);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '用户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [currentPage, keyword]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    if (statusFilter === 'all') {
      return users;
    }
    if (statusFilter === 'blocked') {
      return users.filter((item) => item.isblock === 1);
    }
    return users.filter((item) => item.isblock === 0);
  }, [users, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleCreateUser = async () => {
    try {
      const response = await apiRequest<UserItem>(API_PATHS.users.create, {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          name: formData.name.trim(),
          identity_number: formData.identity_number.trim() || null,
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
        }),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setAddDialogOpen(false);
      setFormData(emptyFormData);
      fetchUsers();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建用户失败');
    }
  };

  const handleBlockUser = async () => {
    if (!selectedUser) {
      return;
    }

    try {
      const response = await apiRequest<UserItem>(API_PATHS.users.block(selectedUser.id), {
        method: 'POST',
        body: JSON.stringify({ reason: blockReason.trim() || null }),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setBlockDialogOpen(false);
      setBlockReason('');
      setSelectedUser(null);
      fetchUsers();
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : '拉黑用户失败');
    }
  };

  const handleUnblockUser = async (userId: number) => {
    try {
      const response = await apiRequest<UserItem>(API_PATHS.users.unblock(userId), {
        method: 'POST',
      });

      if (response.error) {
        throw new Error(response.error);
      }

      fetchUsers();
    } catch (unblockError) {
      setError(unblockError instanceof Error ? unblockError.message : '解除拉黑失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">用户管理</h1>
          <p className="mt-2 text-sm text-slate-600">
            本轮先将用户列表、搜索、拉黑治理和详情查看收敛到 Web 端。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={fetchUsers}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button onClick={() => setAddDialogOpen(true)}>
            <UserPlus className="h-4 w-4" />
            添加用户
          </Button>
        </div>
      </div>

      <Card className="bg-white/90">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-xl">用户列表</CardTitle>
            <p className="mt-1 text-sm text-slate-500">支持搜索、分页与黑名单状态治理。</p>
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
            <div>
              <label className="mb-1 block text-sm text-slate-600">状态</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">全部用户</option>
                <option value="active">正常用户</option>
                <option value="blocked">黑名单</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>手机号</TableHead>
                <TableHead>性别</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                    用户加载中...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                    当前条件下暂无用户
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{user.name || `用户 #${user.id}`}</p>
                        {user.block_reason ? <p className="mt-1 text-xs text-rose-600">原因：{user.block_reason}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell>{user.phone || '未填写'}</TableCell>
                    <TableCell>{user.sex === 'M' ? '男' : user.sex === 'F' ? '女' : '未填写'}</TableCell>
                    <TableCell>
                      {user.isblock === 1 ? (
                        <span className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-700">黑名单</span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">正常</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(user.create_time)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setDetailDialogOpen(true);
                          }}
                        >
                          详情
                        </Button>
                        {user.isblock === 1 ? (
                          <Button variant="outline" size="sm" onClick={() => handleUnblockUser(user.id)}>
                            解除拉黑
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => {
                              setSelectedUser(user);
                              setBlockDialogOpen(true);
                            }}
                          >
                            <Ban className="h-4 w-4" />
                            拉黑
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t pt-4 text-sm text-slate-500 lg:flex-row lg:items-center lg:justify-between">
            <div>共 {total} 条记录，当前第 {currentPage} / {totalPages} 页</div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => page - 1)}>
                上一页
              </Button>
              <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((page) => page + 1)}>
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
            <DialogDescription>创建租户内新用户，后续可继续补充更完整的字段。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-600">姓名</label>
              <Input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">手机号</label>
              <Input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">邮箱</label>
              <Input value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-slate-600">证件类型</label>
                <select
                  value={formData.identity_type}
                  onChange={(event) => setFormData({ ...formData, identity_type: event.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="mainland">大陆身份证</option>
                  <option value="hongkong">香港证件</option>
                  <option value="taiwan">台湾证件</option>
                  <option value="foreign">其他证件</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600">性别</label>
                <select
                  value={formData.sex}
                  onChange={(event) => setFormData({ ...formData, sex: event.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="M">男</option>
                  <option value="F">女</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">证件号码</label>
              <Input
                value={formData.identity_number}
                onChange={(event) => setFormData({ ...formData, identity_number: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button onClick={handleCreateUser}>创建用户</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>用户详情</DialogTitle>
          </DialogHeader>
          {selectedUser ? (
            <div className="grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">姓名</p>
                <p className="mt-1 font-medium text-slate-900">{selectedUser.name || '-'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">手机号</p>
                <p className="mt-1 text-slate-900">{selectedUser.phone || '-'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">邮箱 / 行业 / 职业</p>
                <p className="mt-1 text-slate-900">
                  {selectedUser.email || '未填写'} / {selectedUser.industry || '未填写'} / {selectedUser.occupation || '未填写'}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">风险提示</p>
                <p className="mt-1 flex items-center gap-2 text-slate-900">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  {selectedUser.isblock === 1 ? `已拉黑：${selectedUser.block_reason || '未填写原因'}` : '当前状态正常'}
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拉黑用户</DialogTitle>
            <DialogDescription>请填写拉黑原因，便于后续审计与解除操作。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block text-sm text-slate-600">拉黑原因</label>
            <textarea
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="请输入拉黑原因"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleBlockUser}>确认拉黑</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
