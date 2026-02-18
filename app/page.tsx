'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
interface ListItem {
  id: string;
  name: string;
  icon: string;
  custom_icon_url?: string | null;
  position: number;
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
  const [isSorting, setIsSorting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState('');
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
      .select('id, name, icon, custom_icon_url, position, created_at')
      .in('id', listIds)
      .order('position', { ascending: true })
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
          } as ListItem;
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
  const saveNewPositions = async (updatedLists: ListItem[]) => {
    const updates = updatedLists.map((list, index) => ({
      id: list.id,
      position: index,
      name: list.name,
      created_by: user?.id
    }));
    const { error } = await supabase
      .from('lists')
      .upsert(updates, { onConflict: 'id' });
    if (error) fetchLists();
  };
  const moveList = (listToMove: ListItem, direction: 'up' | 'down') => {
    const currentIndex = lists.findIndex(list => list.id === listToMove.id);
    if (currentIndex === -1) return;
    const newLists = [...lists];
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < newLists.length) {
      const [removed] = newLists.splice(currentIndex, 1);
      newLists.splice(newIndex, 0, removed);
      setLists(newLists);
      saveNewPositions(newLists);
    }
  };
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
  const updateListName = async (listId: string) => {
    if (!editingListName.trim()) {
      setEditingListId(null);
      return;
    }
    const { error } = await supabase
      .from('lists')
      .update({ name: editingListName.trim() })
      .eq('id', listId);
    if (!error) {
      setLists(prev => prev.map(l => l.id === listId ? { ...l, name: editingListName.trim() } : l));
    }
    setEditingListId(null);
  };
  const handleLogout = async () => {
    if (!confirm('Ви дійсно хочете вийти?')) return;
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
          <button
            className={`icon-btn ${isEditing ? 'accent' : ''}`}
            onClick={() => {
              setIsEditing(!isEditing);
              setIsSorting(false);
            }}
            title="Редагувати"
            style={{ fontSize: 16 }}
          >
            ✎
          </button>
          <button
            className={`icon-btn ${isSorting ? 'accent' : ''}`}
            onClick={() => {
              setIsSorting(!isSorting);
              setIsEditing(false);
            }}
            title="Сортувати"
            style={{ fontSize: 16 }}
          >
            ⇅
          </button>
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
              onClick={() => {
                if (isEditing) {
                  setEditingListId(list.id);
                  setEditingListName(list.name);
                } else if (!isSorting) {
                  router.push(`/list/${list.id}`);
                }
              }}
              style={{
                cursor: isSorting ? 'default' : 'pointer',
                border: isEditing ? '1px dashed var(--accent)' : ''
              }}
            >
              <div className="list-icon">
                {list.custom_icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={list.custom_icon_url}
                    alt=""
                    style={{ width: '100%', height: '100%', borderRadius: 12, objectFit: 'cover' }}
                  />
                ) : (
                  list.icon
                )}
              </div>
              <div className="list-info" style={{ flex: 1 }}>
                {editingListId === list.id ? (
                  <input
                    type="text"
                    className="share-input"
                    style={{ fontSize: 18, fontWeight: 600, padding: '4px 8px', width: '100%' }}
                    value={editingListName}
                    onChange={(e) => setEditingListName(e.target.value)}
                    onBlur={() => updateListName(list.id)}
                    onKeyDown={(e) => e.key === 'Enter' && updateListName(list.id)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="list-name">
                    {list.name}
                    {isEditing && <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.5 }}>✎</span>}
                  </div>
                )}
                <div className="list-meta">
                  {list.item_count === 0
                    ? 'Порожній список'
                    : `${list.unchecked_count} з ${list.item_count} залишилось`}
                </div>
              </div>
              {isSorting ? (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="item-action-btn"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', width: 44, height: 44, fontSize: 20 }}
                    onClick={(e) => { e.stopPropagation(); moveList(list, 'up'); }}
                    disabled={lists.findIndex(l => l.id === list.id) === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="item-action-btn"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer', width: 44, height: 44, fontSize: 20 }}
                    onClick={(e) => { e.stopPropagation(); moveList(list, 'down'); }}
                    disabled={lists.findIndex(l => l.id === list.id) === lists.length - 1}
                  >
                    ↓
                  </button>
                </div>
              ) : (
                <div className="list-arrow">›</div>
              )}
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
