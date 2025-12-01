import React from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';

const Header = ({ title, onBack, onLogout, userId, actions }) => {
    return (
        <header className="bg-white p-6 rounded-xl shadow-md border-t-4 border-blue-500 mb-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    {onBack && (
                        <button
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                            onClick={onBack}
                        >
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    <h1 className="text-2xl font-bold">{title}</h1>
                </div>
                <div className="flex items-center space-x-4">
                    {userId && <span className="text-sm font-medium">UserID: {userId}</span>}
                    {actions}
                    {onLogout && (
                        <button
                            className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                            onClick={onLogout}
                        >
                            <LogOut size={16} />
                            <span>Logout</span>
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
