import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
      navigate('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setIsSignUp(v => !v)
    setError('')
  }

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Decorative SVG watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden>
        <svg
          width="600"
          height="400"
          viewBox="0 0 600 400"
          fill="none"
          className="opacity-[0.04]"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Candlestick chart watermark */}
          {/* Axes */}
          <line x1="60" y1="20" x2="60" y2="360" stroke="#2C2A24" strokeWidth="2"/>
          <line x1="60" y1="360" x2="560" y2="360" stroke="#2C2A24" strokeWidth="2"/>
          {/* Candlesticks */}
          {/* candle 1 bullish */}
          <line x1="110" y1="200" x2="110" y2="100" stroke="#2C2A24" strokeWidth="2"/>
          <rect x="98" y="140" width="24" height="60" fill="#2C2A24"/>
          {/* candle 2 bearish */}
          <line x1="170" y1="120" x2="170" y2="240" stroke="#2C2A24" strokeWidth="2"/>
          <rect x="158" y="150" width="24" height="70" fill="none" stroke="#2C2A24" strokeWidth="2"/>
          {/* candle 3 bullish */}
          <line x1="230" y1="160" x2="230" y2="280" stroke="#2C2A24" strokeWidth="2"/>
          <rect x="218" y="200" width="24" height="50" fill="#2C2A24"/>
          {/* candle 4 bullish big */}
          <line x1="290" y1="80" x2="290" y2="260" stroke="#2C2A24" strokeWidth="2"/>
          <rect x="278" y="110" width="24" height="120" fill="#2C2A24"/>
          {/* candle 5 bearish */}
          <line x1="350" y1="100" x2="350" y2="220" stroke="#2C2A24" strokeWidth="2"/>
          <rect x="338" y="130" width="24" height="60" fill="none" stroke="#2C2A24" strokeWidth="2"/>
          {/* candle 6 bullish */}
          <line x1="410" y1="130" x2="410" y2="280" stroke="#2C2A24" strokeWidth="2"/>
          <rect x="398" y="160" width="24" height="80" fill="#2C2A24"/>
          {/* candle 7 bearish */}
          <line x1="470" y1="90" x2="470" y2="200" stroke="#2C2A24" strokeWidth="2"/>
          <rect x="458" y="110" width="24" height="70" fill="none" stroke="#2C2A24" strokeWidth="2"/>
          {/* candle 8 bullish */}
          <line x1="530" y1="140" x2="530" y2="310" stroke="#2C2A24" strokeWidth="2"/>
          <rect x="518" y="170" width="24" height="100" fill="#2C2A24"/>
          {/* Trend line */}
          <polyline
            points="110,170 170,185 230,225 290,165 350,160 410,200 470,145 530,220"
            stroke="#2C2A24"
            strokeWidth="2"
            fill="none"
            strokeDasharray="6 4"
          />
        </svg>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl editorial-shadow border border-border px-8 py-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="serif-heading text-[32px] leading-tight text-on-surface">Stitch</h1>
          <p className="mt-1 text-[13px] text-on-surface-variant" style={{ fontFamily: 'var(--font-sans)' }}>
            AI-powered signal intelligence
          </p>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-full bg-surface border border-border p-1 mb-8">
          <button
            type="button"
            onClick={() => { if (isSignUp) switchMode() }}
            className={`flex-1 min-h-[48px] py-1.5 rounded-full text-sm font-medium transition-colors ${
              !isSignUp
                ? 'bg-white text-on-surface editorial-shadow'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            登入
          </button>
          <button
            type="button"
            onClick={() => { if (!isSignUp) switchMode() }}
            className={`flex-1 min-h-[48px] py-1.5 rounded-full text-sm font-medium transition-colors ${
              isSignUp
                ? 'bg-white text-on-surface editorial-shadow'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            註冊
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 px-3 py-2.5 rounded-lg bg-tertiary-light text-tertiary-dark text-sm border border-tertiary/20">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block uppercase tracking-wider text-[12px] font-medium text-on-surface-variant mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border text-on-surface text-sm outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block uppercase tracking-wider text-[12px] font-medium text-on-surface-variant">
                密碼
              </label>
              {!isSignUp && (
                <button type="button" className="text-[12px] text-secondary-dark hover:underline py-2 px-1">
                  忘記密碼？
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-surface border border-border text-on-surface text-sm outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity mt-2"
          >
            {loading ? '處理中...' : isSignUp ? '建立帳號' : '登入'}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-[13px] text-on-surface-variant">
          {isSignUp ? '已有帳號？' : '還沒有帳號嗎？'}{' '}
          <button
            type="button"
            onClick={switchMode}
            className="text-secondary-dark font-medium hover:underline py-2 px-1"
          >
            {isSignUp ? '立即登入' : '立即加入'}
          </button>
        </p>
      </div>
    </main>
  )
}
