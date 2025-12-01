import React, { useState, useEffect } from 'react';
import { getAuth, signInAnonymously, signOut } from 'firebase/auth';

const LoginPage = ({ onLogin }) => {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);

    // Slideshow images - update these paths to match your actual images
    const slideshowImages = [
        '/src/assets/login-slideshow/slide1.png',
        '/src/assets/login-slideshow/slide2.png',
        '/src/assets/login-slideshow/slide3.png',
        '/src/assets/login-slideshow/slide4.png',
        '/src/assets/login-slideshow/slide5.png'
    ];

    // Fallback gradient if no images are available
    const fallbackGradients = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
    ];

    // Slideshow effect
    useEffect(() => {
        console.log('[Slideshow] Initializing slideshow with', slideshowImages.length, 'images');

        // Test if images are accessible (only log errors)
        slideshowImages.forEach((image, index) => {
            const img = new Image();
            img.onload = () => {
                // Only log on first load
                if (index === 0) {
                    console.log(`[Slideshow] Images loaded successfully`);
                }
            };
            img.onerror = () => console.log(`[Slideshow] Test: Image ${index + 1} is NOT accessible: ${image}`);
            img.src = image;
        });

        const interval = setInterval(() => {
            setCurrentSlide((prev) => {
                const next = (prev + 1) % slideshowImages.length;
                return next;
            });
        }, 2000); // Change slide every 2 seconds

        return () => clearInterval(interval);
    }, [slideshowImages.length]);

    const handleSignIn = async () => {
        setIsSigningIn(true);
        try {
            await onLogin();
        } catch (error) {
            console.error('Sign-in error:', error);
            setIsSigningIn(false);
        }
    };

    const handleClearSession = async () => {
        try {
            console.log('[LoginPage] Clearing existing session...');
            const { getAuth, signOut } = await import('firebase/auth');
            const auth = getAuth();
            if (auth.currentUser) {
                await signOut(auth);
                console.log('[LoginPage] Session cleared, page will refresh');
                window.location.reload();
            }
        } catch (error) {
            console.error('[LoginPage] Error clearing session:', error);
        }
    };

    return (
        <div className="relative flex items-center justify-center min-h-screen overflow-hidden">
            {/* Slideshow Background */}
            <div className="absolute inset-0 z-0">
                {/* Force show slide2 as background */}
                <div className="absolute inset-0 z-1">
                    <img
                        src={slideshowImages[1]}
                        alt="Background"
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                </div>

                {slideshowImages.map((image, index) => (
                    <div
                        key={index}
                        className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
                        style={{
                            opacity: index === currentSlide ? 1 : 0,
                            zIndex: index === currentSlide ? 2 : 0,
                            pointerEvents: index === currentSlide ? 'auto' : 'none'
                        }}
                    >
                        <img
                            src={image}
                            alt={`Slide ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.style.background = fallbackGradients[index];
                            }}
                        />
                        {/* Overlay for better text readability */}
                        <div className="absolute inset-0 bg-black bg-opacity-40"></div>
                    </div>
                ))}
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md p-8 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl transform transition-all hover:scale-105 duration-300 border border-white/20">
                <div className="flex flex-col items-center space-y-6">
                    {/* Logo or Icon */}
                    <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg mb-2 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>

                    <div className="text-center space-y-2">
                        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                            Welcome Back
                        </h1>
                        <p className="text-gray-500 text-sm font-medium">
                            Secure Payment Management System
                        </p>
                    </div>

                    <div className="w-full space-y-4">
                        <button
                            onClick={handleSignIn}
                            disabled={isSigningIn}
                            className={`w-full py-4 px-6 rounded-xl text-white font-bold text-lg shadow-lg transform transition-all duration-200 
                ${isSigningIn
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 hover:from-blue-600 hover:via-indigo-600 hover:to-purple-700 hover:shadow-xl hover:-translate-y-1 active:scale-95'
                                }`}
                        >
                            {isSigningIn ? (
                                <div className="flex items-center justify-center space-x-2">
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span>Signing In...</span>
                                </div>
                            ) : (
                                'Sign In to Dashboard'
                            )}
                        </button>

                        <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-gray-300"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">System Access</span>
                            <div className="flex-grow border-t border-gray-300"></div>
                        </div>

                        <div className="text-center">
                            <p className="text-xs text-gray-400">
                                Protected by enterprise-grade security
                            </p>
                            <button
                                onClick={handleClearSession}
                                className="mt-4 text-xs text-red-400 hover:text-red-600 underline"
                            >
                                Trouble signing in? Clear session
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="absolute bottom-4 text-white/60 text-xs text-center w-full z-10">
                &copy; {new Date().getFullYear()} Payment Management System. All rights reserved.
            </div>
        </div>
    );
};

export default LoginPage;
