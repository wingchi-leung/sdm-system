import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { formatDateTime } from '../lib/admin';
import { formatScopeLabel, groupPermissionsByResource, UserRoleItem } from '../lib/rbac';
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

interface PermissionItem {
  id: number;
  code: string;
  name: string;
  resource: string;
  action: string;
}

interface RoleItem {
  id: number;
  tenant_id: number;
  name: string;
  is_system: number;
  description?: string | null;
  permissions: PermissionItem[];
}

interface AdminUserItem {
  id: number;
  name?: string | null;
  phone?: string | null;
  create_time?: string;
}

const PermissionsPage = () => {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [userRoles, setUserRoles] = useState<Record<number, UserRoleItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [scopeType, setScopeType] = useState<string>('global');
  const [scopeId, setScopeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetAssignForm = useCallback(() => {
    setSelectedUserId('');
    setSelectedRoleId('');
    setScopeType('global');
    setScopeId('');
  }, []);

  const handleAssignDialogChange = useCallback((open: boolean) => {
    setAssignDialogOpen(open);
    if (!open) {
      resetAssignForm();
    }
  }, [resetAssignForm]);

  const fetchPageData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [rolesRes, permissionsRes, usersRes] = await Promise.all([
        apiRequest<RoleItem[]>(API_PATHS.roles.list),
        apiRequest<PermissionItem[]>(API_PATHS.roles.permissions),
        apiRequest<AdminUserItem[]>(API_PATHS.users.list),
      ]);

      if (rolesRes.error) {
        throw new Error(rolesRes.error);
      }
      if (permissionsRes.error) {
        throw new Error(permissionsRes.error);
      }
      if (usersRes.error) {
        throw new Error(usersRes.error);
      }

      const fetchedUsers = usersRes.data ?? [];
      setRoles(rolesRes.data ?? []);
      setPermissions(permissionsRes.data ?? []);
      setUsers(fetchedUsers);

      const roleResults = await Promise.all(
        fetchedUsers.map(async (user) => {
          const response = await apiRequest<UserRoleItem[]>(API_PATHS.roles.userRoleDetail(user.id));
          return {
            userId: user.id,
            roles: response.data ?? [],
            error: response.error,
          };
        }),
      );

      const nextUserRoles: Record<number, UserRoleItem[]> = {};
      for (const item of roleResults) {
        if (item.error) {
          throw new Error(item.error);
        }
        nextUserRoles[item.userId] = item.roles;
      }
      setUserRoles(nextUserRoles);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '权限页面加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  const filteredUsers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return users;
    }

    return users.filter((user) => (
      (user.name || '').toLowerCase().includes(normalizedKeyword)
      || (user.phone || '').toLowerCase().includes(normalizedKeyword)
      || String(user.id).includes(normalizedKeyword)
    ));
  }, [keyword, users]);

  const groupedPermissions = useMemo(() => groupPermissionsByResource(permissions), [permissions]);

  const handleAssignRole = async () => {
    if (!selectedUserId || !selectedRoleId) {
      setError('请选择用户和角色');
      return;
    }
    if (scopeType !== 'global' && !scopeId.trim()) {
      setError('请输入有效的 scope ID');
      return;
    }
    if (scopeType !== 'global' && Number.isNaN(Number(scopeId.trim()))) {
      setError('scope ID 必须是数字');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: {
        user_id: number;
        role_id: number;
        scope_type?: string | null;
        scope_id?: number | null;
      } = {
        user_id: Number(selectedUserId),
        role_id: Number(selectedRoleId),
      };

      if (scopeType !== 'global') {
        payload.scope_type = scopeType;
        payload.scope_id = Number(scopeId.trim());
      }

      const response = await apiRequest<UserRoleItem>(API_PATHS.roles.userRoles, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      handleAssignDialogChange(false);
      await fetchPageData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '分配角色失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveRole = async (userRoleId: number) => {
    try {
      const response = await apiRequest(API_PATHS.roles.deleteUserRole(userRoleId), {
        method: 'DELETE',
      });

      if (response.error) {
        throw new Error(response.error);
      }

      await fetchPageData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '移除角色失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">权限与管理员</h1>
          <p className="mt-2 text-sm text-slate-600">
            当前先打通 RBAC 可视化核心链路：角色、权限、用户角色分配与 scope 展示。
          </p>
        </div>
        <Button onClick={() => handleAssignDialogChange(true)}>
          <Plus className="h-4 w-4" />
          分配角色
        </Button>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="bg-white/90">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl">管理员角色分配</CardTitle>
              <p className="mt-1 text-sm text-slate-500">按用户查看当前角色、权限范围和移除操作。</p>
            </div>
            <div className="w-full max-w-xs">
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索姓名 / 手机号 / 用户 ID"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>管理员/用户</TableHead>
                  <TableHead>当前角色</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在加载权限数据...
                      </span>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-slate-500">
                      暂无可展示的用户
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const assignments = userRoles[user.id] ?? [];
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{user.name || `用户 #${user.id}`}</p>
                            <p className="mt-1 text-xs text-slate-500">{user.phone || `ID: ${user.id}`}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {assignments.length === 0 ? (
                            <span className="text-sm text-slate-400">未分配角色</span>
                          ) : (
                            <div className="space-y-2">
                              {assignments.map((item) => (
                                <div key={item.id} className="rounded-xl bg-slate-50 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-slate-900">{item.role_name}</p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {formatScopeLabel(item.scope_type, item.scope_id)}
                                      </p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                      onClick={() => handleRemoveRole(item.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{formatDateTime(user.create_time)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(String(user.id));
                              setAssignDialogOpen(true);
                              setSelectedRoleId('');
                              setScopeType('global');
                              setScopeId('');
                            }}
                          >
                            追加角色
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                角色列表
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {roles.map((role) => (
                <div key={role.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{role.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{role.description || '暂无描述'}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                      {role.is_system === 1 ? '系统角色' : '自定义角色'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {role.permissions.length === 0 ? (
                      <span className="text-xs text-slate-400">暂无权限</span>
                    ) : (
                      role.permissions.map((permission) => (
                        <span key={permission.id} className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                          {permission.code}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5 text-sky-600" />
                权限清单
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(groupedPermissions).map(([resource, items]) => (
                <div key={resource} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-700">{resource}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {items.map((permission) => (
                      <span key={permission.id} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                        {permission.code}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={assignDialogOpen} onOpenChange={handleAssignDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>分配角色</DialogTitle>
            <DialogDescription>支持全局、活动类型和单活动三个 scope 维度。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-600">用户</label>
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">请选择用户</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {(user.name || `用户 #${user.id}`)} {user.phone ? `· ${user.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">角色</label>
              <select
                value={selectedRoleId}
                onChange={(event) => setSelectedRoleId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">请选择角色</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">权限范围</label>
              <select
                value={scopeType}
                onChange={(event) => setScopeType(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="global">全局</option>
                <option value="activity_type">活动类型</option>
                <option value="activity">单活动</option>
              </select>
            </div>
            {scopeType !== 'global' ? (
              <div>
                <label className="mb-1 block text-sm text-slate-600">Scope ID</label>
                <Input
                  value={scopeId}
                  onChange={(event) => setScopeId(event.target.value)}
                  placeholder={scopeType === 'activity_type' ? '请输入活动类型 ID' : '请输入活动 ID'}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleAssignDialogChange(false)}>
              取消
            </Button>
            <Button onClick={handleAssignRole} disabled={submitting}>
              {submitting ? '提交中...' : '确认分配'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PermissionsPage;
