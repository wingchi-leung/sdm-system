import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Edit, Eye, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { formatCurrency, formatDateTime, getActivityStatusLabel } from '../lib/admin';
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
  const navigate = useNavigate();

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">活动管理</h1>
          <p className="mt-2 text-sm text-slate-600">
            先补齐活动列表、详情聚合和状态流转，后续继续扩展批量操作与活动类型管理。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={fetchActivities}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button asChild>
            <Link to="/activities/create">
              <Plus className="h-4 w-4" />
              创建活动
            </Link>
          </Button>
        </div>
      </div>

      <Card className="bg-white/90">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-xl">活动列表</CardTitle>
            <p className="mt-1 text-sm text-slate-500">支持按状态筛选、分页查看和快捷进入详情。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-slate-600">搜索</label>
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="活动名称 / 类型 / 地点"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">活动状态</label>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setCurrentPage(1);
                  setStatusFilter(event.target.value);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">全部状态</option>
                <option value="1">未开始</option>
                <option value="2">进行中</option>
                <option value="3">已结束</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                    活动加载中...
                  </TableCell>
                </TableRow>
              ) : filteredActivities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                    当前条件下暂无活动
                  </TableCell>
                </TableRow>
              ) : (
                filteredActivities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell>
                      <div>
                        <button
                          type="button"
                          className="font-medium text-slate-900 hover:text-emerald-700"
                          onClick={() => navigate(`/activities/${activity.id}`)}
                        >
                          {activity.activity_name}
                        </button>
                        {activity.tag ? <p className="mt-1 text-xs text-slate-500">{activity.tag}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell>{activity.activity_type_name || '未分类'}</TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2 text-sm text-slate-600">
                        <CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" />
                        <span>{formatDateTime(activity.start_time)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{activity.location || '未设置'}</TableCell>
                    <TableCell>{activity.require_payment === 1 ? formatCurrency(activity.suggested_fee) : '免费'}</TableCell>
                    <TableCell>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {getActivityStatusLabel(activity.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/activities/${activity.id}`)}>
                          <Eye className="h-4 w-4" />
                          详情
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/activities/${activity.id}/participants`)}>
                          <Users className="h-4 w-4" />
                          报名
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate(`/activities/edit/${activity.id}`)}>
                          <Edit className="h-4 w-4" />
                          编辑
                        </Button>
                        {activity.status < 3 ? (
                          <Button variant="outline" size="sm" onClick={() => handleStatusChange(activity.id, activity.status + 1)}>
                            流转状态
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
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
