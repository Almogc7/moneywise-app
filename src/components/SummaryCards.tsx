import React from 'react';
import { ArrowUpCircle, ArrowDownCircle, Wallet } from 'lucide-react';

interface SummaryCardsProps {
  income: number;
  expense: number;
  balance: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({ income, expense, balance }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-emerald-100 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">הכנסות החודש</p>
          <h3 className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(income)}</h3>
        </div>
        <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
          <ArrowUpCircle size={28} />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-red-100 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">הוצאות החודש</p>
          <h3 className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(expense)}</h3>
        </div>
        <div className="bg-red-100 p-3 rounded-full text-red-600">
          <ArrowDownCircle size={28} />
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-100 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">יתרה חודשית</p>
          <h3 className={`text-2xl font-bold mt-1 ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {formatCurrency(balance)}
          </h3>
        </div>
        <div className="bg-blue-100 p-3 rounded-full text-blue-600">
          <Wallet size={28} />
        </div>
      </div>
    </div>
  );
};