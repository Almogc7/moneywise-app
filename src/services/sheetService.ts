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
    const idToken = localStorage.getItem('moneywise_google_id_token');

    const response = await fetch('/api/sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        action,
        ...payload,
      }),
    });

    if (!response.ok) {
      let errorDetails = '';

      try {
        const errJson = await response.json();
        errorDetails = errJson?.message ? ` - ${errJson.message}` : '';
      } catch {
        // Ignore JSON parse errors and fall back to status code only.
      }

      throw new Error(`HTTP error! status: ${response.status}${errorDetails}`);
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