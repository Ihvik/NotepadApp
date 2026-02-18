'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

interface Item {
    id: string;
    text: string;
    checked: boolean;
    created_by: string | null;
    created_at: string;
    position: number;
}

interface ListData {
    id: string;
    name: string;
    icon: string;
    created_by: string;
}

interface Member {
    user_id: string;
    email: string;
}

export default function ListPage() {
    const router = useRouter();
    const params = useParams();
    const listId = params.id as string;
    const inputRef = useRef<HTMLInputElement>(null);

    const [user, setUser] = useState<User | null>(null);
    const [list, setList] = useState<ListData | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [newItemText, setNewItemText] = useState('');
    const [adding, setAdding] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [shareEmail, setShareEmail] = useState('');
    const [sharing, setSharing] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchList = useCallback(async () => {
        const { data } = await supabase
            .from('lists')
            .select('*')
            .eq('id', listId)
            .single();

        if (data) {
            setList(data);
        } else {
            router.replace('/');
        }
    }, [listId, router]);

    const fetchItems = useCallback(async () => {
        const { data } = await supabase
            .from('items')
            .select('*')
            .eq('list_id', listId)
            .order('checked', { ascending: true })
            .order('created_at', { ascending: false });

        if (data) {
            setItems(data);
        }
    }, [listId]);

    const fetchMembers = useCallback(async () => {
        const { data } = await supabase
            .from('list_members')
            .select('user_id')
            .eq('list_id', listId);

        if (data) {
            const userIds = data.map((m) => m.user_id);
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, email')
                .in('id', userIds);

            if (profiles) {
                setMembers(profiles.map((p) => ({ user_id: p.id, email: p.email })));
            }
        }
    }, [listId]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                router.replace('/login');
                return;
            }
            setUser(session.user);
            Promise.all([fetchList(), fetchItems(), fetchMembers()]).then(() => {
                setLoading(false);
            });
        });
    }, [router, fetchList, fetchItems, fetchMembers]);

    // Realtime subscription for items
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel(`list-${listId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'items',
                    filter: `list_id=eq.${listId}`,
                },
                () => fetchItems()
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'list_members',
                    filter: `list_id=eq.${listId}`,
                },
                () => fetchMembers()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, listId, fetchItems, fetchMembers]);

    const addItem = async () => {
        if (!newItemText.trim() || !user) return;
        setAdding(true);

        const { error } = await supabase.from('items').insert({
            list_id: listId,
            text: newItemText.trim(),
            created_by: user.id,
        });

        if (!error) {
            setNewItemText('');
            fetchItems();
            inputRef.current?.focus();
        }
        setAdding(false);
    };

    const toggleItem = async (item: Item) => {
        // Optimistic update
        setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i))
        );

        const { error } = await supabase
            .from('items')
            .update({ checked: !item.checked })
            .eq('id', item.id);

        if (error) {
            // Revert on error
            setItems((prev) =>
                prev.map((i) => (i.id === item.id ? { ...i, checked: item.checked } : i))
            );
        }
    };

    const deleteItem = async (itemId: string) => {
        // Optimistic update
        setItems((prev) => prev.filter((i) => i.id !== itemId));

        const { error } = await supabase.from('items').delete().eq('id', itemId);

        if (error) {
            fetchItems(); // Revert on error
        }
    };

    const deleteList = async () => {
        if (!confirm('Видалити цей список?')) return;

        await supabase.from('lists').delete().eq('id', listId);
        router.replace('/');
    };

    const shareList = async () => {
        if (!shareEmail.trim()) return;
        setSharing(true);

        try {
            const { error } = await supabase.rpc('share_list_by_email', {
                target_list_id: listId,
                target_email: shareEmail.trim().toLowerCase(),
            });

            if (error) throw error;

            showToast('Список поділено! ✨', 'success');
            setShareEmail('');
            fetchMembers();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Помилка';
            if (message.includes('User not found')) {
                showToast('Користувача не знайдено', 'error');
            } else {
                showToast(message, 'error');
            }
        }
        setSharing(false);
    };

    const clearChecked = async () => {
        const checkedIds = items.filter((i) => i.checked).map((i) => i.id);
        if (checkedIds.length === 0) return;

        if (!confirm(`Видалити ${checkedIds.length} виконаних?`)) return;

        setItems((prev) => prev.filter((i) => !i.checked));

        await supabase.from('items').delete().in('id', checkedIds);
        fetchItems();
    };

    if (loading) {
        return (
            <div className="container">
                <div className="loading">
                    <div className="loading-dot"></div>
                    <div className="loading-dot"></div>
                    <div className="loading-dot"></div>
                </div>
            </div>
        );
    }

    const uncheckedItems = items.filter((i) => !i.checked);
    const checkedItems = items.filter((i) => i.checked);

    return (
        <div className="container">
            {/* Toast */}
            {toast && (
                <div className={`toast ${toast.type}`}>{toast.message}</div>
            )}

            {/* Header */}
            <div className="header">
                <a className="back-btn" onClick={() => router.push('/')}>
                    ← Назад
                </a>
                <div className="header-actions">
                    <button
                        className="icon-btn"
                        onClick={() => setShowShare(!showShare)}
                        title="Поділитися"
                    >
                        👥
                    </button>
                    {checkedItems.length > 0 && (
                        <button className="icon-btn" onClick={clearChecked} title="Видалити виконані">
                            🧹
                        </button>
                    )}
                    <button className="icon-btn danger" onClick={deleteList} title="Видалити список">
                        🗑
                    </button>
                </div>
            </div>

            {/* List Title */}
            <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 32 }}>{list?.icon}</span>
                    {list?.name}
                </h1>
                {items.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                        {uncheckedItems.length} з {items.length} залишилось
                    </div>
                )}
            </div>

            {/* Share Section */}
            {showShare && (
                <div className="card animate-slide-up" style={{ marginBottom: 16 }}>
                    <div className="share-title">Поділитися списком</div>
                    <div className="share-form">
                        <input
                            type="email"
                            className="share-input"
                            placeholder="Email іншого користувача..."
                            value={shareEmail}
                            onChange={(e) => setShareEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && shareList()}
                        />
                        <button className="share-btn" onClick={shareList} disabled={!shareEmail.trim() || sharing}>
                            {sharing ? '⏳' : 'Додати'}
                        </button>
                    </div>
                    {members.length > 0 && (
                        <div className="members-list">
                            {members.map((m) => (
                                <div key={m.user_id} className="member-chip">
                                    <span className="member-dot"></span>
                                    {m.email}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Items */}
            {items.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">✨</div>
                    <div className="empty-title">Список порожній</div>
                    <div className="empty-text">Додайте перший елемент нижче</div>
                </div>
            ) : (
                <div className="items-list">
                    {uncheckedItems.map((item) => (
                        <div
                            key={item.id}
                            className="item-row"
                            onClick={() => toggleItem(item)}
                        >
                            <div className="item-checkbox"></div>
                            <span className="item-text">{item.text}</span>
                            <button
                                className="item-delete"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteItem(item.id);
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}

                    {checkedItems.length > 0 && uncheckedItems.length > 0 && (
                        <div style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '12px 0 4px',
                            fontWeight: 600
                        }}>
                            Виконані ({checkedItems.length})
                        </div>
                    )}

                    {checkedItems.map((item) => (
                        <div
                            key={item.id}
                            className="item-row checked"
                            onClick={() => toggleItem(item)}
                        >
                            <div className="item-checkbox">✓</div>
                            <span className="item-text">{item.text}</span>
                            <button
                                className="item-delete"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteItem(item.id);
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Item Bar */}
            <div className="input-bar">
                <div className="input-bar-inner">
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Додати елемент..."
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addItem()}
                    />
                    <button onClick={addItem} disabled={!newItemText.trim() || adding}>
                        +
                    </button>
                </div>
            </div>
        </div>
    );
}
