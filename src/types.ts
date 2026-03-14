export type TransactionType = 'income' | 'expense';
export type PaymentMethod = 'credit' | 'cash' | 'transfer' | 'bit' | 'check';
export type CardType = 'visa' | 'diners' | 'isracard' | 'max' | 'hitechzone';
export type Member = 'almog' | 'amit' | 'joint';
export type AppMode = 'local' | 'cloud';

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  subCategory: string;
  amount: number;
  member: Member;
  paymentMethod?: PaymentMethod; // Only for expenses generally
  cardType?: CardType; // Only if paymentMethod is credit
  isFixed?: boolean; // For expenses
  fixedUntil?: string; // YYYY-MM, inclusive end month for fixed expenses
  notes: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  icon?: string;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  expensesByCategory: { name: string; value: number }[];
}

export interface BudgetLimit {
  category: string;
  limit: number;
}

export interface CardAccountMapping {
  suffix: string;
  member: Member;
  paymentMethod?: PaymentMethod;
  cardType?: CardType;
  label?: string;
}

export const CATEGORIES = {
  income: ['משכורת', 'בונוס', 'החזר', 'קצבת ילדים', 'השקעות', 'אחר'],
  expense: [
    'דיור',
    'מזון וסופר',
    'רכב ותחבורה',
    'חשבונות',
    'ילדים',
    'בילויים ומסעדות',
    'בריאות',
    'ביטוחים',
    'קניות והלבשה',
    'חיסכון והשקעות',
    'חופשות',
    'שונות'
  ]
};

export const MEMBERS = [
  { id: 'almog', label: 'אלמוג' },
  { id: 'amit', label: 'עמית' },
  { id: 'joint', label: 'משותף' }
];

export const PAYMENT_METHODS = [
  { id: 'credit', label: 'כרטיס אשראי' },
  { id: 'cash', label: 'מזומן' },
  { id: 'transfer', label: 'העברה בנקאית' },
  { id: 'bit', label: 'אפליקציית תשלום' },
  { id: 'check', label: 'צ׳ק' }
];

export const CARD_TYPES = [
  { id: 'visa', label: 'VISA' },
  { id: 'diners', label: 'Diners' },
  { id: 'isracard', label: 'Isracard' },
  { id: 'max', label: 'MAX' },
  { id: 'hitechzone', label: 'Hitechzone' }
];