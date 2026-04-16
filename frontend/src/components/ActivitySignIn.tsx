import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from  './ui/select';
import { useToast } from '../hooks/use-toast';
import { API_PATHS, apiRequest } from '../config/api';

import { Participant,Activity } from '../type';
 

interface ActivitySignInProps {
  onActivitySelect: (activityId: number, participants: Participant[], activityName: string) => void;
}

const ActivitySignIn: React.FC<ActivitySignInProps> = ({ onActivitySelect }) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const { toast } = useToast();

  const fetchActivities = useCallback(async () => {
    try {
      const response = await apiRequest<any>(API_PATHS.activities.unstart, {
        method: 'GET',
      });
      if (response.data) {
        const { items } = response.data;
        setActivities(items);
      } else {
        throw new Error(response.error);
      }
     } catch (error) {
      toast({
        title: "获取活动失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const fetchParticipants = useCallback(async (activityId: number, activityName: string) => {
    try {
      const response = await apiRequest<any>(API_PATHS.participants.list(activityId), {
        method: 'GET'
      });
      if (response.data) {
      
        onActivitySelect(activityId, response.data, activityName);
      } else {
        throw new Error(response.error);
      }
     
    } catch (error) {
      toast({
        title: "获取参与者失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    }
  }, [onActivitySelect, toast]);

  const handleActivityChange = (value: string) => {
    const activity = activities.find(a => a.id === parseInt(value));
    if (activity) {
      fetchParticipants(activity.id, activity.activity_name);
    }
  };

  return (
    <Card className="w-[300px] bg-white/50 backdrop-blur-sm shadow-sm border-0">
    <CardHeader className="pb-2 pt-3 px-3">
      <CardTitle className="text-base font-medium text-gray-700">选择活动</CardTitle>
    </CardHeader>
    <CardContent className="px-3 pb-3">
        <Select onValueChange={handleActivityChange}>
          <SelectTrigger className="w-full bg-white border-gray-200 hover:bg-gray-50 transition-colors text-sm">
            <SelectValue placeholder="选择要签到的活动" />
          </SelectTrigger>
          <SelectContent>
            {activities.map((activity) => (
              <SelectItem 
                key={activity.id} 
                value={activity.id.toString()}
                className="hover:bg-gray-50"
              >
                <div className="flex flex-col py-1">
                  <span className="font-medium text-sm">{activity.activity_name}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(activity.start_time).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};

export default ActivitySignIn;
