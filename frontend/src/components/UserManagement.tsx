import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useToast } from '../hooks/use-toast';
import { UserPlus, Edit } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';


interface FormData {
  name: string;
  identity_number: string;
  phone: string;
  sex: string;
}

interface User extends FormData {
  id: number;
}

const UserForm = React.memo(({
  initialData,
  onSubmit,
  isEdit
}: {
  initialData: FormData;
  onSubmit: (data: FormData) => void;
  isEdit: boolean;
}) => {
  const [formData, setFormData] = useState<FormData>(initialData);

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleSubmit = () => {
    onSubmit(formData);
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">姓名</label>
        <Input
          value={formData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">身份证号</label>
        <Input
          value={formData.identity_number}
          onChange={(e) => handleInputChange('identity_number', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">电话</label>
        <Input
          value={formData.phone}
          onChange={(e) => handleInputChange('phone', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">性别</label>
        <Select
          value={formData.sex}
          onValueChange={(value) => handleInputChange('sex', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择性别" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="M">男</SelectItem>
            <SelectItem value="F">女</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        className="w-full"
        onClick={handleSubmit}
      >
        {isEdit ? '更新' : '创建'}用户
      </Button>
    </div>
  );
});

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();

  const emptyFormData: FormData = {
    name: '',
    identity_number: '',
    phone: '',
    sex: ''
  };

  useEffect(() => {
    fetchUsers();
  }, []);




  // Replace the fetchUsers function
  const fetchUsers = async () => {
    try {
      const response = await apiRequest<User[]>(API_PATHS.users.list, {
        method: 'GET',
      });
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
  };


  const handleSubmitForm = async (formData: FormData, isEdit: boolean) => {
    try {
      const url = isEdit
        ? `http://localhost:8000/user/${selectedUser?.id}`
        : 'http://localhost:8000/api/v1/users/create';

      const response = await apiRequest(url, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(formData)
      });

      if (response.error) {
        throw new Error(response.error);
      }

      toast({
        title: `${isEdit ? '更新' : '创建'}成功`,
        description: `用户已${isEdit ? '更新' : '创建'}`,
        className: "bg-green-50 text-green-700"
      });

      
      fetchUsers();
      setIsAddDialogOpen(false);
      setIsEditDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      toast({
        title: `${isEdit ? '更新' : '创建'}失败`,
        description: error instanceof Error ? error.message : "请稍后重试",
        variant: "destructive"
      });
    }
  };




  

  const handleEdit = useCallback((user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  }, []);

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>用户管理</CardTitle>
          <Button
            className="flex items-center gap-2"
            onClick={() => {
              setIsAddDialogOpen(true);
              setSelectedUser(null);
            }}
          >
            <UserPlus className="h-4 w-4" />
            添加用户
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <h3 className="font-medium">{user.name}</h3>
                  <p className="text-sm text-gray-500">
                    身份证: {user.identity_number} |
                    电话: {user.phone || '未设置'} |
                    性别: {user.sex === 'M' ? '男' : user.sex === 'F' ? '女' : '未设置'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => handleEdit(user)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加新用户</DialogTitle>
          </DialogHeader>
          <UserForm
            initialData={emptyFormData}
            onSubmit={(data) => handleSubmitForm(data, false)}
            isEdit={false}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
          </DialogHeader>
          <UserForm
            initialData={selectedUser ?? emptyFormData}
            onSubmit={(data) => handleSubmitForm(data, true)}
            isEdit={true}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;