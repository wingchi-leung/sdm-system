import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { Toaster } from "./ui/toaster";
import { API_PATHS, apiRequest } from '../config/api';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Activity {
  id: number;
  activity_name: string;
  start_time: string;
  end_time?: string;
  tag?: string;
  activity_type_id?: number;
  activity_type_name?: string;
}

const EditActivity = () => {
  const { id } = useParams<{ id: string }>();
  const [formData, setFormData] = useState({
    activityName: '',
    startTime: '',
    endTime: '',
    tags: '',
    activityTypeName: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      fetchActivity();
    }
  }, [id]);

  const fetchActivity = async () => {
    setIsFetching(true);
    try {
      const response = await apiRequest<Activity>(API_PATHS.activities.detail(Number(id)));
      if (response.data) {
        const activity = response.data;
        setFormData({
          activityName: activity.activity_name,
          startTime: activity.start_time.slice(0, 16),
          endTime: activity.end_time ? activity.end_time.slice(0, 16) : '',
          tags: activity.tag || '',
          activityTypeName: activity.activity_type_name || ''
        });
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      toast({
        title: "获取活动信息失败",
        description: "请稍后重试",
        variant: "destructive"
      });
      navigate('/activities');
    } finally {
      setIsFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const updateData: any = {
      activity_name: formData.activityName,
      start_time: formData.startTime,
      tag: formData.tags || null,
    };

    if (formData.endTime) {
      updateData.end_time = formData.endTime;
    }

    if (formData.activityTypeName) {
      updateData.activity_type_name = formData.activityTypeName;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest(API_PATHS.activities.update(Number(id)), {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      toast({
        title: "更新成功",
        description: "活动信息已成功更新",
        className: "bg-green-50 text-green-700",
      });

      navigate('/activities');
    } catch (error) {
      toast({
        title: "更新失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-8 text-center">加载中...</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Toaster />
      <div className="container mx-auto py-8 px-4">
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/activities')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-center text-2xl flex-1">编辑活动</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">活动名称</label>
                <Input
                  value={formData.activityName}
                  onChange={(e) => setFormData(prev => ({ ...prev, activityName: e.target.value }))}
                  placeholder="请输入活动名称"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">活动类型</label>
                <Input
                  value={formData.activityTypeName}
                  onChange={(e) => setFormData(prev => ({ ...prev, activityTypeName: e.target.value }))}
                  placeholder="请输入活动类型"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">开始时间</label>
                <Input
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">结束时间（可选）</label>
                <Input
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">标签</label>
                <Input
                  value={formData.tags}
                  onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="请输入标签，多个标签用逗号分隔"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "更新中..." : "保存修改"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default EditActivity;