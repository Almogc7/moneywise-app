import { useState, useEffect, useMemo } from 'react';
import type { Transaction, Goal, TransactionType, FinancialSummary, Member, BudgetLimit, CardAccountMapping } from './types';
import { MEMBERS } from './types';
import { SummaryCards } from './components/SummaryCards';
import { TransactionForm } from './components/TransactionForm';
import { ExpensePieChart, BalanceBarChart, CategoryBarChart, YearlyTrendChart } from './components/Charts';
import { Goals } from './components/Goals';
import { Settings } from './components/Settings';
import { getFinancialAdvice } from './services/geminiService';
import { syncWithSheet } from './services/sheetService';
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Target,
  Bot,
  Trash2,
  Settings as SettingsIcon,
  Cloud,
  CloudOff,
  RefreshCw,
  Check,
  X,
  Pencil,
  PieChart,
  BarChart2,
  Copy,
  Pin,
  Filter,
  Users,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Moon,
  Sun
} from 'lucide-react';

declare global {
  interface Window {
    google: any;
  }
}

const STORAGE_KEY = 'moneywise_data_v1';
const AUTH_TOKEN_STORAGE_KEY = 'moneywise_google_id_token';
const BUDGETS_KEY = 'moneywise_budgets_v1';
const CARD_MAPPINGS_KEY = 'moneywise_card_mappings_v1';
const THEME_KEY = 'moneywise_theme';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const renderGoogleSignInButton = (elementId: string, width: number) => {
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    return;
  }

  const target = document.getElementById(elementId);

  if (!target) {
    return;
  }

  target.innerHTML = '';

  window.google.accounts.id.renderButton(target, {
    type: 'standard',
    theme: 'outline',
    size: 'medium',
    text: 'signin_with',
    shape: 'pill',
    width,
  });
};

const decodeGoogleJwtPayload = (token: string) => {
  const payloadPart = token.split('.')[1];

  if (!payloadPart) {
    throw new Error('Invalid Google credential token payload');
  }

  const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
  const paddedBase64 = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(paddedBase64), (char) => char.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);

  return JSON.parse(json);
};

