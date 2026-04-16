import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { X, UserPlus, Import } from 'lucide-react';
import { Toaster } from "./ui/toaster";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { API_PATHS, apiRequest } from '../config/api';
import { Participant, User } from '../type';

const CreateActivity = () => {
  const [formData, setFormData] = useState({
    participants: [] as Participant[],
    activityName: '',
    startTime: '',
    tags: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    try {
      const response = await apiRequest<User[]>(API_PATHS.users.list);
      if (response.data) {
        setUsers(response.data);
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      toast({
        title: "获取用户失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const addParticipant = () => {
    setFormData(prev => ({
      ...prev,
      participants: [...prev.participants, {
        id: Date.now(), // temporary unique id
        participant_name: '',
        identity_number: '',
        phone: '',
        isCustom: true,
        user_id: undefined
      }]
    }));
  };

  const removeParticipant = (index: number) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.filter((_, i) => i !== index)
    }));
  };

  const updateParticipant = (index: number, field: keyof Omit<Participant, 'id' | 'user_id'>, value: string) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      )
    }));
  };


  const handleImportUsers = () => {
    const selectedParticipants = users
      .filter(user => selectedUsers.includes(user.id))
      .map(user => ({
        id: Date.now(), // temporary unique id
        participant_name: user.name,
        identity_number: user.identity_number,
        phone: user.phone || '',
        isCustom: false,
        user_id: user.id // Now we're properly setting the user_id
      }));

    setFormData(prev => ({
      ...prev,
      participants: [...prev.participants, ...selectedParticipants]
    }));
    setIsImportDialogOpen(false);
    setSelectedUsers([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.participants.some(p => !p.participant_name.trim())) {
      toast({
        title: "验证失败",
        description: "请填写所有必填参与人信息",
        variant: "destructive",
      });
      return;
    }

    const apiData = {
      activity_name: formData.activityName,
      start_time: formData.startTime,
      tag: formData.tags, // 新增标签字段
      participants: formData.participants.map(p => ({
        participant_name: p.participant_name,
        phone: p.phone || '',
        identity_number: p.identity_number || '',
        user_id: p.user_id
      }))
    };

    setIsLoading(true);
    try {
      const response = await apiRequest(API_PATHS.activities.create, {
        method: 'POST',
        body: JSON.stringify(apiData),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      toast({
        title: "创建成功",
        description: "活动已成功创建",
        className: "bg-green-50 text-green-700",
      });

      setFormData({
        participants: [],
        activityName: '',
        startTime: '',
        tags: ''
      });
    } catch (error) {
      toast({
        title: "创建失败",
        description: "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <>
      <Toaster />
      <div className="container mx-auto py-8 px-4">
        <Card className="w-full max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-center text-2xl">创建活动</CardTitle>
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

              <div className="space-y-2">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium">参与人</label>
                  <div className="space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsImportDialogOpen(true)}
                      className="flex items-center gap-2"
                    >
                      <Import className="h-4 w-4" />
                      导入用户
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addParticipant}
                      className="flex items-center gap-2"
                    >
                      <UserPlus className="h-4 w-4" />
                      新增参与人
                    </Button>
                  </div>
                </div>

                {formData.participants.map((participant, index) => (
                  <div key={index} className="space-y-2 p-4 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">
                        参与人 {index + 1} {!participant.isCustom && '(导入)'}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeParticipant(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <Input
                        value={participant.participant_name}
                        onChange={(e) => updateParticipant(index, 'participant_name', e.target.value)}
                        placeholder="姓名"
                        required
                        disabled={!participant.isCustom}
                      />
                      <Input
                        value={participant.identity_number || ''}
                        onChange={(e) => updateParticipant(index, 'identity_number', e.target.value)}
                        placeholder="身份证号"
                        disabled={!participant.isCustom}
                      />
                      <Input
                        value={participant.phone || ''}
                        onChange={(e) => updateParticipant(index, 'phone', e.target.value)}
                        placeholder="电话号码"
                        disabled={!participant.isCustom}
                      />
                    </div>
                  </div>
                ))}
              </div>


              <div>
                <label className="block text-sm font-medium mb-1">标签</label>
                <Input
                  value={formData.tags}
                  onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="请输入标签，多个标签用逗号分隔"
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

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "提交中..." : "创建活动"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>导入用户</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {users.map((user) => (
                <div key={user.id} className="flex items-center space-x-2">
                  <Checkbox
                    checked={selectedUsers.includes(user.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedUsers(prev => [...prev, user.id]);
                      } else {
                        setSelectedUsers(prev => prev.filter(id => id !== user.id));
                      }
                    }}
                  />
                  <label className="text-sm">
                    {user.name} - {user.identity_number}
                    {user.phone && ` - ${user.phone}`}
                  </label>
                </div>
              ))}
              <Button
                onClick={handleImportUsers}
                className="w-full"
                disabled={selectedUsers.length === 0}
              >
                导入选中用户
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default CreateActivity;
