import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Plus, RefreshCw, Search, ShieldOff } from 'lucide-react';
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

interface TenantItem {
  id: number;
  name: string;
  code: string;
  status: number;
  plan: string;
  max_admins: number;
  max_activities: number;
  expire_at?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  create_time: string;
  update_time: string;
}

interface TenantSummary {
  total: number;
  active: number;
  disabled: number;
  expired: number;
}

interface TenantListResponse {
  items: TenantItem[];
  total: number;
  summary: TenantSummary;
}

interface TenantFormState {
  name: string;
  code: string;
  plan: string;
  max_admins: string;
  max_activities: string;
  expire_at: string;
  contact_name: string;
  contact_phone: string;
}

const emptyForm: TenantFormState = {
  name: '',
  code: '',
  plan: 'basic',
  max_admins: '5',
  max_activities: '100',
  expire_at: '',
  contact_name: '',
  contact_phone: '',
};

export function getTenantStatusLabel(tenant: Pick<TenantItem, 'status' | 'expire_at'>, now: Date = new Date()): string {
  if (tenant.status === 0) {
    return '已禁用';
  }
  if (tenant.expire_at && new Date(tenant.expire_at).getTime() < now.getTime()) {
    return '已到期';
  }
  return '正常';
}

export function buildTenantPayload(form: TenantFormState) {
  const maxAdmins = Number(form.max_admins);
  const maxActivities = Number(form.max_activities);
  if (!form.name.trim()) {
    throw new Error('请输入租户名称');
  }
  if (!form.code.trim()) {
    throw new Error('请输入租户编码');
  }
  if (!Number.isInteger(maxAdmins) || maxAdmins < 0) {
    throw new Error('最大管理员数必须是非负整数');
  }
  if (!Number.isInteger(maxActivities) || maxActivities < 0) {
    throw new Error('最大活动数必须是非负整数');
  }

  return {
    name: form.name.trim(),
    code: form.code.trim().toLowerCase(),
    plan: form.plan.trim() || 'basic',
    max_admins: maxAdmins,
    max_activities: maxActivities,
    expire_at: form.expire_at ? new Date(form.expire_at).toISOString() : null,
    contact_name: form.contact_name.trim() || null,
    contact_phone: form.contact_phone.trim() || null,
  };
}

const TenantManagementPage = () => {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [summary, setSummary] = useState<TenantSummary>({ total: 0, active: 0, disabled: 0, expired: 0 });
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TenantFormState>(emptyForm);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        skip: String((page - 1) * pageSize),
        limit: String(pageSize),
      });
      if (keyword.trim()) {
        params.set('keyword', keyword.trim());
      }
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await apiRequest<TenantListResponse>(`${API_PATHS.tenants.list}?${params.toString()}`);
      if (response.error) {
        throw new Error(response.error);
      }

      setTenants(response.data?.items ?? []);
      setTotal(response.data?.total ?? 0);
      setSummary(response.data?.summary ?? { total: 0, active: 0, disabled: 0, expired: 0 });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '租户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page, statusFilter]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const pageHint = useMemo(() => `第 ${page} / ${totalPages} 页，共 ${total} 个租户`, [page, total, totalPages]);

  const handleCreateTenant = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const payload = buildTenantPayload(form);
      const response = await apiRequest<TenantItem>(API_PATHS.tenants.create, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (response.error) {
        throw new Error(response.error);
      }

      setDialogOpen(false);
      setForm(emptyForm);
      setPage(1);
      await fetchTenants();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '创建租户失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (tenant: TenantItem) => {
    setError(null);
    try {
      const response = await apiRequest<TenantItem>(API_PATHS.tenants.update(tenant.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: tenant.status === 1 ? 0 : 1 }),
      });
      if (response.error) {
        throw new Error(response.error);
      }
      await fetchTenants();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '租户状态更新失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">租户管理</h1>
          <p className="mt-2 text-sm text-slate-600">
            面向平台管理员的跨租户治理入口，支持租户检索、容量查看、创建租户与启停控制。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={fetchTenants}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            新建租户
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">租户总数</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : summary.total}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">正常租户</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : summary.active}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">已禁用</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : summary.disabled}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">已到期</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : summary.expired}</p></CardContent></Card>
      </div>

      <Card className="bg-white/90">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Building2 className="h-5 w-5 text-emerald-600" />
              租户列表
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索名称 / 编码 / 联系人"
                  className="pl-9 sm:w-72"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">全部状态</option>
                <option value="1">正常</option>
                <option value="0">已禁用</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>租户</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>套餐与容量</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead>到期时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在加载租户数据...
                    </span>
                  </TableCell>
                </TableRow>
              ) : tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                    当前筛选条件下暂无租户
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{tenant.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{tenant.code}</p>
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-3 py-1 text-xs ${getTenantStatusLabel(tenant) === '正常' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {getTenantStatusLabel(tenant)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      <p>{tenant.plan || 'basic'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        管理员 {tenant.max_admins} / 活动 {tenant.max_activities}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      <p>{tenant.contact_name || '--'}</p>
                      <p className="mt-1 text-xs text-slate-500">{tenant.contact_phone || '--'}</p>
                    </TableCell>
                    <TableCell>{formatDateTime(tenant.expire_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(tenant)}
                        className={tenant.status === 1 ? 'text-amber-700' : 'text-emerald-700'}
                      >
                        {tenant.status === 1 ? (
                          <>
                            <ShieldOff className="h-4 w-4" />
                            禁用
                          </>
                        ) : '启用'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">{pageHint}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                上一页
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建租户</DialogTitle>
            <DialogDescription>租户编码创建后用于登录与公开访问入口，请使用稳定、可读的英文编码。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-slate-600">租户名称</label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">租户编码</label>
              <Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">套餐</label>
              <Input value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">到期时间</label>
              <Input type="datetime-local" value={form.expire_at} onChange={(event) => setForm({ ...form, expire_at: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">最大管理员数</label>
              <Input type="number" min={0} value={form.max_admins} onChange={(event) => setForm({ ...form, max_admins: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">最大活动数</label>
              <Input type="number" min={0} value={form.max_activities} onChange={(event) => setForm({ ...form, max_activities: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">联系人</label>
              <Input value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">联系电话</label>
              <Input value={form.contact_phone} onChange={(event) => setForm({ ...form, contact_phone: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateTenant} disabled={submitting}>
              {submitting ? '创建中...' : '确认创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantManagementPage;
