'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.replace('/');
        });
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                router.replace('/');
            } else {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                setSuccess('Перевірте свою електронну пошту для підтвердження реєстрації!');
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Щось пішло не так';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="card auth-card animate-fade-in">
                <div className="auth-logo">📋</div>
                <h1 className="auth-title">Спільні Списки</h1>
                <p className="auth-subtitle">
                    {isLogin ? 'Увійдіть, щоб побачити свої списки' : 'Створіть акаунт для спільних списків'}
                </p>

                <form className="auth-form" onSubmit={handleSubmit}>
                    {error && <div className="auth-error">{error}</div>}
                    {success && <div className="auth-success">{success}</div>}

                    <input
                        type="email"
                        className="auth-input"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />

                    <input
                        type="password"
                        className="auth-input"
                        placeholder="Пароль (мін. 6 символів)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                    />

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? '⏳' : isLogin ? 'Увійти' : 'Зареєструватися'}
                    </button>
                </form>

                <div className="auth-toggle">
                    {isLogin ? 'Немає акаунту? ' : 'Вже маєте акаунт? '}
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); }}>
                        {isLogin ? 'Зареєструватися' : 'Увійти'}
                    </button>
                </div>
            </div>
        </div>
    );
}
