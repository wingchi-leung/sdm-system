import { useState } from 'react';
import { Button } from './ui/button';
 import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { useToast } from '../hooks/use-toast'; // Add this import at the top
import { Participant, ListSignInProps } from '../type';
import { API_PATHS, apiRequest } from '../config/api';

const ListSignIn = ({ peopleList, activityId, activityName }: ListSignInProps) => {
  const [attend_particpant, setAttendParticipant] = useState<Participant | null>(null);
  // 新增状态来追踪已签到的用户
  const [checkedInUsers, setCheckedInUsers] = useState<string[]>([]);

  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);


  const getParticipantKey = (participant: Participant): string => {
    return `${participant.participant_name}-${participant.phone || ''}`;
  };


  const handleSubmit = async () => {
    if (!attend_particpant || !activityId) return;

    setIsLoading(true);
    try {
      const response = await apiRequest<any>(API_PATHS.checkins.add, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activity_id: activityId,
          name: attend_particpant.participant_name,
          identity_number: attend_particpant.identity_number,
          phone: attend_particpant.phone || '',
          has_attend: 1,
          note: "",
          user_id: attend_particpant.id // Optional field
        }),
      });

      if (response.error  ) {
        toast({
          title: "签到失败",
          description: response.error || "请稍后重试",
          variant: response.error == '已经签到过，不用签到啦' ?  "destructive" : null ,
          duration: 3000,
        });
        return;
      }

      // 签到成功后更新已签到用户集合
      setCheckedInUsers(prev => [...prev, getParticipantKey(attend_particpant)]);
      toast({
        title: "签到成功",
        description: "签到记录已保存",
        duration: 3000,
        className: "bg-green-50 text-green-700 border-green-200",
      });

    } catch (error: any) {
      console.error('Sign in failed:', error);
      toast({
        title: "签到失败",
        description: error || error || "请稍后重试。",
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
          <CardTitle className="text-center">名单签到</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="max-h-[70vh] overflow-y-auto border rounded-md divide-y">

              {peopleList.map((person) => (
                <div
                  key={getParticipantKey(person)}
                  onClick={() => setAttendParticipant(person)}
                  className={`p-4 cursor-pointer transition-colors flex justify-between items-center ${attend_particpant?.id === person.id
                      ? 'bg-white-100'
                      : 'bg-white hover:bg-blue-50'
                    }`}
                >
                  <div>
                    <div className="font-medium">{person.participant_name}</div>
                    <div className="text-sm text-gray-500">{person.phone}</div>
                  </div>
                  {checkedInUsers.includes(getParticipantKey(person)) && (
                    <div className="px-2 py-1 text-sm bg-green-100 text-green-800 rounded">
                      已签到
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full"
              disabled={
                !attend_particpant ||
                isLoading ||
                (attend_particpant && checkedInUsers.includes(getParticipantKey(attend_particpant)))
              }
            >
              {isLoading
                ? "签到中..."
                : (attend_particpant && checkedInUsers.includes(getParticipantKey(attend_particpant)))
                  ? "已签到"
                  : "确认签到"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ListSignIn;