const miningLogoFiles: Record<string, string> = {
  GOLD: 'gold.png',
  XLE: 'xle.png',
  OIL: 'oil.png',
  AAPL: 'aapl.png',
  TSLA: 'tsla.png',
  NVDA: 'nvda.png',
  MSFT: 'msft.png',
  AMZN: 'amzn.png',
};

export function getMiningLogoFile(symbol: string) {
  return miningLogoFiles[symbol.toUpperCase()];
}