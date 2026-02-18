'use client';
import { useState, useEffect } from 'react';
export default function OfflineIndicator() {
    const [isOffline, setIsOffline] = useState(false);
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        // Initial check
        if (!navigator.onLine) {
            setIsOffline(true);
        }
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        // Check if worker is registered for potential future use
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then(
                    (registration) => {
                        console.log('SW registered: ', registration);
                    },
                    (error) => {
                        console.log('SW registration failed: ', error);
                    }
                );
            });
        }
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);
    if (!isOffline) return null;
    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                background: 'var(--danger)',
                color: 'white',
                padding: '8px 16px',
                textAlign: 'center',
                fontSize: '14px',
                fontWeight: '500',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                animation: 'slideDown 0.3s ease-out'
            }}
        >
            <span>📴</span>
            <span>Ви в офлайні. Деякі функції можуть бути недоступні.</span>
        </div>
    );
}
