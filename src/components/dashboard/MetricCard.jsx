import React from 'react';
import { safeToFixed } from '../../utils/formatters';

/**
 * MetricCard Component
 * Displays financial metrics with visual indicators
 * Supports different types: total (blue), spent (red), available (green)
 */
const MetricCard = ({ label, value, type = 'total' }) => {
    // Determine color scheme based on type
    const getColorClasses = () => {
        switch (type) {
            case 'spent':
                return {
                    text: 'text-red-600',
                    bar: 'bg-red-500',
                    bg: 'bg-red-50/50',
                    label: 'text-red-700'
                };
            case 'available':
                return {
                    text: 'text-green-600',
                    bar: 'bg-green-500',
                    bg: 'bg-green-50/50',
                    label: 'text-green-700'
                };
            default: // 'total'
                return {
                    text: 'text-blue-900',
                    bar: 'bg-blue-600',
                    bg: 'bg-blue-50/50',
                    label: 'text-blue-700'
                };
        }
    };

    const colors = getColorClasses();

    // Calculate percentage for progress bar (mock - you can make this dynamic)
    const percentage = type === 'spent' ? 55 : type === 'available' ? 72 : 100;

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${colors.label}`}>
                {label}
            </h3>
            <p className={`text-3xl font-bold mb-4 ${colors.text}`}>
                ${safeToFixed(value)}
            </p>

            {/* Decorative progress indicator */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`h-full ${colors.bar} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {/* Optional: Add trend indicator */}
            <div className="mt-2 text-xs text-slate-400">
                {type === 'spent' && '↑ From last period'}
                {type === 'available' && '→ Steady'}
                {type === 'total' && 'YTD allocation'}
            </div>
        </div>
    );
};

export default MetricCard;
