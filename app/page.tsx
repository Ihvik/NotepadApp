'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

interface ListItem {
  id: string;
  name: string;
  icon: string;
  custom_icon_url?: string | null;
  created_at: string;
  item_count?: number;
  unchecked_count?: number;
}

const ICONS = ['🛒', '✅', '📝', '🏠', '💊', '🎁', '📦', '🍕', '✈️', '💪', '📚', '🎯'];

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListIcon, setNewListIcon] = useState('📝');
  const [creating, setCreating] = useState(false);

  const fetchLists = useCallback(async () => {
    const { data: memberData } = await supabase
      .from('list_members')
      .select('list_id');

    if (!memberData || memberData.length === 0) {
      setLists([]);
      setLoading(false);
      return;
    }

    const listIds = memberData.map((m) => m.list_id);

    const { data: listsData } = await supabase
      .from('lists')
      .select('id, name, icon, custom_icon_url, created_at')
      .in('id', listIds)
      .order('created_at', { ascending: false });

    if (listsData) {
      // Get item counts for each list
      const listsWithCounts = await Promise.all(
        listsData.map(async (list) => {
          const { count: totalCount } = await supabase
            .from('items')
            .select('*', { count: 'exact', head: true })
            .eq('list_id', list.id);

          const { count: uncheckedCount } = await supabase
            .from('items')
            .select('*', { count: 'exact', head: true })
            .eq('list_id', list.id)
            .eq('checked', false);

          return {
            ...list,
            item_count: totalCount || 0,
            unchecked_count: uncheckedCount || 0,
          };
        })
      );
      setLists(listsWithCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
        return;
      }
      setUser(session.user);
      fetchLists();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router, fetchLists]);

  // Realtime subscription for lists
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('lists-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists' },
        () => fetchLists()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => fetchLists()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchLists]);

  const createList = async () => {
    if (!newListName.trim()) return;
    setCreating(true);

    const { data, error } = await supabase.rpc('create_list_with_member', {
      list_name: newListName.trim(),
      list_icon: newListIcon,
    });

    if (!error && data) {
      setShowModal(false);
      setNewListName('');
      setNewListIcon('📝');
      fetchLists();
    }
    setCreating(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
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

  return (
    <div className="container">
      <div className="header">
        <h1>Яриші</h1>
        <div className="header-actions">
          <button className="icon-btn accent" onClick={() => setShowModal(true)} title="Новий список">
            +
          </button>
          <button className="icon-btn" onClick={handleLogout} title="Вийти">
            🚪
          </button>
        </div>
      </div>

      {lists.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-title">Поки що порожньо</div>
          <div className="empty-text">
            Натисніть + щоб створити перший список покупок, справ чи будь-що інше
          </div>
        </div>
      ) : (
        <div className="lists-grid">
          {lists.map((list) => (
            <div
              key={list.id}
              className="card list-card"
              onClick={() => router.push(`/list/${list.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
            >
              <div className="list-icon" style={{ flexShrink: 0 }}>
                {list.custom_icon_url ? (
                  <img
                    src={list.custom_icon_url}
                    alt=""
                    style={{ width: 44, height: 44, borderRadius: '25%', objectFit: 'cover' }}
                  />
                ) : (
                  list.icon
                )}
              </div>
              <div className="list-info">
                <div className="list-name">{list.name}</div>
                <div className="list-meta">
                  {list.item_count === 0
                    ? 'Порожній список'
                    : `${list.unchecked_count} з ${list.item_count} залишилось`}
                </div>
              </div>
              <div className="list-arrow">›</div>
            </div>
          ))}
        </div>
      )}

      {/* Create List Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Новий список</div>
            <div className="modal-form">
              <div className="emoji-grid">
                {ICONS.map((icon) => (
                  <button
                    key={icon}
                    className={`emoji-option ${newListIcon === icon ? 'selected' : ''}`}
                    onClick={() => setNewListIcon(icon)}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="modal-input"
                placeholder="Назва списку..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createList()}
              />
              <div className="modal-actions">
                <button className="modal-btn" onClick={() => setShowModal(false)}>
                  Скасувати
                </button>
                <button
                  className="modal-btn primary"
                  onClick={createList}
                  disabled={!newListName.trim() || creating}
                >
                  {creating ? '⏳' : 'Створити'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
