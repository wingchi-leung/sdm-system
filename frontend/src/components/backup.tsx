import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardContent, CardTitle } from './ui/card';
import { useToast } from '../hooks/use-toast'; // Add this import at the top
import { Participant,ListSignInProps } from '../type';
import { API_PATHS, apiRequest } from '../config/api';


const ListSignIn = ({ peopleList, activityId, activityName }: ListSignInProps) => {
  const [attend_particpant, setAttendParticipant] = useState<Participant | null>(null);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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
      if (response.error) {
        toast({
          title: "已签到",
          description: response.error || "请稍后重试",
          
          duration: 3000,
        });
        
      }
      else{
        toast({
          title: "签到成功",
          description: "签到记录已保存",
          duration: 3000,
          className: "bg-green-50 text-green-700 border-green-200",
        });
      }
    

    } catch (error) {
      console.error('Sign in failed:', error);
      toast({
        title: "签到失败",
        description:  "签到异常！",
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
                  key={person.id}
                  className={`p-4 cursor-pointer hover:bg-gray-100 ${attend_particpant?.id === person.id ? 'bg-blue-50' : ''
                    }`}
                  onClick={() => setAttendParticipant(person)}
                >
                  <div className="font-medium">{person.participant_name}</div>
                </div>
              ))}
            </div>

            <Button
              onClick={handleSubmit}
              className="w-full"
              disabled={!attend_particpant || isLoading}
            >
              {isLoading ? "签到中..." : "确认签到"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ListSignIn;