import { useState } from 'react';
import { Button } from './ui/button';
import UserSignIn from './UserSignIn';
import ListSignIn from './ListSign';
import { Toaster } from "./ui/toaster"
import ActivitySignIn  from './ActivitySignIn';
import { Participant } from '../type';
import SignaturePad from './SignaturePad';


 
interface CurrentActivity {
  id: number | null;
  name: string;
}


const SignInPage = () => {
  const [peopleList, setPeopleList] = useState<Participant[]>([]);
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity>({
    id: null,
    name: ''
  });
  const [signInMode, setSignInMode] = useState('manual'); // 'manual', 'list', or 'signature'

  const handleActivitySelect = (activityId: number, participants: Participant[], activityName: string) => {
    setPeopleList(participants);
    setCurrentActivity({
      id: activityId,
      name: activityName
    });
  };


  const handleSignatureSave = async (signatureData:any) => {
    // try {
    //   const response = await apiRequest(API_PATHS.signIn.create, {
    //     method: 'POST',
    //     body: JSON.stringify({
    //       type: 'signature',
    //       signature_data: signatureData,
    //       activity_id: activityId,  // Make sure you have this from your route params
    //     }),
    //   });
  
    //   if (response.error) {
    //     throw new Error(response.error);
    //   }
  
    //   toast({
    //     title: "签到成功",
    //     description: "您的签名已保存",
    //     className: "bg-green-50 text-green-700",
    //   });
    // } catch (error) {
    //   toast({
    //     title: "签到失败",
    //     description: "请稍后重试",
    //     variant: "destructive",
    //   });
    // }
  };
  


  return (
    <div>
      <Toaster />
      <div className="space-y-6">
        <ActivitySignIn onActivitySelect={handleActivitySelect} />
        <div className="bg-white shadow-sm mb-6">
          <div className="max-w-md mx-auto p-4 flex justify-center space-x-4">
            <Button
              variant={signInMode === 'list' ? 'default' : 'outline'}
              onClick={() => setSignInMode('list')}
            >
              名单签到
            </Button>
            <Button
              variant={signInMode === 'input' ? 'default' : 'outline'}
              onClick={() => setSignInMode('input')}
              className="w-32"
            >
              手动签到
            </Button>
            <Button
              variant={signInMode === 'signature' ? 'default' : 'outline'}
              onClick={() => setSignInMode('signature')}
              className="w-32"
            >
              手写签名
            </Button>
          </div>
        </div>
  
        <div>
          {signInMode === 'list' ? (
            <ListSignIn
              peopleList={peopleList}
              activityId={currentActivity.id}
              activityName={currentActivity.name}
            />
          ) : signInMode === 'input' ? (
            <UserSignIn />
          ) : (
            <SignaturePad
              onSave={handleSignatureSave}
              onClose={() => setSignInMode('input')}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
