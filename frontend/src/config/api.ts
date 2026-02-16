// src/config/api.ts

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

export const API_PATHS = {
  // User related endpoints
  users: {
    list: `${BASE_URL}/users`,
    create: `${BASE_URL}/users`,
    update: (id: number) => `${BASE_URL}/user/${id}`,
    delete: (id: number) => `${BASE_URL}/user/${id}`,
  },
  
  // Activity related endpoints
  activities: {
    create: `${BASE_URL}/activities`,
    list: `${BASE_URL}/activities`,
    detail: (id: number) => `${BASE_URL}/activity/${id}`,
    unstart : `${BASE_URL}/activities/unstarted`
  },

  // Sign-in related endpoints
  checkins: {
    list: `${BASE_URL}/checkins`,
    add: `${BASE_URL}/checkins`,
    verify: `${BASE_URL}/verify-sign-in`,
  },

  // Activity related endpoints
  participants: {
     list: (id: number) => `${BASE_URL}/participants/${id}`,  
  }
} as const;

// Type for API response
export interface ApiResponse<T> {
  data?: T;
  detail?:string;
  error?: string;
  message?: string;
}

// API request helper
export const apiRequest = async <T>(
  url: string, 
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'An error occurred');
    }
    
    return { data };
  } catch (error) {
    return { 
      error: error instanceof Error ? error.message : 'An error occurred' 
    };
  }
};