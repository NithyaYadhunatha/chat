'use client';


import { useState, FormEvent } from 'react';
import { useStore } from '@/lib/store';
import api from '@/lib/api';


export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  const { currentUser, setCurrentUser } = useStore();
  const [username, setUsername] = useState(currentUser?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar_url ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError('');
    try {
      const { data } = await api.patch('/users/me', {
        username: username || undefined,
        avatar_url: avatarUrl || undefined,
      });
      setCurrentUser(data);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  const initials = currentUser?.username?.slice(0, 2).toUpperCase() ?? '';

  return (
    <div className="flex flex-col h-full bg-gray-900 overflow-y-auto pb-20 md:pb-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white">Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account</p>
      </div>

      <div className="px-6 py-8 max-w-lg mx-auto w-full space-y-8">
        {/* Avatar preview */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white overflow-hidden ring-4 ring-gray-800">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" onError={() => setAvatarUrl('')} />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="text-center">
            <p className="text-white font-semibold">{currentUser?.username}</p>
            <p className="text-sm text-gray-500">{currentUser?.email}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 bg-gray-800 rounded-2xl p-6 border border-gray-700">
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-sm text-emerald-400 animate-fade-in">
              Profile updated successfully!
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 animate-fade-in">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300" htmlFor="profile-username">Username</label>
            <input
              id="profile-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-150"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300" htmlFor="profile-avatar">Avatar URL</label>
            <input
              id="profile-avatar"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-150"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-300">Email</label>
            <input
              disabled
              value={currentUser?.email ?? ''}
              className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-600">Email cannot be changed</p>
          </div>

          <button
            id="save-profile"
            type="submit"
            disabled={saving}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition-all duration-150 active:scale-[0.98]"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
