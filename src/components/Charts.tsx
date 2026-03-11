import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface Props {
  expensesByCategory: { name: string; value: number }[];
  income: number;
  expense: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#6366f1'];

export const ExpensePieChart: React.FC<{ data: { name: string; value: number }[] }> = ({ data }) => {
  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">אין נתונים להצגה החודש</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
      </PieChart>
    </ResponsiveContainer>
  );
};

export const CategoryBarChart: React.FC<{ data: { name: string; value: number }[] }> = ({ data }) => {
  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">אין נתונים להצגה החודש</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart 
        layout="vertical" 
        data={data} 
        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis 
          dataKey="name" 
          type="category" 
          width={100} 
          tick={{fontSize: 12}} 
          interval={0}
        />
        <Tooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
           {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export const BalanceBarChart: React.FC<{ income: number; expense: number }> = ({ income, expense }) => {
  const data = [
    { name: 'הכנסות', amount: income },
    { name: 'הוצאות', amount: expense },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
        <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export const YearlyTrendChart: React.FC<{ data: { name: string; income: number; expense: number }[] }> = ({ data }) => {
  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">אין נתונים להצגה</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" fontSize={12} />
        <YAxis />
        <Tooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
        <Legend />
        <Bar dataKey="income" name="הכנסות" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="הוצאות" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};