import React from 'react';
import Header from './Header';

const Layout = ({ children, title, onBack, onLogout, userId, headerActions }) => {
    return (
        <div className="p-4 font-sans text-gray-800 min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto">
                <Header
                    title={title}
                    onBack={onBack}
                    onLogout={onLogout}
                    userId={userId}
                    actions={headerActions}
                />
                <main>
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
