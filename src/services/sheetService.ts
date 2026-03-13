import type { Transaction, Goal } from '../types';

interface SheetResponse {
  status: 'success' | 'error';
  data?: {
    transactions: Transaction[];
    goals: Goal[];
  };
  message?: string;
}

export const syncWithSheet = async (
  action: 'get' | 'sync' | 'setup',
  payload?: { transactions?: Transaction[]; goals?: Goal[] }
): Promise<SheetResponse> => {
  try {
    const response = await fetch('/api/sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        ...payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Sheet Sync Error:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};