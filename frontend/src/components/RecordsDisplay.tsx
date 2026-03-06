import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from "./ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table"
import { format } from 'date-fns';
import { API_PATHS, apiRequest } from '../config/api';

interface CheckInRecord {
  name: string;
  activity: string;
  checkin_time: string;
}

const RecordsDisplay = () => {
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecords = async () => {
      const res = await apiRequest<Array<{ name: string; activity_name?: string; checkin_time: string }>>(
        API_PATHS.checkins.list
      );
      if (res.error) {
        setError(res.error);
      } else if (Array.isArray(res.data)) {
        setRecords(
          res.data.map((r) => ({
            name: r.name,
            activity: r.activity_name ?? '',
            checkin_time: r.checkin_time,
          }))
        );
      }
      setIsLoading(false);
    };

    fetchRecords();
  }, []);

  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto mt-4">
        <CardContent className="p-6">
          <div className="flex justify-center items-center h-40">
            <p className="text-gray-500">加载中...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-4xl mx-auto mt-4">
        <CardContent className="p-6">
          <div className="flex justify-center items-center h-40">
            <p className="text-red-500">错误: {error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto mt-4">
      <CardHeader>
        <CardTitle className="text-center">签到记录</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>活动</TableHead>
              <TableHead>签到时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record, index) => (
              <TableRow key={index}>
                <TableCell>{record.name}</TableCell>
                <TableCell>{record.activity}</TableCell>
                <TableCell>
                  {format(new Date(record.checkin_time), 'yyyy-MM-dd HH:mm:ss')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default RecordsDisplay;