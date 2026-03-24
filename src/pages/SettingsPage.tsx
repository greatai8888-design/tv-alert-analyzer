import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setPwMsg('密碼至少需要 6 個字元')
      return
    }
    setPwLoading(true)
    setPwMsg('')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPwMsg('密碼已更新成功')
      setNewPassword('')
    } catch (err: unknown) {
      setPwMsg(err instanceof Error ? err.message : '更新失敗')
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="serif-heading text-[32px] md:text-[38px] text-on-surface mb-8">設定</h1>

      {/* Account Info */}
      <section className="bg-white rounded-xl border border-border p-5 mb-6 editorial-shadow">
        <h2 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">person</span>
          帳號資訊
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-on-surface-variant">電子郵件</span>
            <span className="mono-data text-sm text-on-surface">{user?.email ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-on-surface-variant">帳號 ID</span>
            <span className="mono-data text-xs text-on-surface-variant">{user?.id?.slice(0, 8) ?? '—'}...</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-on-surface-variant">建立時間</span>
            <span className="mono-data text-sm text-on-surface">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-TW') : '—'}
            </span>
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="bg-white rounded-xl border border-border p-5 mb-6 editorial-shadow">
        <h2 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">lock</span>
          變更密碼
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">新密碼</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="輸入新密碼（至少 6 字元）"
              minLength={6}
              className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-sm text-on-surface outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/50"
            />
          </div>
          {pwMsg && (
            <div className={`text-sm px-3 py-2 rounded-lg ${pwMsg.includes('成功') ? 'bg-primary-light text-primary-dark' : 'bg-tertiary-light text-tertiary-dark'}`}>
              {pwMsg}
            </div>
          )}
          <button
            type="submit"
            disabled={pwLoading}
            className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {pwLoading ? '更新中...' : '更新密碼'}
          </button>
        </form>
      </section>

      {/* App Info */}
      <section className="bg-white rounded-xl border border-border p-5 mb-6 editorial-shadow">
        <h2 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">info</span>
          關於
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-on-surface-variant">應用程式</span>
            <span className="text-sm text-on-surface font-medium">Stitch - AI 訊號分析</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-sm text-on-surface-variant">版本</span>
            <span className="mono-data text-sm text-on-surface">1.0.0</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-on-surface-variant">技術棧</span>
            <span className="text-sm text-on-surface">React + Supabase + Claude AI</span>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="bg-white rounded-xl border border-tertiary/30 p-5 mb-6">
        <h2 className="text-sm font-bold text-tertiary mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">warning</span>
          危險區域
        </h2>
        <button
          onClick={() => {
            if (window.confirm('確定要登出嗎？')) signOut()
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-tertiary/30 text-tertiary text-sm font-medium hover:bg-tertiary-light transition-colors"
        >
          <span className="material-symbols-outlined text-base">logout</span>
          登出帳號
        </button>
      </section>
    </div>
  )
}
