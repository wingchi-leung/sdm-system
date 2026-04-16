import React, { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { useToast } from '../hooks/use-toast'; 

const UserSignIn = () => {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const activity = 'SDM gathering';

  // Replace the handleSubmit function with this:
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!name.trim()) return;

  setIsLoading(true);
  try {
    const response = await fetch('http://localhost:8000/checkin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.trim(),
        activity: activity.trim(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast({
        title: "签到失败",
        description: data.message || "请稍后重试",
        variant: "destructive",
        duration: 3000,
      });
      throw new Error(data.message || '签到失败');
    }
     // 只有在成功时才显示成功提示并清空表单
     toast({
      title: data.status === "success" ? "签到成功" : "操作完成",
      description: data.message || "感谢您的参与。",
      duration: 3000,
      className: "bg-green-50 text-green-700 border-green-200",
    });
    setName('');
    
  } catch (error) {
    console.error('Sign in failed:', error);
    toast({
      title: "签到失败",
      description: "请稍后重试。",
      variant: "destructive",
      duration: 3000,
    });
  } finally {
    setIsLoading(false);
  }
};
return (
  <div className="flex items-center justify-center bg-gray-50 p-4">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-center">签到</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              type="text"
              placeholder="请输入您的姓名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!name.trim() || isLoading}
          >
            {isLoading ? "提交中..." : "签到"}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
);
};

export default UserSignIn;
