'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

interface Item {
    id: string;
    text: string;
    url: string | null;
    checked: boolean;
    created_by: string | null;
    created_at: string;
    position: number;
}

interface ListData {
    id: string;
    name: string;
    icon: string;
    bg_url?: string | null;
    custom_icon_url?: string | null;
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
    const [newItemUrl, setNewItemUrl] = useState('');
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
            .order('position', { ascending: true })
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

        const maxPos = items.length > 0 ? Math.max(...items.map(i => i.position || 0)) : 0;

        const { error } = await supabase.from('items').insert({
            list_id: listId,
            text: newItemText.trim(),
            url: newItemUrl.trim() || null,
            created_by: user.id,
            position: maxPos + 1
        });

        if (!error) {
            setNewItemText('');
            setNewItemUrl('');
            fetchItems();
            inputRef.current?.focus();
        }
        setAdding(false);
    };

    const moveItem = async (item: Item, direction: 'up' | 'down') => {
        const relevantItems = item.checked ? items.filter(i => i.checked) : items.filter(i => !i.checked);
        const index = relevantItems.indexOf(item);

        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === relevantItems.length - 1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const targetItem = relevantItems[targetIndex];

        // Swap positions
        const tempPos = item.position;
        const { error: err1 } = await supabase
            .from('items')
            .update({ position: targetItem.position })
            .eq('id', item.id);

        const { error: err2 } = await supabase
            .from('items')
            .update({ position: tempPos })
            .eq('id', targetItem.id);

        if (!err1 && !err2) {
            fetchItems();
        }
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

    const [draggedItem, setDraggedItem] = useState<Item | null>(null);

    const onDragStart = (item: Item) => {
        setDraggedItem(item);
    };

    const onDragOver = (e: React.DragEvent, targetItem: Item) => {
        e.preventDefault();
        if (!draggedItem || draggedItem.id === targetItem.id) return;
        if (draggedItem.checked !== targetItem.checked) return;

        const relevantItems = targetItem.checked ? checkedItems : uncheckedItems;
        const newItems = [...items];
        const draggedIdx = newItems.findIndex(i => i.id === draggedItem.id);
        const targetIdx = newItems.findIndex(i => i.id === targetItem.id);

        newItems.splice(draggedIdx, 1);
        newItems.splice(targetIdx, 0, draggedItem);

        setItems(newItems);
    };

    const onDragEnd = async () => {
        if (!draggedItem) return;
        setDraggedItem(null);

        // Update all positions in background
        const relevantItems = draggedItem.checked ? items.filter(i => i.checked) : items.filter(i => !i.checked);
        const updates = relevantItems.map((item, index) => ({
            id: item.id,
            position: index,
            list_id: listId,
            text: item.text // included to satisfy potential RLS/validation
        }));

        const { error } = await supabase
            .from('items')
            .upsert(updates, { onConflict: 'id' });

        if (error) fetchItems();
    };

    const deleteItem = async (itemId: string) => {
        // Optimistic update
        setItems((prev) => prev.filter((i) => i.id !== itemId));

        const { error } = await supabase.from('items').delete().eq('id', itemId);

        if (error) {
            fetchItems(); // Revert on error
        }
    };

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedName, setEditedName] = useState('');
    const [uploading, setUploading] = useState<'bg' | 'icon' | null>(null);

    const updateListName = async () => {
        if (!editedName.trim() || editedName === list?.name) {
            setIsEditingTitle(false);
            return;
        }

        const { error } = await supabase
            .from('lists')
            .update({ name: editedName.trim() })
            .eq('id', listId);

        if (!error) {
            setList(prev => prev ? { ...prev, name: editedName.trim() } : null);
            setIsEditingTitle(false);
            showToast('Назву оновлено! ✨', 'success');
        }
    };

    const uploadMedia = async (file: File, type: 'bg' | 'icon') => {
        setUploading(type);
        const fileExt = file.name.split('.').pop();
        const fileName = `${listId}-${type}-${Math.random()}.${fileExt}`;
        const filePath = `list-media/${fileName}`;

        try {
            const { error: uploadError } = await supabase.storage
                .from('list-media')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('list-media')
                .getPublicUrl(fileName);

            const updateData = type === 'bg' ? { bg_url: publicUrl } : { custom_icon_url: publicUrl };
            const { error: dbError } = await supabase
                .from('lists')
                .update(updateData)
                .eq('id', listId);

            if (dbError) throw dbError;

            setList(prev => prev ? { ...prev, ...updateData } : null);
            showToast(type === 'bg' ? 'Фон оновлено! 🏞️' : 'Іконку оновлено! 🖼️', 'success');
        } catch (err: any) {
            showToast(err.message, 'error');
        }
        setUploading(null);
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
        <div
            className="container"
            style={list?.bg_url ? {
                backgroundImage: `url(${list.bg_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
            } : {}}
        >
            {/* Background Overlay if image exists */}
            {list?.bg_url && <div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(10px)',
                zIndex: -1
            }}></div>}

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
                {isEditingTitle ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                            type="text"
                            className="share-input"
                            style={{ fontSize: 24, fontWeight: 700, padding: '8px 12px' }}
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onBlur={updateListName}
                            onKeyDown={(e) => e.key === 'Enter' && updateListName()}
                            autoFocus
                        />
                    </div>
                ) : (
                    <h1
                        style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                        onClick={() => {
                            setEditedName(list?.name || '');
                            setIsEditingTitle(true);
                        }}
                    >
                        {list?.custom_icon_url ? (
                            <img
                                src={list.custom_icon_url}
                                alt=""
                                style={{ width: 40, height: 40, borderRadius: '25%', objectFit: 'cover' }}
                            />
                        ) : (
                            <span style={{ fontSize: 32 }}>{list?.icon}</span>
                        )}
                        {list?.name}
                        <span style={{ fontSize: 14, opacity: 0.5 }}>✎</span>
                    </h1>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                    <label className="icon-btn" style={{ fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}>
                        🖼️ {uploading === 'icon' ? '...' : 'Іконка з фото'}
                        <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], 'icon')}
                        />
                    </label>
                    <label className="icon-btn" style={{ fontSize: 12, padding: '4px 8px', cursor: 'pointer' }}>
                        🏞️ {uploading === 'bg' ? '...' : 'Свій фон'}
                        <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => e.target.files?.[0] && uploadMedia(e.target.files[0], 'bg')}
                        />
                    </label>
                </div>

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
                            className={`item-row ${draggedItem?.id === item.id ? 'dragging' : ''}`}
                            onClick={() => toggleItem(item)}
                            draggable
                            onDragStart={() => onDragStart(item)}
                            onDragOver={(e) => onDragOver(e, item)}
                            onDragEnd={onDragEnd}
                        >
                            <div className="item-checkbox"></div>
                            <div className="item-text-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <span className="item-text">{item.text}</span>
                                {item.url && (
                                    <a
                                        href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="item-link"
                                        style={{ fontSize: 12, color: 'var(--accent-light)', textDecoration: 'underline', marginTop: 2 }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        🔗 Посилання
                                    </a>
                                )}
                            </div>
                            <div className="item-actions">
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
                            className={`item-row checked ${draggedItem?.id === item.id ? 'dragging' : ''}`}
                            onClick={() => toggleItem(item)}
                            draggable
                            onDragStart={() => onDragStart(item)}
                            onDragOver={(e) => onDragOver(e, item)}
                            onDragEnd={onDragEnd}
                        >
                            <div className="item-checkbox">✓</div>
                            <div className="item-text-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <span className="item-text">{item.text}</span>
                                {item.url && (
                                    <a
                                        href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="item-link"
                                        style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline', marginTop: 2 }}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        🔗 Посилання
                                    </a>
                                )}
                            </div>
                            <div className="item-actions" style={{ display: 'flex', gap: 4 }}>
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
                        </div>
                    ))}
                </div>
            )}

            {/* Add Item Bar */}
            <div className="input-bar">
                <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                    {newItemText.trim() && (
                        <div className="animate-slide-up" style={{ display: 'flex', gap: 8 }}>
                            <input
                                type="text"
                                className="share-input"
                                style={{ flex: 1, borderRadius: 12, padding: '8px 14px', fontSize: 13 }}
                                placeholder="Додати посилання (не обов'язково)..."
                                value={newItemUrl}
                                onChange={(e) => setNewItemUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
