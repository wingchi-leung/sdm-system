import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { Toaster } from "./ui/toaster";
import { API_PATHS, apiRequest, getImageUrl } from '../config/api';
import { useNavigate } from 'react-router-dom';
import { Edit, Trash2, Users, MapPin, Calendar, Tag } from 'lucide-react';
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
  poster_url?: string;
  location?: string;
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

  const getStatusStyle = (status: number) => {
    switch (status) {
      case 1:
        return "bg-blue-100 text-blue-700 border-blue-200";
      case 2:
        return "bg-green-100 text-green-700 border-green-200";
      case 3:
        return "bg-gray-100 text-gray-600 border-gray-200";
      default:
        return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <Toaster />
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-center mb-6">活动列表</h1>

        {isLoading ? (
          <div className="text-center py-8">加载中...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">暂无活动</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activities.map((activity) => (
              <Card
                key={activity.id}
                className="overflow-hidden hover:shadow-lg transition-shadow duration-300"
              >
                {/* 海报图片 */}
                <div className="relative h-48 bg-gray-100">
                  {activity.poster_url ? (
                    <img
                      src={getImageUrl(activity.poster_url)}
                      alt={activity.activity_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`absolute inset-0 flex items-center justify-center ${activity.poster_url ? 'hidden' : ''}`}>
                    <div className="text-gray-400 text-sm">暂无海报</div>
                  </div>

                  {/* 状态标签 */}
                  <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-sm font-medium border ${getStatusStyle(activity.status)}`}>
                    {getStatusText(activity.status)}
                  </div>
                </div>

                <CardContent className="p-4">
                  {/* 活动名称 */}
                  <h3 className="text-lg font-semibold mb-3 truncate" title={activity.activity_name}>
                    {activity.activity_name}
                  </h3>

                  {/* 活动信息 */}
                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="truncate">{formatDate(activity.start_time)}</span>
                    </div>

                    {activity.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="truncate">{activity.location}</span>
                      </div>
                    )}

                    {activity.tag && (
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-gray-400" />
                        <span className="truncate">{activity.tag}</span>
                      </div>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewParticipants(activity.id)}
                      className="flex-1"
                    >
                      <Users className="h-4 w-4 mr-1" />
                      人员
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(activity.id)}
                      className="flex-1"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(activity.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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