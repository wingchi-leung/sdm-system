import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Download, Edit, Eye, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { formatCurrency, formatDateTime, getActivityStatusLabel } from '../lib/admin';
import { getIsSuperAdmin, isPlatformAdmin } from '../lib/auth';
import { ActivityExportResponse, exportActivitiesWorkbook } from '../lib/activity-export';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
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

interface ActivityItem {
  id: number;
  activity_name: string;
  activity_type_name?: string | null;
  start_time: string;
  end_time?: string | null;
  status: number;
  tag?: string | null;
  suggested_fee: number;
  require_payment: number;
  location?: string | null;
  max_participants?: number | null;
  create_time: string;
  update_time: string;
}

interface ActivityListResponse {
  items: ActivityItem[];
  total: number;
}

const pageSize = 10;

const ActivityList = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [selectedActivities, setSelectedActivities] = useState<Record<number, ActivityItem>>({});
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();
  const exportEnabled = useMemo(() => getIsSuperAdmin() || isPlatformAdmin(), []);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const statusQuery = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      const skip = (currentPage - 1) * pageSize;
      const response = await apiRequest<ActivityListResponse>(
        `${API_PATHS.activities.list}?skip=${skip}&limit=${pageSize}${statusQuery}`,
      );

      if (response.error) {
        throw new Error(response.error);
      }

      setActivities(response.data?.items ?? []);
      setTotal(response.data?.total ?? 0);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '活动列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const filteredActivities = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return activities;
    }

    return activities.filter((item) => (
      item.activity_name.toLowerCase().includes(normalizedKeyword)
      || (item.activity_type_name || '').toLowerCase().includes(normalizedKeyword)
      || (item.location || '').toLowerCase().includes(normalizedKeyword)
    ));
  }, [activities, keyword]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedActivityIds = useMemo(
    () => Object.keys(selectedActivities).map((value) => Number(value)),
    [selectedActivities],
  );
  const allVisibleSelected = filteredActivities.length > 0
    && filteredActivities.every((item) => selectedActivities[item.id]);

  const toggleActivitySelection = (activity: ActivityItem, checked: boolean) => {
    setSelectedActivities((previous) => {
      const next = { ...previous };
      if (checked) {
        next[activity.id] = activity;
      } else {
        delete next[activity.id];
      }
      return next;
    });
  };

  const handleToggleVisibleActivities = (checked: boolean) => {
    setSelectedActivities((previous) => {
      const next = { ...previous };
      filteredActivities.forEach((activity) => {
        if (checked) {
          next[activity.id] = activity;
        } else {
          delete next[activity.id];
        }
      });
      return next;
    });
  };

  const handleDeleteConfirm = async () => {
    if (!selectedActivityId) {
      return;
    }

    try {
      const response = await apiRequest(API_PATHS.activities.delete(selectedActivityId), {
        method: 'DELETE',
      });

      if (response.error) {
        throw new Error(response.error);
      }

      setDeleteDialogOpen(false);
      setSelectedActivityId(null);
      fetchActivities();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除活动失败');
    }
  };

  const handleStatusChange = async (activityId: number, nextStatus: number) => {
    try {
      const response = await apiRequest(API_PATHS.activities.updateStatus(activityId, nextStatus), {
        method: 'PUT',
      });

      if (response.error) {
        throw new Error(response.error);
      }

      fetchActivities();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '更新活动状态失败');
    }
  };

  const handleExport = async () => {
    if (selectedActivityIds.length === 0) {
      setError('请先选择至少一个活动后再导出');
      return;
    }

    setExporting(true);
    setError(null);

    try {
      const response = await apiRequest<ActivityExportResponse>(API_PATHS.activities.export, {
        method: 'POST',
        body: JSON.stringify({ activity_ids: selectedActivityIds }),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.data) {
        throw new Error('导出数据为空，请稍后重试');
      }

      await exportActivitiesWorkbook(response.data);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">活动管理</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">管理所有活动、状态和报名信息</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={fetchActivities} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          {exportEnabled ? (
            <Button variant="outline" onClick={handleExport} disabled={exporting || selectedActivityIds.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              {exporting ? '导出中...' : `导出 Excel${selectedActivityIds.length > 0 ? `（${selectedActivityIds.length}）` : ''}`}
            </Button>
          ) : null}
          <Button asChild className="gap-2">
            <Link to="/activities/create">
              <Plus className="h-4 w-4" />
              创建活动
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Card */}
      <Card className="border-border/60 bg-white shadow-md">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between pb-4">
          <div>
            <CardTitle className="text-xl">活动列表</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              支持按状态筛选、分页查看和快捷进入详情。
              {exportEnabled ? ` 已选 ${selectedActivityIds.length} 个活动，可一键导出多 Sheet Excel。` : ''}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">搜索</label>
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="活动名称 / 类型 / 地点"
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">活动状态</label>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setCurrentPage(1);
                  setStatusFilter(event.target.value);
                }}
                className="flex h-11 w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm"
              >
                <option value="all">全部状态</option>
                <option value="1">未开始</option>
                <option value="2">进行中</option>
                <option value="3">已结束</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {/* Error Message */}
          {error ? (
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 border border-red-200">{error}</div>
          ) : null}

          {/* Selection Banner */}
          {exportEnabled && selectedActivityIds.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-foreground">
                <span className="font-semibold">{selectedActivityIds.length}</span> 个活动已选择
                {selectedActivityIds.length <= 3
                  ? `：${selectedActivityIds.map((id) => selectedActivities[id]?.activity_name).filter(Boolean).join('、')}`
                  : '。导出后每个活动会生成一个独立 Sheet。'}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedActivities({})}
                className="text-muted-foreground hover:text-foreground"
              >
                清空选择
              </Button>
            </div>
          ) : null}

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                {exportEnabled ? (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => handleToggleVisibleActivities(checked === true)}
                      aria-label="选择当前页全部活动"
                    />
                  </TableHead>
                ) : null}
                <TableHead>活动名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>地点</TableHead>
                <TableHead>费用</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={exportEnabled ? 8 : 7} className="py-16 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      活动加载中...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredActivities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={exportEnabled ? 8 : 7} className="py-16 text-center text-muted-foreground">
                    当前条件下暂无活动
                  </TableCell>
                </TableRow>
              ) : (
                filteredActivities.map((activity) => (
                  <TableRow key={activity.id}>
                    {exportEnabled ? (
                      <TableCell>
                        <Checkbox
                          checked={Boolean(selectedActivities[activity.id])}
                          onCheckedChange={(checked) => toggleActivitySelection(activity, checked === true)}
                          aria-label={`选择活动 ${activity.activity_name}`}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div>
                        <button
                          type="button"
                          className="font-semibold text-foreground hover:text-primary transition-colors"
                          onClick={() => navigate(`/activities/${activity.id}`)}
                        >
                          {activity.activity_name}
                        </button>
                        {activity.tag ? <p className="mt-1 text-xs text-muted-foreground">{activity.tag}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{activity.activity_type_name || '未分类'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4 text-slate-400" />
                        <span>{formatDateTime(activity.start_time)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{activity.location || '未设置'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {activity.require_payment === 1 ? formatCurrency(activity.suggested_fee) : '免费'}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {getActivityStatusLabel(activity.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/activities/${activity.id}`)} className="gap-1.5 text-muted-foreground hover:text-foreground">
                          <Eye className="h-4 w-4" />
                          详情
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/activities/${activity.id}/participants`)} className="gap-1.5 text-muted-foreground hover:text-foreground">
                          <Users className="h-4 w-4" />
                          报名
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/activities/edit/${activity.id}`)} className="gap-1.5 text-muted-foreground hover:text-foreground">
                          <Edit className="h-4 w-4" />
                          编辑
                        </Button>
                        {activity.status < 3 ? (
                          <Button variant="ghost" size="sm" onClick={() => handleStatusChange(activity.id, activity.status + 1)} className="gap-1.5 text-muted-foreground hover:text-foreground">
                            流转
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => {
                            setSelectedActivityId(activity.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex flex-col gap-3 border-t border-border/50 pt-4 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between">
            <div>共 {total} 条记录，当前第 {currentPage} / {totalPages} 页</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => page - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>确认删除活动</DialogTitle>
            <DialogDescription>
              删除后将无法恢复，关联报名记录也会一起受影响，请确认是否继续。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ActivityList;