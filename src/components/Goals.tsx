import React, { useState } from 'react';
import type { Goal } from '../types';
import { Target, Trash2, PlusCircle, Check, X } from 'lucide-react';

interface Props {
  goals: Goal[];
  onAddGoal: (g: Omit<Goal, 'id'>) => void;
  onUpdateGoal: (id: string, amount: number) => void;
  onDeleteGoal: (id: string) => void;
}

export const Goals: React.FC<Props> = ({ goals, onAddGoal, onUpdateGoal, onDeleteGoal }) => {
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [newGoal, setNewGoal] = useState({
    name: '',
    targetAmount: '',
    currentAmount: '',
    deadline: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddGoal({
      name: newGoal.name,
      targetAmount: parseFloat(newGoal.targetAmount),
      currentAmount: parseFloat(newGoal.currentAmount || '0'),
      deadline: newGoal.deadline,
    });
    setShowForm(false);
    setNewGoal({ name: '', targetAmount: '', currentAmount: '', deadline: '' });
  };

  const calculateProgress = (current: number, target: number) => {
    return Math.min(100, Math.round((current / target) * 100));
  };

  const confirmDelete = (id: string) => {
    onDeleteGoal(id);
    setDeleteConfirmationId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Target className="text-blue-600" />
          יעדים פיננסיים
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusCircle size={18} />
          יעד חדש
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
           <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
             <div>
               <label className="text-xs text-gray-500 mb-1 block">שם היעד</label>
               <input
                required
                className="w-full p-2 border rounded-md"
                placeholder="חופשה, דירה..."
                value={newGoal.name}
                onChange={e => setNewGoal({...newGoal, name: e.target.value})}
               />
             </div>
             <div>
               <label className="text-xs text-gray-500 mb-1 block">סכום יעד</label>
               <input
                required
                type="number"
                className="w-full p-2 border rounded-md"
                placeholder="0"
                value={newGoal.targetAmount}
                onChange={e => setNewGoal({...newGoal, targetAmount: e.target.value})}
               />
             </div>
             <div>
               <label className="text-xs text-gray-500 mb-1 block">נחסך עד כה</label>
               <input
                type="number"
                className="w-full p-2 border rounded-md"
                placeholder="0"
                value={newGoal.currentAmount}
                onChange={e => setNewGoal({...newGoal, currentAmount: e.target.value})}
               />
             </div>
             <div>
               <label className="text-xs text-gray-500 mb-1 block">תאריך יעד</label>
               <input
                type="date"
                required
                className="w-full p-2 border rounded-md"
                value={newGoal.deadline}
                onChange={e => setNewGoal({...newGoal, deadline: e.target.value})}
               />
             </div>
             <button type="submit" className="bg-emerald-500 text-white p-2 rounded-md font-medium hover:bg-emerald-600">שמור</button>
           </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.map(goal => {
          const progress = calculateProgress(goal.currentAmount, goal.targetAmount);
          const gap = goal.targetAmount - goal.currentAmount;
          
          return (
            <div key={goal.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 relative group">
              
              {deleteConfirmationId === goal.id ? (
                 <div className="absolute top-4 left-4 flex items-center gap-1 bg-white shadow-md rounded p-1 z-10">
                    <button 
                      onClick={() => confirmDelete(goal.id)}
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
                <button 
                  onClick={() => setDeleteConfirmationId(goal.id)}
                  className="absolute top-4 left-4 text-gray-400 hover:text-red-500 transition-colors"
                  title="מחק יעד"
                >
                  <Trash2 size={18} />
                </button>
              )}
              
              <div className="flex justify-between items-start mb-2 pl-8">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">{goal.name}</h3>
                  <p className="text-xs text-gray-500">תאריך יעד: {new Date(goal.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500 block">נותר ליעד</span>
                  <span className="font-bold text-red-500">₪{gap.toLocaleString()}</span>
                </div>
              </div>

              <div className="mb-2">
                <div className="flex justify-between text-sm mb-1">
                  <span>{progress}% הושלמו</span>
                  <span className="font-medium">₪{goal.currentAmount.toLocaleString()} / ₪{goal.targetAmount.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t flex items-center gap-2">
                <span className="text-xs text-gray-500">עדכון חיסכון:</span>
                <input 
                  type="number" 
                  className="border rounded px-2 py-1 text-sm w-24"
                  placeholder="הוסף סכום"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      if (!isNaN(val)) {
                        onUpdateGoal(goal.id, goal.currentAmount + val);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <span className="text-[10px] text-gray-400">(לחץ אנטר להוספה)</span>
              </div>
            </div>
          );
        })}
        
        {goals.length === 0 && !showForm && (
          <div className="col-span-1 md:col-span-2 text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
            <p className="text-gray-500">אין יעדים מוגדרים עדיין. זה הזמן להתחיל לחלום!</p>
          </div>
        )}
      </div>
    </div>
  );
};