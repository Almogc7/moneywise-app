import React, { useState } from 'react';
import { ShieldAlert, Plus, Trash2 } from 'lucide-react';
import type { BudgetLimit } from '../types';
import { CATEGORIES } from '../types';

interface Props {
  budgetLimits: BudgetLimit[];
  expensesByCategory: { name: string; value: number }[];
  onSave: (limits: BudgetLimit[]) => void;
}

export const BudgetLimits: React.FC<Props> = ({ budgetLimits, expensesByCategory, onSave }) => {
  const [limits, setLimits] = useState<BudgetLimit[]>(budgetLimits);
  const [newCategory, setNewCategory] = useState('');
  const [newLimit, setNewLimit] = useState('');

  const usedCategories = new Set(limits.map((l) => l.category));
  const availableCategories = CATEGORIES.expense.filter((c) => !usedCategories.has(c));

  const handleAdd = () => {
    if (!newCategory || !newLimit || parseFloat(newLimit) <= 0) return;

    const updated = [...limits, { category: newCategory, limit: parseFloat(newLimit) }];
    setLimits(updated);
    onSave(updated);
    setNewCategory('');
    setNewLimit('');
  };

  const handleDelete = (category: string) => {
    const updated = limits.filter((l) => l.category !== category);
    setLimits(updated);
    onSave(updated);
  };

  const handleLimitChange = (category: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    const updated = limits.map((l) => (l.category === category ? { ...l, limit: num } : l));
    setLimits(updated);
    onSave(updated);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <ShieldAlert className="text-orange-500" />
        תקציב לפי קטגוריה
      </h2>
      <p className="text-sm text-gray-500 mb-6">קבע מגבלת הוצאה חודשית לכל קטגוריה. יוצג סרגל התראה כשמתקרבים למגבלה.</p>

      <div className="space-y-4 mb-6">
        {limits.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-4">אין מגבלות תקציב עדיין. הוסף למטה.</p>
        )}
        {limits.map((l) => {
          const spent = expensesByCategory.find((e) => e.name === l.category)?.value ?? 0;
          const pct = Math.min((spent / l.limit) * 100, 100);
          const isOver = spent > l.limit;
          const isWarning = pct >= 80 && !isOver;

          return (
            <div key={l.category} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-800">{l.category}</span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-500">מגבלה: ₪</span>
                    <input
                      type="number"
                      min="0"
                      value={l.limit}
                      onChange={(e) => handleLimitChange(l.category, e.target.value)}
                      className="w-24 text-sm border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-orange-400 outline-none"
                    />
                  </div>
                  <button onClick={() => handleDelete(l.category)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all ${isOver ? 'bg-red-500' : isWarning ? 'bg-orange-400' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-xs font-semibold w-28 text-right ${isOver ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-gray-600'}`}>
                  {isOver
                    ? `חריגה ₪${(spent - l.limit).toLocaleString()}`
                    : `₪${spent.toLocaleString()} / ₪${l.limit.toLocaleString()}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {availableCategories.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">הוסף קטגוריה</h3>
          <div className="flex gap-2 flex-wrap">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="flex-1 min-w-32 p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
            >
              <option value="">בחר קטגוריה</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              placeholder="מגבלה ₪"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              className="w-32 p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={!newCategory || !newLimit}
              className="flex items-center gap-1 px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-40 transition-colors"
            >
              <Plus size={16} />
              הוסף
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
