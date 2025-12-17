import React, { useState } from 'react';
import { Shield, Settings as SettingsIcon, Users, Bell } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import AuditLogViewer from '../components/audit/AuditLogViewer';
import { auth } from '../firebase-config';

/**
 * SettingsPage
 * Centralized settings page with tabs for different configuration areas
 */
const SettingsPage = ({ db, userId, appId, onNavigate, onLogout }) => {
    const [activeTab, setActiveTab] = useState('audit');

    // Get current user object from Firebase auth
    const getCurrentUser = () => {
        return auth.currentUser;
    };

    const tabs = [
        { id: 'general', label: 'General', icon: SettingsIcon },
        { id: 'audit', label: 'Audit Trail', icon: Shield },
        // Future tabs
        // { id: 'users', label: 'Users', icon: Users },
        // { id: 'notifications', label: 'Notifications', icon: Bell },
    ];

    return (
        <Layout
            title="Settings"
            userId={userId}
            onBack={() => onNavigate('dashboard')}
            onLogout={onLogout}
        >
            <div className="max-w-7xl mx-auto">

                {/* Tab Navigation */}
                <div className="bg-white rounded-xl shadow-md border border-slate-200 mb-6">
                    <div className="flex border-b border-slate-200">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors relative ${isActive
                                            ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                                            : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                                        }`}
                                >
                                    <Icon size={18} />
                                    {tab.label}
                                    {tab.id === 'audit' && isActive && (
                                        <span className="absolute top-2 right-2 w-2 h-2 bg-blue-600 rounded-full"></span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">

                    {/* General Tab */}
                    {activeTab === 'general' && (
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 mb-4">General Settings</h2>
                            <p className="text-slate-600 mb-6">Configure general application settings</p>

                            <div className="space-y-4">
                                <div className="border border-slate-200 rounded-lg p-4">
                                    <h3 className="font-bold text-slate-700 mb-2">Application Information</h3>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-slate-500">App ID:</span>
                                            <p className="font-mono text-slate-700">{appId}</p>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">Version:</span>
                                            <p className="text-slate-700">1.0.0</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="border border-slate-200 rounded-lg p-4">
                                    <h3 className="font-bold text-slate-700 mb-2">User Settings</h3>
                                    <p className="text-sm text-slate-500">Additional settings will appear here</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Audit Trail Tab */}
                    {activeTab === 'audit' && (
                        <div>
                            <AuditLogViewer
                                db={db}
                                appId={appId}
                                currentUser={getCurrentUser()}
                            />
                        </div>
                    )}

                    {/* Future: Users Tab */}
                    {activeTab === 'users' && (
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 mb-4">User Management</h2>
                            <p className="text-slate-600">User management features coming soon</p>
                        </div>
                    )}

                    {/* Future: Notifications Tab */}
                    {activeTab === 'notifications' && (
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 mb-4">Notification Settings</h2>
                            <p className="text-slate-600">Notification configuration coming soon</p>
                        </div>
                    )}

                </div>
            </div>
        </Layout>
    );
};

export default SettingsPage;
