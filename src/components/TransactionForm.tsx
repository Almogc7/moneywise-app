import React, { useState, useEffect, useMemo } from 'react';
import type { Transaction, TransactionType } from '../types';
import { CATEGORIES, MEMBERS, PAYMENT_METHODS, CARD_TYPES } from '../types';
import { Plus, Loader2, Save, X, MessageSquare, Sparkles } from 'lucide-react';
import { parseTransactionFromSMS } from '../services/geminiService';

interface Props {
  onAdd: (t: Omit<Transaction, 'id'>) => Promise<void> | void;
  onUpdate?: (t: Transaction) => Promise<void> | void;
  onCancelEdit?: () => void;
  editingTransaction?: Transaction | null;
  type: TransactionType;
  transactions?: Transaction[]; // For suggestions
}

export const TransactionForm: React.FC<Props> = ({ onAdd, onUpdate, onCancelEdit, editingTransaction, type, transactions = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSmsPanel, setShowSmsPanel] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [isSmsLoading, setIsSmsLoading] = useState(false);
  const [smsError, setSmsError] = useState('');
  
  const defaultFormData = {
    date: new Date().toISOString().split('T')[0],
    category: '',
    subCategory: '',
    amount: '',
    member: 'joint',
    paymentMethod: 'credit',
    cardType: '',
    isFixed: false,
    notes: ''
  };

  const [formData, setFormData] = useState(defaultFormData);

  // Generate suggestions for SubCategory based on history
  const subCategorySuggestions = useMemo(() => {
    const history = transactions
      .filter(t => t.type === type && t.subCategory) // Filter by current type (income/expense)
      .map(t => t.subCategory);
    
    // Return unique values sorted
    return Array.from(new Set(history)).sort();
  }, [transactions, type]);

  // Effect to populate form when editingTransaction changes
  useEffect(() => {
    if (editingTransaction) {
      setFormData({
        date: editingTransaction.date,
        category: editingTransaction.category,
        subCategory: editingTransaction.subCategory,
        amount: editingTransaction.amount.toString(),
        member: editingTransaction.member,
        paymentMethod: editingTransaction.paymentMethod || 'credit',
        cardType: editingTransaction.cardType || '',
        isFixed: editingTransaction.isFixed || false,
        notes: editingTransaction.notes
      });
      setIsOpen(true);
    } else {
      setFormData(defaultFormData);
      setIsOpen(false);
    }
  }, [editingTransaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const transactionData: any = {
        date: formData.date,
        type: type,
        category: formData.category || (type === 'income' ? 'אחר' : 'שונות'),
        subCategory: formData.subCategory,
        amount: parseFloat(formData.amount),
        member: formData.member as any,
        notes: formData.notes
      };

      if (type === 'expense') {
        transactionData.paymentMethod = formData.paymentMethod;
        transactionData.isFixed = formData.isFixed;
        if (formData.paymentMethod === 'credit') {
           transactionData.cardType = formData.cardType;
        }
      }

      if (editingTransaction && onUpdate) {
        await onUpdate({
          id: editingTransaction.id,
          ...transactionData
        });
      } else {
        await onAdd(transactionData);
        // Reset only on Add (Update is handled by parent closing/resetting via prop change)
        setFormData(prev => ({ ...prev, amount: '', notes: '', subCategory: '' }));
        setIsOpen(false);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSmsFill = async () => {
    if (!smsText.trim()) return;
    setIsSmsLoading(true);
    setSmsError('');
    try {
      const parsed = await parseTransactionFromSMS(smsText);
      setFormData(prev => ({
        ...prev,
        ...(parsed.amount ? { amount: parsed.amount } : {}),
        ...(parsed.category ? { category: parsed.category } : {}),
        ...(parsed.subCategory ? { subCategory: parsed.subCategory } : {}),
        ...(parsed.date ? { date: parsed.date } : {}),
        ...(parsed.paymentMethod ? { paymentMethod: parsed.paymentMethod } : {}),
      }));
      setShowSmsPanel(false);
      setSmsText('');
    } catch {
      setSmsError('לא הצלחתי לנתח את ה-SMS. בדוק את הטקסט ונסה שוב.');
    } finally {
      setIsSmsLoading(false);
    }
  };

  const handleCancel = () => {
    if (editingTransaction && onCancelEdit) {
      onCancelEdit();
    } else {
      setIsOpen(false);
      setFormData(defaultFormData);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white shadow transition-transform active:scale-95 ${
          type === 'income' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
        }`}
      >
        <Plus size={20} />
        <span>הוסף {type === 'income' ? 'הכנסה' : 'הוצאה'}</span>
      </button>
    );
  }

  const isEditMode = !!editingTransaction;

  return (
    <div className={`bg-white p-6 rounded-xl shadow-lg border mb-6 relative ${isEditMode ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'}`}>
      
      {isEditMode && (
        <div className="absolute top-0 right-0 left-0 bg-blue-50 text-blue-700 text-xs py-1 px-4 rounded-t-xl text-center font-medium">
          מצב עריכה
        </div>
      )}

      <h3 className={`text-lg font-bold mb-4 ${isEditMode ? 'text-blue-700 mt-2' : 'text-gray-800'}`}>
        {isEditMode 
          ? `עריכת ${type === 'income' ? 'הכנסה' : 'הוצאה'}`
          : `הוספת ${type === 'income' ? 'הכנסה חדשה' : 'הוצאה חדשה'}`
        }
      </h3>
      
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">תאריך</label>
          <input
            type="date"
            required
            value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
          <input
            type="number"
            required
            min="0"
            step="0.01"
            value={formData.amount}
            onChange={e => setFormData({ ...formData, amount: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה</label>
          <select
            required
            value={formData.category}
            onChange={e => setFormData({ ...formData, category: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">בחר קטגוריה</option>
            {CATEGORIES[type].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">תת-קטגוריה / פירוט</label>
          <input
            type="text"
            list={`subCategory-suggestions-${type}`}
            value={formData.subCategory}
            onChange={e => setFormData({ ...formData, subCategory: e.target.value })}
            placeholder="לדוגמה: רמי לוי, דלק, בונוס שנתי"
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            autoComplete="off"
          />
          <datalist id={`subCategory-suggestions-${type}`}>
            {subCategorySuggestions.map((suggestion, index) => (
              <option key={index} value={suggestion} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">שיוך (מי שילם/הרוויח)</label>
          <select
            value={formData.member}
            onChange={e => setFormData({ ...formData, member: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {MEMBERS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        {type === 'expense' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">אמצעי תשלום</label>
              <select
                value={formData.paymentMethod}
                onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            {formData.paymentMethod === 'credit' && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-1">סוג כרטיס</label>
                <select
                  value={formData.cardType}
                  onChange={e => setFormData({ ...formData, cardType: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">בחר כרטיס</option>
                  {CARD_TYPES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            rows={2}
          />
        </div>

        {type === 'expense' && (
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => { setShowSmsPanel(v => !v); setSmsError(''); }}
              className="text-sm flex items-center gap-1.5 text-purple-600 hover:text-purple-800 transition-colors"
            >
              <MessageSquare size={14} />
              {showSmsPanel ? 'סגור ניתוח SMS' : 'מלא אוטומטית מ-SMS'}
            </button>
            {showSmsPanel && (
              <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                <p className="text-xs text-purple-700">הדבק SMS מבנק / כרטיס אשראי — הבינה המלאכותית תמלא את הפרטים אוטומטית.</p>
                <textarea
                  value={smsText}
                  onChange={e => setSmsText(e.target.value)}
                  placeholder="לדוגמה: חיוב כרטיס 1234 ב-250 ₪ בתאריך 01/07/25 - רמי לוי"
                  className="w-full p-2 border border-purple-300 rounded text-sm focus:ring-2 focus:ring-purple-400 outline-none"
                  rows={3}
                />
                {smsError && <p className="text-red-500 text-xs">{smsError}</p>}
                <button
                  type="button"
                  onClick={handleSmsFill}
                  disabled={isSmsLoading || !smsText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {isSmsLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {isSmsLoading ? 'מנתח...' : 'ניתוח אוטומטי 🤖'}
                </button>
              </div>
            )}
          </div>
        )}

        {type === 'expense' && (
           <div className="flex items-center gap-2 md:col-span-2">
             <input
               type="checkbox"
               id="isFixed"
               checked={formData.isFixed}
               onChange={e => setFormData({...formData, isFixed: e.target.checked})}
               className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
             />
             <label htmlFor="isFixed" className="text-sm text-gray-700">זוהי הוצאה קבועה חודשית (כמו שכ״ד, ארנונה, נטפליקס)</label>
           </div>
        )}

        <div className="md:col-span-2 flex justify-end gap-3 mt-4 pt-2 border-t">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <X size={18} />
            ביטול
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-6 py-2 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-70 ${isEditMode ? 'bg-blue-600 hover:bg-blue-700' : (type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700')}`}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={20}/> : <Save size={18} />}
            {isSubmitting ? 'שומר...' : (isEditMode ? 'עדכן עסקה' : `שמור ${type === 'income' ? 'הכנסה' : 'הוצאה'}`)}
          </button>
        </div>
      </form>
    </div>
  );
};