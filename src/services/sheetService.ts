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
  scriptUrl: string, 
  action: 'get' | 'sync' | 'setup', 
  payload?: { transactions?: Transaction[], goals?: Goal[] }
): Promise<SheetResponse> => {
  try {
    // We use a POST request for everything to avoid caching issues and handle larger payloads
    // The Apps Script must be deployed as "Me" (the user) and "Anyone" access to handle CORS via the script logic
    const response = await fetch(scriptUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8', // Avoids OPTION preflight issues in some GAS deployments
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Sheet Sync Error:", error);
    return { status: 'error', message: error instanceof Error ? error.message : "Unknown error" };
  }
};
