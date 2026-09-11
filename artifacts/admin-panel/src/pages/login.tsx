import { useState, FormEvent } from 'react';
import { useLocation } from 'wouter';
import { setAdminKey } from '@/lib/api';
import { TerminalSquare, KeyRound, Loader2 } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const submittedKey = key.trim();
    if (!submittedKey) {
      setError('Enter the admin key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Basic check via stats endpoint to verify key
      const res = await fetch('/api/admin/stats', {
        headers: { 'X-Admin-Key': submittedKey }
      });
      
      if (res.ok) {
        setAdminKey(submittedKey);
        setLocation('/dashboard');
      } else if (res.status === 401) {
        setError('Invalid admin key');
      } else {
        setError('Admin service unavailable. Try again shortly.');
      }
    } catch {
      setError('Connection failed. Check the admin service and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background p-4 font-sans selection:bg-primary/30">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-card border border-border rounded-xl flex items-center justify-center mb-6 shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-primary/10" />
            <TerminalSquare className="w-8 h-8 text-primary relative z-10" />
          </div>
          <h1 className="text-2xl font-mono font-bold tracking-tight text-foreground">
            NORTH STATE <span className="text-primary">BLOCKCHAIN ADMIN</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">Secure Command Center</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 shadow-2xl relative overflow-hidden">
          <div className="pointer-events-none absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-50" />
          
          <div className="space-y-4">
            <div>
              <label htmlFor="adminKey" className="block text-xs font-medium font-mono text-muted-foreground mb-1.5 uppercase tracking-wider">
                Authentication Key
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  id="adminKey"
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-border bg-background/50 rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm transition-all"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  data-testid="input-admin-key"
                />
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                <p className="text-xs text-destructive font-medium font-mono">{error}</p>
              </div>
            )}

            <button
              type="submit"
              aria-busy={loading}
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background transition-colors font-mono uppercase tracking-wider"
              data-testid="btn-login-submit"
            >
              {loading ? (
                <Loader2 className="animate-spin h-4 w-4" />
              ) : (
                'Authenticate'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