// Helper to get previous month YYYY-MM
const getPreviousMonth = (dateStr: string) => {
  const date = new Date(dateStr + '-01');
  date.setMonth(date.getMonth() - 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const formatDateDDMMYYYY = (rawDate: string) => {
  if (!rawDate) return '';

  const normalized = rawDate.trim().replace(/\//g, '-');
  const isoLikeMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoLikeMatch) {
    const [, year, month, day] = isoLikeMatch;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(rawDate);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  return rawDate;
};

const normalizeDatePart = (rawDate: string) => {
  const normalized = rawDate?.trim().replace(/\//g, '-') || '';
  const isoLikeMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoLikeMatch) {
    return `${isoLikeMatch[1]}-${isoLikeMatch[2]}-${isoLikeMatch[3]}`;
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeText = (text?: string) => (text || '').trim().toLowerCase().replace(/\s+/g, ' ');

const getDaysInMonth = (year: number, month1Based: number) => {
  return new Date(year, month1Based, 0).getDate();
};

const buildMonthRangeInclusive = (fromMonth: string, toMonth: string) => {
  if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth) || fromMonth > toMonth) {
    return [fromMonth];
  }

  const months: string[] = [];
  const cursor = new Date(`${fromMonth}-01`);
  const end = new Date(`${toMonth}-01`);

  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

const isPotentialDuplicate = (existing: Transaction, incoming: Omit<Transaction, 'id'>) => {
  if (existing.type !== incoming.type) return false;
  if (Math.abs(existing.amount - incoming.amount) > 0.01) return false;

  const existingDate = normalizeDatePart(existing.date);
  const incomingDate = normalizeDatePart(incoming.date);
  if (!existingDate || !incomingDate) return false;

  const dayDiff = Math.abs(
    Math.floor((new Date(existingDate).getTime() - new Date(incomingDate).getTime()) / (1000 * 60 * 60 * 24))
  );

  if (dayDiff > 3) return false;

  const existingSub = normalizeText(existing.subCategory);
  const incomingSub = normalizeText(incoming.subCategory);
  const merchantSimilar = existingSub && incomingSub
    ? existingSub.includes(incomingSub) || incomingSub.includes(existingSub)
    : false;

  const sameCategory = existing.category === incoming.category;
  const sameMember = existing.member === incoming.member;

  return merchantSimilar || (sameCategory && sameMember);
};

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [view, setView] = useState<'dashboard' | 'income' | 'expenses' | 'goals' | 'advisor' | 'settings'>('dashboard');
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advice, setAdvice] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') return true;
    if (savedTheme === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  // Dashboard state
  const [expenseChartType, setExpenseChartType] = useState<'pie' | 'bar'>('pie');

  // Cloud Sync State
  const [isCloudMode, setIsCloudMode] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // UI State for Deletion & Editing
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showFixedOnly, setShowFixedOnly] = useState(false);
  const [memberFilter, setMemberFilter] = useState<Member | 'all'>('all');
  const [fixedStopDialog, setFixedStopDialog] = useState<{
    transaction: Transaction;
    fromMonth: string;
    toMonth: string;
  } | null>(null);

  // Auth State
  const [user, setUser] = useState<any>(null);
  const [budgetLimits, setBudgetLimits] = useState<BudgetLimit[]>([]);
  const [cardMappings, setCardMappings] = useState<CardAccountMapping[]>([]);

  // Keep cloud mode enabled by default.
  useEffect(() => {
    setIsCloudMode(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Load cached data only after a user is authenticated.
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setGoals([]);
      setAdvice('');
      setLastSync(null);
      return;
    }

    const savedData = localStorage.getItem(STORAGE_KEY);

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setTransactions(parsed.transactions || []);
        setGoals(parsed.goals || []);
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }

    const savedBudgets = localStorage.getItem(BUDGETS_KEY);
    if (savedBudgets) {
      try {
        setBudgetLimits(JSON.parse(savedBudgets));
      } catch (e) {
        console.error('Failed to parse budget limits', e);
      }
    }

    const savedCardMappings = localStorage.getItem(CARD_MAPPINGS_KEY);
    if (savedCardMappings) {
      try {
        setCardMappings(JSON.parse(savedCardMappings));
      } catch (e) {
        console.error('Failed to parse card mappings', e);
      }
    }
  }, [user]);

  // Sync on mount if cloud mode AND user is logged in
  useEffect(() => {
    if (isCloudMode && user) {
      handleSync();
    }
  }, [isCloudMode, user]);

  // Save data locally on change (as backup/cache)
  useEffect(() => {
    if (!user) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions, goals }));
  }, [transactions, goals, user]);

  // Logic to import fixed expenses
  const importFixedExpenses = async (auto = false) => {
    // 1. Check if we already have expenses this month
    const currentMonthExpenses = transactions.filter(
      t => t.date.startsWith(currentMonth) && t.type === 'expense'
    );

    // If auto-running, only run if current month is completely empty to avoid duplicates or re-adding deleted items
    if (auto && currentMonthExpenses.length > 0) return;

    // 2. Find fixed expenses from previous month
    const prevMonth = getPreviousMonth(currentMonth);
    const prevMonthFixed = transactions.filter(
      t =>
        t.date.startsWith(prevMonth) &&
        t.type === 'expense' &&
        t.isFixed &&
        (!t.fixedUntil || t.fixedUntil >= currentMonth)
    );

    if (prevMonthFixed.length === 0) {
      if (!auto) alert('לא נמצאו הוצאות קבועות בחודש הקודם.');
      return;
    }

    // 3. Filter out ones that might already exist (same category + subCategory) in current month (for manual trigger safety)
    const newToCreate = prevMonthFixed.filter(prevT => {
      const exists = currentMonthExpenses.some(
        currT => currT.category === prevT.category && currT.subCategory === prevT.subCategory
      );
      return !exists;
    });

    if (newToCreate.length === 0) {
      if (!auto) alert('כל ההוצאות הקבועות מחודש קודם כבר קיימות בחודש זה.');
      return;
    }

    // 4. Create copies
    const newTransactions = newToCreate.map(t => {
      // Keep the same day of month, just change month/year
      const day = t.date.split('-')[2] || '01';
      return {
        ...t,
        id: crypto.randomUUID(),
        date: `${currentMonth}-${day}`,
      };
    });

    const updatedAll = [...transactions, ...newTransactions];
    setTransactions(updatedAll);
    await syncDataToCloud(updatedAll, goals);

    if (!auto) {
      alert(`הועתקו בהצלחה ${newTransactions.length} הוצאות קבועות.`);
    }
  };

  // Effect: Attempt auto-import when entering a new month
  useEffect(() => {
    if (transactions.length > 0) {
      importFixedExpenses(true);
    }
  }, [currentMonth, transactions.length]);

  // Helper to change month
  const changeMonth = (increment: number) => {
    const date = new Date(currentMonth + '-01');
    date.setMonth(date.getMonth() + increment);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${y}-${m}`);
  };

  // Derived state for Dashboard
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => t.date.startsWith(currentMonth));
  }, [transactions, currentMonth]);

  const summary = useMemo<FinancialSummary>(() => {
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const expenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const expensesByCategoryMap = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc: Record<string, number>, curr: Transaction) => {
        const currentAmount = acc[curr.category] || 0;
        acc[curr.category] = currentAmount + curr.amount;
        return acc;
      }, {} as Record<string, number>);

    const expensesByCategory = Object.entries(expensesByCategoryMap)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);

    return {
      totalIncome: income,
      totalExpenses: expenses,
      balance: income - expenses,
      expensesByCategory
    };
  }, [filteredTransactions]);

  // Derived state for Yearly Chart
  const yearlyData = useMemo(() => {
    const map: Record<string, { name: string; income: number; expense: number }> = {};

    transactions.forEach(t => {
      const monthKey = t.date.substring(0, 7); // YYYY-MM
      if (!map[monthKey]) {
        map[monthKey] = { name: monthKey, income: 0, expense: 0 };
      }
      if (t.type === 'income') {
        map[monthKey].income += t.amount;
      } else {
        map[monthKey].expense += t.amount;
      }
    });

    return Object.values(map)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(-12); // Show last 12 months
  }, [transactions]);

  // Sync Logic
  const handleSync = async () => {
    setIsSyncing(true);

    if (!user) {
      alert('Please login with Google first to sync data.');
      setIsSyncing(false);
      return;
    }

    try {
      const res = await syncWithSheet('get');

      if (res.status === 'success' && res.data) {
        if (res.data.transactions) setTransactions(res.data.transactions);
        if (res.data.goals) setGoals(res.data.goals);
        setLastSync(new Date());
      } else {
        console.error('Sync failed:', res.message);
        alert(`Sync failed: ${res.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Sync failed:', err);
      alert('Sync failed unexpectedly. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const syncDataToCloud = async (newTransactions: Transaction[], newGoals: Goal[]) => {
    if (!isCloudMode || !user) return;

    setIsSyncing(true);

    try {
      const res = await syncWithSheet('sync', {
        transactions: newTransactions,
        goals: newGoals
      });

      if (res.status === 'error') {
        throw new Error(res.message);
      }

      setLastSync(new Date());
    } catch (err) {
      console.error('Cloud sync error:', err);
      alert('שגיאה בסנכרון לענן. הנתונים נשמרו מקומית אך לא עודכנו בגיליון.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handlers
  const addTransaction = async (t: Omit<Transaction, 'id'>) => {
    const possibleDuplicates = transactions.filter(existing => isPotentialDuplicate(existing, t));

    if (possibleDuplicates.length > 0) {
      const sample = possibleDuplicates[0];
      const message = `נראה שיש כבר עסקה דומה:\n${formatDateDDMMYYYY(sample.date)} | ${sample.subCategory || sample.category} | ₪${sample.amount.toLocaleString()}\n\nהאם בכל זאת להוסיף עסקה חדשה?`;
      const shouldContinue = window.confirm(message);

      if (!shouldContinue) {
        return;
      }
    }

    const isFixedExpenseWithEndMonth = t.type === 'expense' && !!t.isFixed && !!t.fixedUntil;

    let transactionsToAdd: Transaction[] = [];

    if (isFixedExpenseWithEndMonth) {
      const baseMonth = (t.date || '').slice(0, 7);
      const endMonth = t.fixedUntil as string;
      const day = Number((t.date || '').split('-')[2] || '1');
      const months = buildMonthRangeInclusive(baseMonth, endMonth);

      transactionsToAdd = months
        .filter((monthKey) => {
          return !transactions.some((existing) => {
            const existingMonth = existing.date.slice(0, 7);
            return (
              existingMonth === monthKey &&
              existing.type === t.type &&
              existing.category === t.category &&
              existing.subCategory === t.subCategory &&
              existing.member === t.member &&
              (existing.paymentMethod || '') === (t.paymentMethod || '') &&
              (existing.cardType || '') === (t.cardType || '')
            );
          });
        })
        .map((monthKey) => {
          const [yearStr, monthStr] = monthKey.split('-');
          const year = Number(yearStr);
          const month1Based = Number(monthStr);
          const safeDay = Math.min(day, getDaysInMonth(year, month1Based));
          const date = `${monthKey}-${String(safeDay).padStart(2, '0')}`;

          return {
            ...t,
            date,
            id: crypto.randomUUID(),
          } as Transaction;
        });

      if (transactionsToAdd.length === 0) {
        alert('כל מופעי ההוצאה הקבועה כבר קיימים בטווח החודשים שנבחר.');
        return;
      }
    } else {
      transactionsToAdd = [{ ...t, id: crypto.randomUUID() } as Transaction];
    }

    const updated = [...transactionsToAdd, ...transactions];
    setTransactions(updated);
    await syncDataToCloud(updated, goals);
  };

  const updateTransaction = async (updatedT: Transaction) => {
    const updatedTransactions = transactions.map(t => t.id === updatedT.id ? updatedT : t);
    setTransactions(updatedTransactions);
    setEditingTransaction(null);
    await syncDataToCloud(updatedTransactions, goals);
  };

  const confirmDeleteTransaction = async (id: string) => {
    const updated = transactions.filter(t => t.id !== id);
    setTransactions(updated);
    setDeleteConfirmationId(null);
    if (editingTransaction?.id === id) setEditingTransaction(null);
    await syncDataToCloud(updated, goals);
  };

  const openStopFixedExpenseDialog = (baseTransaction: Transaction) => {
    setFixedStopDialog({
      transaction: baseTransaction,
      fromMonth: currentMonth,
      toMonth: currentMonth,
    });
  };

  const isSameFixedSeries = (t: Transaction, baseTransaction: Transaction) => {
    return (
      t.type === 'expense' &&
      t.isFixed &&
      t.category === baseTransaction.category &&
      t.subCategory === baseTransaction.subCategory &&
      t.member === baseTransaction.member &&
      (t.paymentMethod || '') === (baseTransaction.paymentMethod || '') &&
      (t.cardType || '') === (baseTransaction.cardType || '') &&
      (t.fixedUntil || '') === (baseTransaction.fixedUntil || '')
    );
  };

  const confirmStopFixedExpenseRange = async () => {
    if (!fixedStopDialog) return;

    const { transaction: baseTransaction, fromMonth, toMonth } = fixedStopDialog;

    if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) {
      alert('פורמט חודש לא תקין. יש לבחור חודש התחלה וחודש סיום.');
      return;
    }

    if (fromMonth > toMonth) {
      alert('חודש התחלה לא יכול להיות אחרי חודש סיום.');
      return;
    }

    const updated = transactions.filter((t) => {
      const sameSeries = isSameFixedSeries(t, baseTransaction);

      if (!sameSeries) return true;

      const txMonth = t.date.slice(0, 7);
      const isInRange = txMonth >= fromMonth && txMonth <= toMonth;
      return !isInRange;
    });

    const removedCount = transactions.length - updated.length;

    if (removedCount <= 0) {
      alert('לא נמצאו מופעים בטווח החודשים שנבחר.');
      return;
    }

    setTransactions(updated);
    setFixedStopDialog(null);
    if (editingTransaction && !updated.some((t) => t.id === editingTransaction.id)) {
      setEditingTransaction(null);
    }
    await syncDataToCloud(updated, goals);
    alert(`הוסרו ${removedCount} מופעים של ההוצאה הקבועה בין ${fromMonth} ל-${toMonth}.`);
  };

  const confirmStopFixedExpensePermanent = async () => {
    if (!fixedStopDialog) return;

    const { transaction: baseTransaction, fromMonth } = fixedStopDialog;

    if (!/^\d{4}-\d{2}$/.test(fromMonth)) {
      alert('פורמט חודש לא תקין. יש לבחור חודש התחלה.');
      return;
    }

    const shouldProceed = window.confirm(
      `להסיר לצמיתות את ההוצאה הקבועה "${baseTransaction.subCategory || baseTransaction.category}" מחודש ${fromMonth} והלאה?\nחודשים קודמים יישארו ללא שינוי.`
    );

    if (!shouldProceed) return;

    const updated = transactions.filter((t) => {
      if (!isSameFixedSeries(t, baseTransaction)) return true;
      const txMonth = t.date.slice(0, 7);
      return txMonth < fromMonth;
    });
    const removedCount = transactions.length - updated.length;

    if (removedCount <= 0) {
      alert('לא נמצאו מופעים להסרה.');
      return;
    }

    setTransactions(updated);
    setFixedStopDialog(null);
    if (editingTransaction && !updated.some((t) => t.id === editingTransaction.id)) {
      setEditingTransaction(null);
    }
    await syncDataToCloud(updated, goals);
    alert(`הוסרו לצמיתות ${removedCount} מופעים של ההוצאה הקבועה מחודש ${fromMonth} והלאה.`);
  };

  const addGoal = async (g: Omit<Goal, 'id'>) => {
    const newGoals = [...goals, { ...g, id: crypto.randomUUID() }];
    setGoals(newGoals);
    await syncDataToCloud(transactions, newGoals);
  };

  const updateGoal = async (id: string, amount: number) => {
    const newGoals = goals.map(g => g.id === id ? { ...g, currentAmount: amount } : g);
    setGoals(newGoals);
    await syncDataToCloud(transactions, newGoals);
  };

  const deleteGoal = async (id: string) => {
    const newGoals = goals.filter(g => g.id !== id);
    setGoals(newGoals);
    await syncDataToCloud(transactions, newGoals);
  };

  const handleSaveBudgets = (limits: BudgetLimit[]) => {
    setBudgetLimits(limits);
    localStorage.setItem(BUDGETS_KEY, JSON.stringify(limits));
  };

  const handleSaveCardMappings = (mappings: CardAccountMapping[]) => {
    setCardMappings(mappings);
    localStorage.setItem(CARD_MAPPINGS_KEY, JSON.stringify(mappings));
  };

  const handleGetAdvice = async () => {
    setAdvisorLoading(true);
    const result = await getFinancialAdvice(transactions, goals, summary);
    setAdvice(result);
    setAdvisorLoading(false);
  };

  const handleViewChange = (newView: typeof view) => {
    setView(newView);
    setEditingTransaction(null);
    setDeleteConfirmationId(null);
    setShowFixedOnly(false);
    setMemberFilter('all');
    setFixedStopDialog(null);
  };

  // Auth Handlers
  useEffect(() => {
    const initializeGoogleAuth = () => {
      if (window.google && window.google.accounts) {
        if (!GOOGLE_CLIENT_ID) {
          console.warn('Missing VITE_GOOGLE_CLIENT_ID. Google login is disabled.');
          return;
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse
        });

        renderGoogleSignInButton('google-signin-button-header', 220);
        renderGoogleSignInButton('google-signin-button-gate', 240);
      }
    };

    if (window.google) {
      initializeGoogleAuth();
    } else {
      window.addEventListener('load', initializeGoogleAuth);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      renderGoogleSignInButton('google-signin-button-header', 220);
      renderGoogleSignInButton('google-signin-button-gate', 240);
    }
  }, [user]);

  const handleCredentialResponse = (response: any) => {
    try {
      const decoded = decodeGoogleJwtPayload(response.credential);
      setUser(decoded);
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.credential);
    } catch {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      alert('Login failed: invalid Google credential response.');
    }
  };

  const handleLogin = () => {
    if (!GOOGLE_CLIENT_ID) {
      alert('Google Client ID is missing. Please set VITE_GOOGLE_CLIENT_ID in Vercel.');
      return;
    }

    if (window.google && window.google.accounts) {
      window.google.accounts.id.prompt((notification: any) => {
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
          alert('Google login popup was blocked or skipped. Please click the Google sign-in button.');
        }
      });
    } else {
      alert('Google Sign-In is not ready yet. Please refresh and try again.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setTransactions([]);
    setGoals([]);
    setAdvice('');
    setLastSync(null);
    setView('dashboard');
    setFixedStopDialog(null);
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    if (window.google && window.google.accounts) {
      window.google.accounts.id.disableAutoSelect();
    }
  };

  // Render Helpers
  const renderTransactionsTable = (type: TransactionType) => {
    let list = filteredTransactions.filter(t => t.type === type);

    // Apply Fixed Filter
    if (type === 'expense' && showFixedOnly) {
      list = list.filter(t => t.isFixed);
    }

    // Apply Member Filter
    if (memberFilter !== 'all') {
      list = list.filter(t => t.member === memberFilter);
    }

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-4 font-medium">תאריך</th>
                <th className="p-4 font-medium">קטגוריה</th>
                <th className="p-4 font-medium">פירוט</th>
                <th className="p-4 font-medium">שיוך</th>
                <th className="p-4 font-medium">סכום</th>
                <th className="p-4 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    לא נמצאו נתונים
                    {showFixedOnly ? ' קבועים' : ''}
                    {memberFilter !== 'all' ? ` עבור ${MEMBERS.find(m => m.id === memberFilter)?.label}` : ''}
                    {' '}לחודש זה
                  </td>
                </tr>
              ) : (
                list.map(t => (
                  <tr key={t.id} className={`hover:bg-gray-50 group ${editingTransaction?.id === t.id ? 'bg-blue-50' : ''}`}>
                    <td className="p-4 flex items-center gap-2">
                      {formatDateDDMMYYYY(t.date)}
                      {t.isFixed && (
                        <span title="הוצאה קבועה (מתחדשת אוטומטית)" className="text-blue-500 bg-blue-50 p-1 rounded-full">
                          <Pin size={12} className="fill-blue-500" />
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-xs font-medium">
                        {t.category}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">{t.subCategory}</td>
                    <td className="p-4 text-gray-500 text-xs">
                      {MEMBERS.find(m => m.id === t.member)?.label}
                    </td>
                    <td className={`p-4 font-bold ${type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      ₪{t.amount.toLocaleString()}
                    </td>
                    <td className="p-4">
                      {deleteConfirmationId === t.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => confirmDeleteTransaction(t.id)}
                            className="text-white bg-red-500 hover:bg-red-600 rounded p-1 transition-colors"
                            title="אשר מחיקה"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmationId(null)}
                            className="text-gray-500 hover:bg-gray-100 rounded p-1 transition-colors"
                            title="ביטול"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {type === 'expense' && t.isFixed && (
                            <button
                              onClick={() => openStopFixedExpenseDialog(t)}
                              className="text-gray-400 hover:text-amber-600 transition-colors p-1"
                              title="הסר קבועה לטווח חודשים"
                            >
                              <span className="text-xs font-bold">↺</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingTransaction(t);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                            title="ערוך"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmationId(t.id)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                            title="מחק שורה"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 hidden sm:block">
              MoneyWise
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Cloud Status */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={isSyncing || !isCloudMode || !user}
                className={`p-2 rounded-full transition-colors ${isCloudMode && user ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-300'}`}
                title={!user ? 'Login required to sync' : lastSync ? `סונכרן לאחרונה: ${lastSync.toLocaleTimeString()}` : 'לא סונכרן'}
              >
                {isSyncing ? <RefreshCw size={18} className="animate-spin" /> : (isCloudMode ? <Cloud size={18} /> : <CloudOff size={18} />)}
              </button>
            </div>

            <div className="h-6 w-px bg-gray-200 mx-1"></div>

            <button
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="p-2 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
              title={isDarkMode ? 'מצב בהיר' : 'מצב כהה'}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Date Controls */}
            <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-200 p-1" dir="ltr">
              <button
                onClick={() => changeMonth(-1)}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                title="חודש קודם"
              >
                <ChevronLeft size={20} />
              </button>

              <input
                type="month"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer border-none text-center w-32"
              />

              <button
                onClick={() => changeMonth(1)}
                className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                title="חודש הבא"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{user.name}</span>
                <button onClick={handleLogout} className="text-sm text-red-600 hover:underline">Logout</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div id="google-signin-button-header"></div>
                <button onClick={handleLogin} className="text-xs text-blue-700 hover:underline">פתיחה ידנית</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {user && (
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {[
              { id: 'dashboard', label: 'מבט על', icon: LayoutDashboard },
              { id: 'income', label: 'הכנסות', icon: TrendingUp },
              { id: 'expenses', label: 'הוצאות', icon: TrendingDown },
              { id: 'goals', label: 'יעדים', icon: Target },
              { id: 'advisor', label: 'יועץ חכם', icon: Bot },
              { id: 'settings', label: 'הגדרות', icon: SettingsIcon },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => handleViewChange(item.id as typeof view)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  view === item.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

        {!user && (
          <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-8 text-center mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-3">נדרשת התחברות</h2>
            <p className="text-gray-600 mb-6">כדי לצפות בנתונים האישיים, יש להתחבר עם חשבון Google מאושר.</p>
            <div className="flex flex-col items-center gap-3">
              <div id="google-signin-button-gate"></div>
              <button
                onClick={handleLogin}
                className="text-sm text-blue-700 hover:underline"
              >
                פתיחה ידנית של חלון התחברות
              </button>
            </div>
          </div>
        )}

        {user && view === 'dashboard' && (
          <div className="animate-fade-in space-y-6">
            <SummaryCards
              income={summary.totalIncome}
              expense={summary.totalExpenses}
              balance={summary.balance}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-800">התפלגות הוצאות</h3>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setExpenseChartType('pie')}
                      className={`p-1 rounded ${expenseChartType === 'pie' ? 'bg-white shadow text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                      title="תרשים עוגה"
                    >
                      <PieChart size={16} />
                    </button>
                    <button
                      onClick={() => setExpenseChartType('bar')}
                      className={`p-1 rounded ${expenseChartType === 'bar' ? 'bg-white shadow text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                      title="גרף עמודות"
                    >
                      <BarChart2 size={16} />
                    </button>
                  </div>
                </div>
                {expenseChartType === 'pie' ? (
                  <ExpensePieChart data={summary.expensesByCategory} />
                ) : (
                  <CategoryBarChart data={summary.expensesByCategory} />
                )}
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4">מאזן חודשי</h3>
                <BalanceBarChart income={summary.totalIncome} expense={summary.totalExpenses} />
              </div>
            </div>

            {/* Yearly Trend Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4">מגמה שנתית (12 חודשים אחרונים)</h3>
              <YearlyTrendChart data={yearlyData} />
            </div>

            {/* Budget limits compact view */}
            {budgetLimits.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <ShieldAlert size={18} className="text-orange-500" />
                  סטטוס תקציב חודשי
                </h3>
                <div className="space-y-3">
                  {budgetLimits.map(l => {
                    const spent = summary.expensesByCategory.find(e => e.name === l.category)?.value ?? 0;
                    const pct = Math.min((spent / l.limit) * 100, 100);
                    const isOver = spent > l.limit;
                    const isWarning = pct >= 80 && !isOver;
                    return (
                      <div key={l.category}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{l.category}</span>
                          <span className={isOver ? 'text-red-600 font-bold' : isWarning ? 'text-orange-600 font-medium' : 'text-gray-500'}>
                            {isOver
                              ? `חריגה ₪${(spent - l.limit).toLocaleString()}`
                              : `₪${spent.toLocaleString()} / ₪${l.limit.toLocaleString()}`}
                          </span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full transition-all ${isOver ? 'bg-red-500' : isWarning ? 'bg-orange-400' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {user && view === 'income' && (
          <div className="animate-fade-in">
            <TransactionForm
              onAdd={addTransaction}
              onUpdate={updateTransaction}
              onCancelEdit={() => setEditingTransaction(null)}
              editingTransaction={editingTransaction?.type === 'income' ? editingTransaction : null}
              type="income"
              transactions={transactions}
            />
            {renderTransactionsTable('income')}
          </div>
        )}

        {user && view === 'expenses' && (
          <div className="animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-gray-700 hidden md:block">ניהול הוצאות</h2>

              <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 items-center">
                {/* Member Filter */}
                <div className="relative">
                  <select
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value as Member | 'all')}
                    className="appearance-none bg-white border border-gray-200 text-gray-700 py-2 pr-8 pl-4 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-blue-400"
                  >
                    <option value="all">כל המשתמשים</option>
                    {MEMBERS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <Users size={16} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>

                <div className="h-6 w-px bg-gray-200 mx-1"></div>

                <button
                  onClick={() => setShowFixedOnly(!showFixedOnly)}
                  className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors border whitespace-nowrap ${showFixedOnly ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  <Filter size={16} />
                  {showFixedOnly ? 'רק קבועות' : 'סנן קבועות'}
                </button>

                <button
                  onClick={() => importFixedExpenses(false)}
                  className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-2 rounded-lg transition-colors whitespace-nowrap mr-auto md:mr-0"
                >
                  <Copy size={16} />
                  ייבא קבועות
                </button>
              </div>
            </div>

            <div className={showFixedOnly ? 'opacity-50 pointer-events-none filter blur-[1px]' : ''}>
              <TransactionForm
                onAdd={addTransaction}
                onUpdate={updateTransaction}
                onCancelEdit={() => setEditingTransaction(null)}
                editingTransaction={editingTransaction?.type === 'expense' ? editingTransaction : null}
                type="expense"
                transactions={transactions}
                cardMappings={cardMappings}
              />
            </div>

            {showFixedOnly && (
              <div className="bg-blue-50 text-blue-800 text-sm p-3 rounded-lg mb-4 flex items-start gap-2">
                <Pin size={16} className="mt-0.5" />
                <div>
                  <strong>מצב סינון:</strong> מוצגות רק הוצאות שסומנו כ-"קבועות".
                  <br />
                  כדי לבטל הוצאה קבועה: לחץ על העיפרון, בטל את ה-Check Box של "הוצאה קבועה" ושמור.
                </div>
              </div>
            )}

            {renderTransactionsTable('expense')}
          </div>
        )}

        {user && view === 'goals' && (
          <div className="animate-fade-in">
            <Goals
              goals={goals}
              onAddGoal={addGoal}
              onUpdateGoal={updateGoal}
              onDeleteGoal={deleteGoal}
            />
          </div>
        )}

        {user && view === 'advisor' && (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-8 text-white text-center">
                <Bot size={48} className="mx-auto mb-4 opacity-90" />
                <h2 className="text-2xl font-bold mb-2">היועץ הפיננסי האישי שלכם</h2>
                <p className="opacity-90">השתמשו בבינה מלאכותית כדי לנתח את התקציב שלכם ולקבל המלצות לשיפור.</p>
              </div>

              <div className="p-8">
                {!advice && !advisorLoading && (
                  <div className="text-center">
                    <p className="text-gray-600 mb-6">לחצו על הכפתור למטה כדי לסרוק את הנתונים הנוכחיים שלכם ולקבל דוח מותאם אישית.</p>
                    <button
                      onClick={handleGetAdvice}
                      className="bg-indigo-600 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-indigo-700 transition-transform active:scale-95"
                    >
                      נתח את התקציב שלי
                    </button>
                  </div>
                )}

                {advisorLoading && (
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <p className="text-indigo-600 font-medium">היועץ חושב...</p>
                  </div>
                )}

                {advice && !advisorLoading && (
                  <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                    <h3 className="font-bold text-indigo-900 mb-4 text-lg">המלצות עבורכם:</h3>
                    <div className="prose prose-indigo text-gray-800 whitespace-pre-wrap">
                      {advice}
                    </div>
                    <button
                      onClick={handleGetAdvice}
                      className="mt-6 text-sm text-indigo-600 font-medium hover:underline"
                    >
                      נסה שוב / רענן המלצות
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4">טיפים להתנהלות זוגית נכונה</h3>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex gap-2 items-start">
                  <span className="text-green-500 font-bold">✓</span>
                  קבעו "דייט פיננסי" אחת לחודש לעבור על ההוצאות יחד.
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-green-500 font-bold">✓</span>
                  הגדירו סכום "בזבוזים אישי" לכל אחד מכם שלא דורש דיווח.
                </li>
                <li className="flex gap-2 items-start">
                  <span className="text-green-500 font-bold">✓</span>
                  לפני קנייה גדולה (מעל 500 ש"ח), המתינו 24 שעות והתייעצו.
                </li>
              </ul>
            </div>
          </div>
        )}

        {user && view === 'settings' && (
          <Settings
            onSync={handleSync}
            transactions={transactions}
            currentMonth={currentMonth}
            budgetLimits={budgetLimits}
            expensesByCategory={summary.expensesByCategory}
            onSaveBudgets={handleSaveBudgets}
            cardMappings={cardMappings}
            onSaveCardMappings={handleSaveCardMappings}
          />
        )}

        {fixedStopDialog && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-2">הסרת הוצאה קבועה בטווח חודשים</h3>
              <p className="text-sm text-gray-600 mb-4">
                בחר טווח חודשים להסרה עבור:
                {' '}
                <span className="font-semibold text-gray-800">{fixedStopDialog.transaction.subCategory || fixedStopDialog.transaction.category}</span>
              </p>
              <p className="text-xs text-gray-500 mb-4">הסרה לצמיתות שומרת היסטוריה ישנה ומסירה מהחודש הנבחר והלאה בלבד.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">מחודש</label>
                  <input
                    type="month"
                    value={fixedStopDialog.fromMonth}
                    onChange={(e) => setFixedStopDialog((prev) => prev ? { ...prev, fromMonth: e.target.value } : prev)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">עד חודש</label>
                  <input
                    type="month"
                    value={fixedStopDialog.toMonth}
                    onChange={(e) => setFixedStopDialog((prev) => prev ? { ...prev, toMonth: e.target.value } : prev)}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setFixedStopDialog(null)}
                  className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                >
                  ביטול
                </button>
                <button
                  onClick={confirmStopFixedExpensePermanent}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                >
                  הסר לצמיתות (מהחודש הנבחר)
                </button>
                <button
                  onClick={confirmStopFixedExpenseRange}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white"
                >
                  הסר בטווח
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}