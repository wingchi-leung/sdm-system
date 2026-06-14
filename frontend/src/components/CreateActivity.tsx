import React, { useCallback, useEffect, useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { ChevronLeft, MoreHorizontal, X, UserPlus, Import } from 'lucide-react';
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
    endDate: '',
    endTime: '',
    activityType: '',
    activityTypeInput: '',
    tags: '',
    activityIntro: '',
    isPublic: 0,
    registrationLimit: ''
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
      end_time: formData.endDate && formData.endTime
        ? `${formData.endDate}T${formData.endTime}`
        : undefined,
      tag: formData.tags,
      activity_type: formData.activityType === '__custom__'
        ? formData.activityTypeInput
        : formData.activityType,
      activity_intro: formData.activityIntro.trim() || null,
      is_public: formData.isPublic,
      registration_limit: formData.registrationLimit
        ? parseInt(formData.registrationLimit, 10)
        : null,
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
        endDate: '',
        endTime: '',
        activityType: '',
        activityTypeInput: '',
        tags: '',
        activityIntro: '',
        isPublic: 0,
        registrationLimit: ''
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
      <div className="min-h-screen bg-white">
        {/* 顶部导航栏 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-14 bg-white border-b border-gray-100">
          <button
            type="button"
            className="flex items-center justify-center w-10 h-10 -ml-2 text-gray-700 hover:text-gray-900"
            aria-label="返回"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-medium text-gray-900 absolute left-1/2 -translate-x-1/2">
            发布活动
          </h1>
          <button
            type="button"
            className="flex items-center justify-center w-10 h-10 -mr-2 text-gray-700 hover:text-gray-900"
            aria-label="更多"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pb-24">
          {/* 活动名称 */}
          <div className="px-4 pt-5 pb-2">
            <div className="flex items-baseline justify-between">
              <label className="text-sm text-gray-700">
                活动名称<span className="text-red-500 ml-0.5">*</span>
              </label>
              <span className="text-xs text-gray-400">
                {formData.activityName.length}/50
              </span>
            </div>
            <Input
              value={formData.activityName}
              onChange={(e) => setFormData(prev => ({ ...prev, activityName: e.target.value }))}
              placeholder="请输入活动名称"
              maxLength={50}
              required
              className="mt-2 border-0 border-b border-gray-200 rounded-none px-0 h-10 text-base focus-visible:ring-0 focus-visible:border-gray-900"
            />
          </div>

          {/* 活动类型 */}
          <div className="px-4 pt-4 pb-2">
            <label className="text-sm text-gray-700">
              活动类型<span className="text-red-500 ml-0.5">*</span>
            </label>
            <div
              className="mt-2 flex items-center justify-between border-b border-gray-200 h-10 cursor-text"
              onClick={() => {
                // visual placeholder only; real selection handled by native <select>
              }}
            >
              <select
                value={formData.activityType}
                onChange={(e) => setFormData(prev => ({ ...prev, activityType: e.target.value }))}
                required
                className="w-full bg-transparent outline-none text-base appearance-none cursor-pointer text-gray-700"
                style={formData.activityType ? {} : { color: '#9CA3AF' }}
              >
                <option value="" disabled>请选择活动类型</option>
                <option value="团建">团建</option>
                <option value="培训">培训</option>
                <option value="会议">会议</option>
                <option value="其他">其他</option>
                <option value="__custom__">自定义...</option>
              </select>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            {formData.activityType === '__custom__' && (
              <Input
                value={formData.activityTypeInput}
                onChange={(e) => setFormData(prev => ({ ...prev, activityTypeInput: e.target.value }))}
                placeholder="超级管理员可直接输入类型（选填）"
                className="mt-3 border-0 border-b border-gray-200 rounded-none px-0 h-10 text-sm focus-visible:ring-0 focus-visible:border-gray-900"
              />
            )}
            {formData.activityType === '' && (
              <p className="mt-2 text-xs text-gray-400">
                超级管理员可直接输入类型（选填）
              </p>
            )}
          </div>

          {/* 活动时间 */}
          <div className="px-4 pt-4 pb-2">
            <label className="text-sm text-gray-700">
              活动时间<span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="mt-2 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-10 shrink-0">开始</span>
                <div className="flex-1 flex items-center border-b border-gray-200 h-10">
                  <input
                    type="date"
                    value={formData.startTime ? formData.startTime.split('T')[0] : ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                    required
                    className="flex-1 bg-transparent outline-none text-base text-gray-700"
                  />
                </div>
                <div className="flex-1 flex items-center border-b border-gray-200 h-10">
                  <input
                    type="time"
                    value={formData.startTime ? formData.startTime.split('T')[1]?.slice(0, 5) : ''}
                    onChange={(e) => {
                      const date = formData.startTime ? formData.startTime.split('T')[0] : '';
                      setFormData(prev => ({ ...prev, startTime: date ? `${date}T${e.target.value}` : e.target.value }));
                    }}
                    required
                    className="flex-1 bg-transparent outline-none text-base text-gray-700"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-10 shrink-0">结束</span>
                <div className="flex-1 flex items-center border-b border-gray-200 h-10">
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                    className="flex-1 bg-transparent outline-none text-base text-gray-700"
                  />
                </div>
                <div className="flex-1 flex items-center border-b border-gray-200 h-10">
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                    className="flex-1 bg-transparent outline-none text-base text-gray-700"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 设为公开活动 */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-700">设为公开活动</div>
              <p className="mt-1 text-xs text-gray-400">
                公开活动所有用户可见，非公开活动仅关联用户可见
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.isPublic === 1}
              onClick={() => setFormData(prev => ({ ...prev, isPublic: prev.isPublic === 1 ? 0 : 1 }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                formData.isPublic === 1 ? 'bg-gray-900' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  formData.isPublic === 1 ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* 报名限额 */}
          <div className="px-4 pt-4 pb-2">
            <label className="text-sm text-gray-700">报名限额</label>
            <Input
              value={formData.registrationLimit}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '');
                setFormData(prev => ({ ...prev, registrationLimit: v }));
              }}
              placeholder="不填则不限制人数"
              type="text"
              inputMode="numeric"
              className="mt-2 border-0 border-b border-gray-200 rounded-none px-0 h-10 text-base focus-visible:ring-0 focus-visible:border-gray-900"
            />
            <p className="mt-2 text-xs text-gray-400">
              设置后，超额报名将进入候补状态
            </p>
          </div>

          {/* 活动介绍 */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-baseline justify-between">
              <label className="text-sm text-gray-700">活动介绍</label>
              <span className="text-xs text-gray-400">
                {formData.activityIntro.length}/1000
              </span>
            </div>
            <textarea
              value={formData.activityIntro}
              onChange={(e) => setFormData(prev => ({ ...prev, activityIntro: e.target.value }))}
              placeholder="请输入活动介绍（最多1000字）"
              maxLength={1000}
              rows={5}
              className="mt-2 w-full bg-transparent border-0 border-b border-gray-200 rounded-none px-0 py-2 text-base focus:outline-none focus:border-gray-900 resize-none"
            />
          </div>

          {/* 参与人 */}
          <div className="px-4 pt-6 pb-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-700">参与人</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsImportDialogOpen(true)}
                  className="flex items-center gap-1 text-sm text-gray-600"
                >
                  <Import className="w-4 h-4" />
                  导入
                </button>
                <button
                  type="button"
                  onClick={addParticipant}
                  className="flex items-center gap-1 text-sm text-gray-600"
                >
                  <UserPlus className="w-4 h-4" />
                  新增
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {formData.participants.map((participant, index) => (
                <div key={index} className="py-3 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">
                      参与人 {index + 1}
                      {!participant.isCustom && (
                        <span className="ml-2 text-xs text-gray-400">（已导入）</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeParticipant(index)}
                      className="text-gray-400 hover:text-gray-600"
                      aria-label="删除"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Input
                      value={participant.participant_name}
                      onChange={(e) => updateParticipant(index, 'participant_name', e.target.value)}
                      placeholder="姓名"
                      required
                      disabled={!participant.isCustom}
                      className="border-0 border-b border-gray-200 rounded-none px-0 h-9 text-sm focus-visible:ring-0 focus-visible:border-gray-900"
                    />
                    <Input
                      value={participant.identity_number || ''}
                      onChange={(e) => updateParticipant(index, 'identity_number', e.target.value)}
                      placeholder="身份证号"
                      disabled={!participant.isCustom}
                      className="border-0 border-b border-gray-200 rounded-none px-0 h-9 text-sm focus-visible:ring-0 focus-visible:border-gray-900"
                    />
                    <Input
                      value={participant.phone || ''}
                      onChange={(e) => updateParticipant(index, 'phone', e.target.value)}
                      placeholder="电话号码"
                      disabled={!participant.isCustom}
                      className="border-0 border-b border-gray-200 rounded-none px-0 h-9 text-sm focus-visible:ring-0 focus-visible:border-gray-900"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* 底部发布按钮 */}
        <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white border-t border-gray-100">
          <Button
            type="submit"
            onClick={handleSubmit}
            className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white text-base font-medium rounded-lg"
            disabled={isLoading}
          >
            {isLoading ? "提交中..." : "发布活动"}
          </Button>
        </div>

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
