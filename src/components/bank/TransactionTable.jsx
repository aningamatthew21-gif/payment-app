import React from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

const TransactionTable = ({ transactions, currency }) => {
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(Math.abs(amount));
    };

    const formatDate = (dateString) => {
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        return new Date(dateString).toLocaleDateString('en-US', options);
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-100 text-slate-600 uppercase text-xs font-semibold tracking-wider">
                        <th className="p-4 rounded-tl-lg">Date</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Description</th>
                        <th className="p-4 text-right">Amount</th>
                        <th className="p-4 text-right rounded-tr-lg">Balance</th>
                    </tr>
                </thead>
                <tbody className="text-sm text-slate-700">
                    {transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-4 whitespace-nowrap text-slate-500">
                                {formatDate(tx.date)}
                            </td>
                            <td className="p-4">
                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${tx.type === 'INFLOW'
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}>
                                    {tx.type === 'INFLOW' ? <ArrowDownLeft size={12} className="mr-1" /> : <ArrowUpRight size={12} className="mr-1" />}
                                    {tx.type}
                                </span>
                            </td>
                            <td className="p-4 font-medium">
                                {tx.description}
                                {tx.reference && (
                                    <span className="block text-xs text-slate-400 mt-0.5">Ref: {tx.reference}</span>
                                )}
                            </td>
                            <td className={`p-4 text-right font-mono font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                {tx.amount >= 0 ? '+' : '-'}{formatCurrency(tx.amount)}
                            </td>
                            <td className="p-4 text-right font-mono text-slate-600">
                                {formatCurrency(tx.balanceAfter)}
                            </td>
                        </tr>
                    ))}
                    {transactions.length === 0 && (
                        <tr>
                            <td colSpan="5" className="p-8 text-center text-slate-400">
                                No transactions found for this period.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default TransactionTable;
