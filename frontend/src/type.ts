export interface Participant {
    id: number;
    user_id?: number;
    participant_name: string;
    identity_number?: string;  // optional since some participants might not have it
    phone?: string;  // optional since some participants might not have it
    isCustom?:boolean ;
  }
  
export interface Activity {
  id: number;
  activity_name: string;
  start_time: string;
  status: number;
  tag: string ;
}



export interface ListSignInProps {
peopleList: Participant[];
activityId: number | null;
activityName: string;
}


export interface User {
id: number;
name: string;
identity_number: string;
phone?: string;
}
