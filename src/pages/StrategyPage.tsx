export default function StrategyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="serif-heading text-[32px] md:text-[38px] text-on-surface">分析策略</h1>
        <p className="mt-1 text-[13px] text-on-surface-variant">了解 Stitch 如何分析每一個交易訊號</p>
      </div>

      {/* Pipeline Overview */}
      <div className="bg-white rounded-xl border border-border p-5 mb-6 editorial-shadow">
        <h2 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-lg">route</span>
          分析流程
        </h2>
        <div className="flex flex-col gap-3">
          {[
            { step: '1', icon: 'webhook', title: 'TradingView 觸發', desc: '當 TradingView 警報條件達成時，自動發送 Webhook 到 Stitch' },
            { step: '2', icon: 'query_stats', title: '即時數據抓取', desc: '從 Yahoo Finance 取得即時價格、成交量、歷史 K 線（6 個月日線資料）' },
            { step: '3', icon: 'calculate', title: '技術指標計算', desc: '本地計算 16 個技術指標（詳見下方）' },
            { step: '4', icon: 'image', title: '圖表截取', desc: '透過 Finviz 取得日線、週線、分時三張技術分析圖表' },
            { step: '5', icon: 'newspaper', title: '新聞蒐集', desc: '從 Google News 搜尋該股票最新相關新聞' },
            { step: '6', icon: 'auto_awesome', title: 'AI 第一階段：技術分析', desc: 'Claude AI 結合圖表影像 + 指標數據，進行視覺化技術分析' },
            { step: '7', icon: 'psychology', title: 'AI 第二階段：綜合決策', desc: '結合技術分析 + 新聞 + 市場環境 + 歷史教訓，給出最終建議' },
            { step: '8', icon: 'send', title: 'Telegram 通知', desc: '將分析結果以繁體中文推送到 Telegram' },
          ].map(item => (
            <div key={item.step} className="flex gap-3 items-start">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-white text-xs font-bold">{item.step}</span>
              </div>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="material-symbols-outlined text-on-surface-variant text-base">{item.icon}</span>
                  <span className="text-sm font-semibold text-on-surface">{item.title}</span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Technical Indicators */}
      <div className="bg-white rounded-xl border border-border mb-6 editorial-shadow overflow-hidden">
        <div className="bg-background px-5 py-3 border-b border-border flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-lg">analytics</span>
          <span className="text-sm font-bold text-on-surface">16 項技術指標</span>
        </div>
        <div className="divide-y divide-border">
          {[
            { name: 'SMA 20（20日均線）', category: '均線', desc: '短期趨勢方向，價格在其上方為短期看漲', logic: '計算最近 20 根 K 線收盤價平均值' },
            { name: 'SMA 50（50日均線）', category: '均線', desc: '中期趨勢方向，黃金交叉/死亡交叉的關鍵線', logic: '計算最近 50 根 K 線收盤價平均值' },
            { name: 'SMA 200（200日均線）', category: '均線', desc: '長期趨勢方向，機構投資者重要參考', logic: '計算最近 200 根 K 線收盤價平均值' },
            { name: '黃金交叉 / 死亡交叉', category: '均線', desc: 'SMA50 上穿 SMA200 為黃金交叉（看漲），下穿為死亡交叉（看跌）', logic: '比較 SMA50 與 SMA200 的相對位置' },
            { name: 'RSI(14)', category: '動量', desc: '相對強弱指標，>70 超買區（可能回調），<30 超賣區（可能反彈）', logic: '計算 14 日內漲幅與跌幅的相對比例' },
            { name: 'MACD 線', category: '動量', desc: 'EMA12 - EMA26，判斷動量方向', logic: '12日指數均線減去26日指數均線' },
            { name: 'MACD 信號線', category: '動量', desc: 'MACD 的 9 日 EMA，與 MACD 線交叉產生買賣訊號', logic: 'MACD 線的 9 日指數均線' },
            { name: 'MACD 柱狀圖', category: '動量', desc: 'MACD 與信號線的差值，正值看漲、負值看跌', logic: 'MACD 線減去信號線' },
            { name: 'ATR(14)', category: '波動', desc: '真實波動幅度均值，用於設定止損距離', logic: '計算 14 日的真實波幅（考慮跳空）平均值' },
            { name: '布林通道上軌', category: '波動', desc: '價格觸及上軌可能超買或突破', logic: 'SMA20 + 2倍標準差' },
            { name: '布林通道下軌', category: '波動', desc: '價格觸及下軌可能超賣或破位', logic: 'SMA20 - 2倍標準差' },
            { name: '成交量比', category: '量能', desc: '當日成交量 / 20日均量，>1.5 為放量、<0.5 為縮量', logic: '當日成交量除以 20 日平均成交量' },
            { name: '價格 vs SMA20', category: '位置', desc: '價格在 SMA20 上方或下方', logic: '比較當前價格與 SMA20' },
            { name: '價格 vs SMA50', category: '位置', desc: '價格在 SMA50 上方或下方', logic: '比較當前價格與 SMA50' },
            { name: '價格 vs SMA200', category: '位置', desc: '價格在 SMA200 上方或下方', logic: '比較當前價格與 SMA200' },
            { name: '近 10 日 K 線', category: '價格', desc: '最近 10 根日K的開高低收量，用於辨識短期走勢', logic: '從 Yahoo Finance 抓取最近 10 根日 K 線數據' },
          ].map((ind, i) => (
            <div key={i} className="px-5 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-on-surface">{ind.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  ind.category === '均線' ? 'bg-primary-light text-primary-dark' :
                  ind.category === '動量' ? 'bg-secondary-light text-secondary-dark' :
                  ind.category === '波動' ? 'bg-warning-light text-warning-dark' :
                  ind.category === '量能' ? 'bg-info-light text-info-dark' :
                  'bg-surface text-on-surface-variant'
                }`}>{ind.category}</span>
              </div>
              <p className="text-xs text-on-surface-variant mb-1">{ind.desc}</p>
              <p className="text-[11px] text-on-surface-variant/60 italic">計算方式：{ind.logic}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI Analysis Logic */}
      <div className="bg-white rounded-xl border border-border p-5 mb-6 editorial-shadow">
        <h2 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-lg">psychology</span>
          AI 分析邏輯
        </h2>

        <div className="space-y-4">
          <div className="bg-primary-light rounded-lg p-4 border border-primary/20">
            <h3 className="text-sm font-bold text-primary-dark mb-2">第一階段：技術分析（Pass 1）</h3>
            <p className="text-xs text-primary-dark/80 leading-relaxed mb-2">
              Claude AI 同時接收三張圖表影像（日線、週線、分時）和所有計算好的技術指標數據，進行綜合視覺化技術分析。
            </p>
            <div className="text-xs text-primary-dark/70 space-y-1">
              <p>分析維度：</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>圖表型態辨識（頭肩頂、杯柄、三角收斂等）</li>
                <li>趨勢方向與強度判定</li>
                <li>支撐位與壓力位標定</li>
                <li>RSI 超買超賣解讀</li>
                <li>成交量趨勢分析</li>
              </ul>
            </div>
          </div>

          <div className="bg-secondary-light rounded-lg p-4 border border-secondary/20">
            <h3 className="text-sm font-bold text-secondary-dark mb-2">第二階段：綜合決策（Pass 2）</h3>
            <p className="text-xs text-secondary-dark/80 leading-relaxed mb-2">
              結合第一階段的技術分析結果、最新新聞、大盤環境（S&P 500 趨勢、VIX 恐慌指數、板塊表現）以及過往交易教訓，產出最終交易建議。
            </p>
            <div className="text-xs text-secondary-dark/70 space-y-1">
              <p>決策因素：</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>技術面多空訊號一致性</li>
                <li>新聞面利多或利空影響</li>
                <li>大盤環境風險評估（VIX {'>'} 25 視為高風險）</li>
                <li>過往同類型交易教訓回饋</li>
                <li>進場/止損/止盈價位計算</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Confidence Score Explanation */}
      <div className="bg-white rounded-xl border border-border p-5 mb-6 editorial-shadow">
        <h2 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-lg">speed</span>
          信心度說明
        </h2>
        <p className="text-xs text-on-surface-variant mb-4">
          信心度（0-100%）反映的是多少訊號方向一致，而非「一定會漲」的機率。高信心度不代表自動建議買入。
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-primary-light rounded-lg p-3 border border-primary/20 text-center">
            <div className="text-lg font-bold text-primary-dark mb-1">70-100%</div>
            <div className="h-2 rounded-full bg-primary mb-2" />
            <p className="text-[11px] text-primary-dark">高信心度</p>
            <p className="text-[10px] text-primary-dark/60 mt-1">多數指標方向一致</p>
          </div>
          <div className="bg-warning-light rounded-lg p-3 border border-warning/20 text-center">
            <div className="text-lg font-bold text-warning-dark mb-1">40-69%</div>
            <div className="h-2 rounded-full bg-warning mb-2" />
            <p className="text-[11px] text-warning-dark">中等信心度</p>
            <p className="text-[10px] text-warning-dark/60 mt-1">訊號有分歧</p>
          </div>
          <div className="bg-tertiary-light rounded-lg p-3 border border-tertiary/20 text-center">
            <div className="text-lg font-bold text-tertiary-dark mb-1">0-39%</div>
            <div className="h-2 rounded-full bg-tertiary mb-2" />
            <p className="text-[11px] text-tertiary-dark">低信心度</p>
            <p className="text-[10px] text-tertiary-dark/60 mt-1">多數指標矛盾</p>
          </div>
        </div>
      </div>

      {/* Data Sources */}
      <div className="bg-white rounded-xl border border-border p-5 mb-6 editorial-shadow">
        <h2 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-lg">database</span>
          資料來源
        </h2>
        <div className="divide-y divide-border">
          {[
            { source: 'Yahoo Finance', use: '即時價格、歷史 K 線、基本面數據', delay: '即時（盤中延遲約 15 分鐘）' },
            { source: 'Finviz', use: '日線 / 週線 / 分時技術分析圖表', delay: '即時' },
            { source: 'Google News', use: '股票相關最新新聞標題', delay: '即時' },
            { source: 'Claude AI (Anthropic)', use: '圖表視覺分析 + 綜合決策推薦', delay: '處理約 10-30 秒' },
            { source: 'TradingView', use: '使用者自訂警報觸發條件', delay: '即時觸發' },
          ].map((item, i) => (
            <div key={i} className="py-3 flex items-start gap-3">
              <span className="mono-data text-xs font-bold bg-surface px-2 py-1 rounded text-on-surface shrink-0">
                {item.source}
              </span>
              <div className="flex-1">
                <p className="text-xs text-on-surface">{item.use}</p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">延遲：{item.delay}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-tertiary-light rounded-xl border border-tertiary/20 p-5 mb-6">
        <h2 className="text-sm font-bold text-tertiary-dark mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">gavel</span>
          免責聲明
        </h2>
        <p className="text-xs text-tertiary-dark/80 leading-relaxed">
          Stitch 提供的分析結果僅供參考，不構成任何投資建議。所有交易決策請自行判斷，AI 分析存在誤判風險。過往績效不代表未來表現。投資有風險，入市需謹慎。
        </p>
      </div>
    </div>
  )
}
