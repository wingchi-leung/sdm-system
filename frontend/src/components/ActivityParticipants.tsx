import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { Toaster } from "./ui/toaster";
import { API_PATHS, apiRequest } from '../config/api';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

interface Participant {
  id: number;
  participant_name: string;
  phone: string;
  identity_number?: string;
  user_id?: number;
  create_time: string;
  update_time: string;
}

interface ParticipantListResponse {
  items: Participant[];
  total: number;
}

const ActivityParticipants = () => {
  const { id } = useParams<{ id: string }>();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      fetchParticipants();
    }
  }, [id, currentPage]);

  const fetchParticipants = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest<ParticipantListResponse>(
        `${API_PATHS.activities.participants(Number(id))}?skip=${currentPage * pageSize}&limit=${pageSize}`
      );
      if (response.data) {
        setParticipants(response.data.items);
        setTotal(response.data.total);
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      toast({
        title: "获取报名人员失败",
        description: "请稍后重试",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/activities')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-2xl">报名人员列表</CardTitle>
              </div>
              <div className="text-sm text-gray-600">
                共 {total} 人
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">加载中...</div>
            ) : participants.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无报名人员</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>序号</TableHead>
                      <TableHead>姓名</TableHead>
                      <TableHead>电话号码</TableHead>
                      <TableHead>身份证号</TableHead>
                      <TableHead>报名时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((participant, index) => (
                      <TableRow key={participant.id}>
                        <TableCell>{currentPage * pageSize + index + 1}</TableCell>
                        <TableCell className="font-medium">{participant.participant_name}</TableCell>
                        <TableCell>{participant.phone || '-'}</TableCell>
                        <TableCell>{participant.identity_number || '-'}</TableCell>
                        <TableCell>{formatDate(participant.create_time)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      第 {currentPage + 1} 页，共 {totalPages} 页
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevPage}
                        disabled={currentPage === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={currentPage >= totalPages - 1}
                      >
                        下一页
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ActivityParticipants;