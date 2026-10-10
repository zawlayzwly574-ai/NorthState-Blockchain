import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, RefreshCw, X } from 'lucide-react';
import {
  useCloseFuturesPosition,
  getGetFuturesPositionsQueryKey,
  getGetTradingAccountQueryKey,
  getGetPortfolioQueryKey,
} from '@workspace/api-client-react';
import type { FuturesPosition } from '@workspace/api-client-react';

const FUTURES_UI_COPY: Record<string, Record<string, string>> = {
es: {"My Positions":"Mis posiciones","Updates every 3s":"Se actualiza cada 3 s","Positions could not be refreshed":"No se pudieron actualizar las posiciones","Please check your connection and retry.":"Comprueba tu conexión e inténtalo de nuevo.","Retry positions":"Reintentar posiciones","No open futures positions":"No hay posiciones de futuros abiertas","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"Abre un perpetuo USDT desde el panel de futuros para ver aquí el precio y las ganancias/pérdidas en tiempo real.","Close position":"Cerrar posición","Cancel":"Cancelar","Confirm close":"Confirmar cierre"},
pt: {"My Positions":"Minhas posições","Updates every 3s":"Atualiza a cada 3 s","Positions could not be refreshed":"Não foi possível atualizar as posições","Please check your connection and retry.":"Verifique sua conexão e tente novamente.","Retry positions":"Tentar posições novamente","No open futures positions":"Nenhuma posição de futuros aberta","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"Abra um perpétuo USDT na área de futuros para ver aqui o preço e o lucro/prejuízo em tempo real.","Close position":"Fechar posição","Cancel":"Cancelar","Confirm close":"Confirmar fechamento"},
fr: {"My Positions":"Mes positions","Updates every 3s":"Mise à jour toutes les 3 s","Positions could not be refreshed":"Impossible d’actualiser les positions","Please check your connection and retry.":"Vérifiez votre connexion et réessayez.","Retry positions":"Réessayer les positions","No open futures positions":"Aucune position futures ouverte","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"Ouvrez un perpétuel USDT dans la zone Futures pour voir ici le prix et le résultat en direct.","Close position":"Fermer la position","Cancel":"Annuler","Confirm close":"Confirmer la fermeture"},
de: {"My Positions":"Meine Positionen","Updates every 3s":"Aktualisierung alle 3 s","Positions could not be refreshed":"Positionen konnten nicht aktualisiert werden","Please check your connection and retry.":"Bitte Verbindung prüfen und erneut versuchen.","Retry positions":"Positionen erneut laden","No open futures positions":"Keine offenen Futures-Positionen","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"Öffnen Sie im Futures-Bereich einen USDT-Perpetual, um hier den Live-Preis und Gewinn/Verlust zu sehen.","Close position":"Position schließen","Cancel":"Abbrechen","Confirm close":"Schließen bestätigen"},
it: {"My Positions":"Le mie posizioni","Updates every 3s":"Aggiornamento ogni 3 s","Positions could not be refreshed":"Impossibile aggiornare le posizioni","Please check your connection and retry.":"Controlla la connessione e riprova.","Retry positions":"Riprova posizioni","No open futures positions":"Nessuna posizione futures aperta","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"Apri un perpetuo USDT nell’area Futures per vedere qui prezzo e profitti/perdite in tempo reale.","Close position":"Chiudi posizione","Cancel":"Annulla","Confirm close":"Conferma chiusura"},
ja: {"My Positions":"保有ポジション","Updates every 3s":"3秒ごとに更新","Positions could not be refreshed":"ポジションを更新できませんでした","Please check your connection and retry.":"接続を確認して再試行してください。","Retry positions":"ポジションを再試行","No open futures positions":"未決済の先物ポジションはありません","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"先物取引欄からUSDT無期限契約を開くと、価格と損益がここに表示されます。","Close position":"ポジションを決済","Cancel":"キャンセル","Confirm close":"決済を確認"},
zh: {"My Positions":"我的持仓","Updates every 3s":"每3秒更新","Positions could not be refreshed":"无法刷新持仓","Please check your connection and retry.":"请检查网络连接后重试。","Retry positions":"重试持仓","No open futures positions":"没有未平仓的期货持仓","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"在期货交易框中开立USDT永续合约后，可在此查看实时标记价格和盈亏。","Close position":"平仓","Cancel":"取消","Confirm close":"确认平仓"},
ko: {"My Positions":"내 포지션","Updates every 3s":"3초마다 업데이트","Positions could not be refreshed":"포지션을 새로고침할 수 없습니다","Please check your connection and retry.":"연결을 확인하고 다시 시도하세요.","Retry positions":"포지션 다시 시도","No open futures positions":"열린 선물 포지션이 없습니다","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"선물 거래 상자에서 USDT 무기한 계약을 열면 실시간 가격과 손익이 여기에 표시됩니다.","Close position":"포지션 종료","Cancel":"취소","Confirm close":"종료 확인"},
th: {"My Positions":"สถานะของฉัน","Updates every 3s":"อัปเดตทุก 3 วินาที","Positions could not be refreshed":"รีเฟรชสถานะไม่สำเร็จ","Please check your connection and retry.":"ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง","Retry positions":"ลองโหลดสถานะอีกครั้ง","No open futures positions":"ไม่มีสถานะฟิวเจอร์สที่เปิดอยู่","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"เปิดสัญญา USDT Perpetual ในส่วน Futures เพื่อดูราคาและกำไรขาดทุนแบบเรียลไทม์ที่นี่","Close position":"ปิดสถานะ","Cancel":"ยกเลิก","Confirm close":"ยืนยันการปิด"},
vi: {"My Positions":"Vị thế của tôi","Updates every 3s":"Cập nhật mỗi 3 giây","Positions could not be refreshed":"Không thể làm mới vị thế","Please check your connection and retry.":"Kiểm tra kết nối và thử lại.","Retry positions":"Thử tải vị thế lại","No open futures positions":"Không có vị thế hợp đồng tương lai đang mở","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"Mở hợp đồng USDT Perpetual trong khu vực Futures để xem giá và lãi/lỗ trực tiếp tại đây.","Close position":"Đóng vị thế","Cancel":"Hủy","Confirm close":"Xác nhận đóng"},
ms: {"My Positions":"Posisi Saya","Updates every 3s":"Dikemas kini setiap 3 saat","Positions could not be refreshed":"Posisi tidak dapat dikemas kini","Please check your connection and retry.":"Semak sambungan anda dan cuba lagi.","Retry positions":"Cuba posisi semula","No open futures positions":"Tiada posisi niaga hadapan terbuka","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"Buka kontrak kekal USDT di ruang Futures untuk melihat harga dan untung/rugi langsung di sini.","Close position":"Tutup posisi","Cancel":"Batal","Confirm close":"Sahkan penutupan"},
my: {"My Positions":"ကျွန်ုပ်၏ Position များ","Updates every 3s":"၃ စက္ကန့်တိုင်း အပ်ဒိတ်လုပ်သည်","Positions could not be refreshed":"Position များကို ပြန်လည်ရယူ၍မရပါ","Please check your connection and retry.":"အင်တာနက်ချိတ်ဆက်မှုကို စစ်ဆေးပြီး ထပ်မံကြိုးစားပါ။","Retry positions":"Position များကို ပြန်စမ်းရန်","No open futures positions":"ဖွင့်ထားသော Futures Position မရှိပါ","Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.":"Futures Trade နေရာမှ USDT Perpetual ကိုဖွင့်ပါက လက်ရှိဈေးနှုန်းနှင့် အမြတ်/အရှုံးကို ဤနေရာတွင် ကြည့်နိုင်ပါသည်။","Close position":"Position ပိတ်ရန်","Cancel":"ပယ်ဖျက်ရန်","Confirm close":"ပိတ်ရန် အတည်ပြုပါ"}
};
function futuresText(english: string): string {
  let language = 'en-US';
  try { language = localStorage.getItem('nsl-login-language') || 'en-US'; } catch {}
  return FUTURES_UI_COPY[language]?.[english] ?? english;
}

export function futuresErrorMessage(error: unknown, fallback: string) {
  const response = error as { data?: { error?: string; message?: string }; message?: string } | null;
  return response?.data?.error || response?.data?.message || response?.message || fallback;
}

function price(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
}

function money(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function FuturesPositions({
  positions,
  isLoading,
  error,
  onRetry,
}: {
  positions: FuturesPosition[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const qc = useQueryClient();
  const closePosition = useCloseFuturesPosition();
  const [closingId, setClosingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'error' | 'success' } | null>(null);
  const active = positions?.filter(position => position.status === 'active') ?? [];

  const handleClose = async (position: FuturesPosition) => {
    if (closingId !== null || position.markPrice === null || position.unrealizedPnl === null) return;
    setClosingId(position.id);
    setNotice(null);
    try {
      const result = await closePosition.mutateAsync({ positionId: position.id });
      setConfirmId(null);
      setNotice({
        kind: 'success',
        text: `${result.asset} ${result.direction} position closed${result.realizedPnl === null ? '.' : ` · Realized PnL ${result.realizedPnl >= 0 ? '+' : '-'}${money(Math.abs(result.realizedPnl))}.`}`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetFuturesPositionsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetTradingAccountQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetPortfolioQueryKey() }),
      ]);
    } catch (cause) {
      setNotice({ kind: 'error', text: futuresErrorMessage(cause, 'Could not close this position. Please try again.') });
      setConfirmId(null);
    } finally {
      setClosingId(null);
    }
  };

  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-primary/25 bg-card" aria-labelledby="futures-positions-title" data-testid="section-futures-positions">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.17em] text-primary">Futures · USDT Perpetual</p>
          <h3 id="futures-positions-title" className="mt-1 text-base font-extrabold tracking-tight">My Positions <span className="ml-1 font-mono text-xs text-muted-foreground">{!isLoading && !error ? `(${active.length})` : ''}</span></h3>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"><RefreshCw size={11} /> Updates every 3s</span>
      </div>

      {notice && (
        <div className={`mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs font-semibold sm:mx-5 ${notice.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-green-500/30 bg-green-500/10 text-green-300'}`} role={notice.kind === 'error' ? 'alert' : 'status'} data-testid="status-futures-close">
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" data-testid="button-dismiss-futures-close"><X size={14} /></button>
        </div>
      )}

      {isLoading && !positions ? (
        <div className="space-y-3 p-4 sm:p-5" aria-label="Loading futures positions" data-testid="status-futures-positions-loading">
          {[0, 1].map(item => <div key={item} className="h-36 animate-pulse rounded-xl bg-secondary/60" />)}
        </div>
      ) : error ? (
        <div className="px-5 py-9 text-center" role="alert" data-testid="status-futures-positions-error">
          <AlertCircle size={22} className="mx-auto text-amber-400" />
          <p className="mt-3 text-sm font-bold"> {futuresText('Positions could not be refreshed')} </p>
          <p className="mt-1 text-xs text-muted-foreground">{futuresErrorMessage(error, 'Please check your connection and retry.')}</p>
          <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-primary/40 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/10" data-testid="button-retry-futures-positions"> {futuresText('Retry positions')} </button>
        </div>
      ) : active.length === 0 ? (
        <div className="px-5 py-10 text-center" data-testid="status-futures-positions-empty">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><ArrowUpRight size={19} /></div>
          <p className="mt-3 text-sm font-bold"> {futuresText('No open futures positions')} </p>
          <p className="mt-1 text-xs text-muted-foreground">Open a USDT Perpetual from the Futures Trade box to see its live mark and PnL here.</p>
        </div>
      ) : (
        <div className="space-y-2.5 p-3 sm:p-4">
          {active.map(position => {
            const quoted = position.markPrice !== null && position.unrealizedPnl !== null;
            return (
              <article key={position.id} className="rounded-xl border border-border/70 bg-secondary/20 p-3.5 sm:p-4" data-testid={`card-futures-position-${position.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-1 text-[10px] font-extrabold uppercase ${position.direction === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>{position.direction}</span>
                    <span className="text-sm font-extrabold">{position.asset}/USDT</span>
                    <span className="rounded-md bg-primary/10 px-1.5 py-1 font-mono text-[10px] font-bold text-primary">{position.leverage}x</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">#{position.id} · {new Date(position.openedAt).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 py-3 sm:grid-cols-4">
                  <div><p className="text-[10px] text-muted-foreground">Entry price</p><p className="mt-1 font-mono text-xs font-bold" data-testid={`text-futures-entry-${position.id}`}>{price(position.entryPrice)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Live mark</p><p className="mt-1 font-mono text-xs font-bold" data-testid={`text-futures-mark-${position.id}`}>{position.markPrice === null ? 'Unavailable' : price(position.markPrice)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Margin</p><p className="mt-1 font-mono text-xs font-bold" data-testid={`text-futures-margin-${position.id}`}>{money(position.margin)} USDT</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Unrealized PnL</p><p className={`mt-1 font-mono text-xs font-bold ${position.unrealizedPnl === null ? 'text-muted-foreground' : position.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid={`text-futures-pnl-${position.id}`}>{position.unrealizedPnl === null ? 'Unavailable' : `${position.unrealizedPnl >= 0 ? '+' : '-'}${money(Math.abs(position.unrealizedPnl))}`}</p></div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <p className="text-[10px] text-muted-foreground" data-testid={`status-futures-quote-${position.id}`}>
                    {quoted ? `Quote updated ${position.quoteUpdatedAt ? new Date(position.quoteUpdatedAt).toLocaleString() : 'recently'}` : 'No live quote available. Closing is disabled until the market can be priced.'}
                  </p>
                  {confirmId === position.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-300">Close at the next available market quote?</span>
                      <button type="button" disabled={closingId !== null || !quoted} onClick={() => handleClose(position)} className="rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-confirm-close-futures-${position.id}`}>{closingId === position.id ? 'Closing…' : 'Confirm close'}</button>
                      <button type="button" disabled={closingId !== null} onClick={() => setConfirmId(null)} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold disabled:opacity-50" data-testid={`button-cancel-close-futures-${position.id}`}> {futuresText('Cancel')} </button>
                    </div>
                  ) : (
                    <button type="button" disabled={!quoted || closingId !== null} onClick={() => setConfirmId(position.id)} title={!quoted ? 'No live quote available. Closing is disabled.' : undefined} className="rounded-lg border border-primary/40 px-3 py-2 text-[11px] font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground" data-testid={`button-close-futures-${position.id}`}>Close Position</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}