import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { Toaster } from "./ui/toaster";
import { API_PATHS, apiRequest } from '../config/api';
import { useNavigate } from 'react-router-dom';
import { Edit, Trash2, Users } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface Activity {
  id: number;
  activity_name: string;
  start_time: string;
  end_time?: string;
  status: number;
  tag?: string;
  activity_type_id?: number;
  activity_type_name?: string;
  create_time: string;
  update_time: string;
}

interface ActivityListResponse {
  items: Activity[];
  total: number;
}

const ActivityList = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<number | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest<ActivityListResponse>(API_PATHS.activities.list);
      if (response.data) {
        setActivities(response.data.items);
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      toast({
        title: "获取活动列表失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (activityId: number) => {
    navigate(`/activities/edit/${activityId}`);
  };

  const handleViewParticipants = (activityId: number) => {
    navigate(`/activities/${activityId}/participants`);
  };

  const handleDeleteClick = (activityId: number) => {
    setActivityToDelete(activityId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activityToDelete) return;

    try {
      const response = await apiRequest(API_PATHS.activities.delete(activityToDelete), {
        method: 'DELETE',
      });

      if (response.error) {
        throw new Error(response.error);
      }

      toast({
        title: "删除成功",
        description: "活动已成功删除",
        className: "bg-green-50 text-green-700",
      });

      fetchActivities();
    } catch (error) {
      toast({
        title: "删除失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setActivityToDelete(null);
    }
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 1:
        return "未开始";
      case 2:
        return "进行中";
      case 3:
        return "已结束";
      default:
        return "未知";
    }
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 1:
        return "text-blue-600";
      case 2:
        return "text-green-600";
      case 3:
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <>
      <Toaster />
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-2xl">活动列表</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">加载中...</div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无活动</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>活动名称</TableHead>
                    <TableHead>开始时间</TableHead>
                    <TableHead>结束时间</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{activity.activity_name}</TableCell>
                      <TableCell>{formatDate(activity.start_time)}</TableCell>
                      <TableCell>{activity.end_time ? formatDate(activity.end_time) : '-'}</TableCell>
                      <TableCell>
                        <span className={getStatusColor(activity.status)}>
                          {getStatusText(activity.status)}
                        </span>
                      </TableCell>
                      <TableCell>{activity.tag || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewParticipants(activity.id)}
                          >
                            <Users className="h-4 w-4 mr-1" />
                            查看人员
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(activity.id)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            编辑
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(activity.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                确定要删除这个活动吗？此操作将同时删除该活动的所有报名人员信息，且无法撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                取消
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default ActivityList;