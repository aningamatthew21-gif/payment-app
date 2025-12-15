import React from 'react';

/**
 * ActionCard Component
 * Reusable professional action button for dashboard operations
 * Supports primary (filled blue) and secondary (white with hover) variants
 */
const ActionCard = ({
    icon: Icon,
    title,
    description,
    onClick,
    primary = false
}) => {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-start p-6 rounded-xl border transition-all duration-200 text-left w-full
        ${primary
                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl transform hover:-translate-y-0.5'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:shadow-md'
                }`}
        >
            <div className={`p-3 rounded-lg mb-3 ${primary ? 'bg-blue-500/30' : 'bg-slate-50'}`}>
                <Icon size={24} className={primary ? 'text-white' : 'text-blue-600'} />
            </div>
            <span className={`font-bold text-lg mb-1 ${primary ? 'text-white' : 'text-slate-800'}`}>
                {title}
            </span>
            {description && (
                <span className={`text-sm ${primary ? 'text-blue-100' : 'text-slate-500'}`}>
                    {description}
                </span>
            )}
        </button>
    );
};

export default ActionCard;
