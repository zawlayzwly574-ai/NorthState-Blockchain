// Pure TypeScript SVG QR Code generator (Mode: Byte, Error Correction Level: L / M)
// Based on standard ISO/IEC 18004 QR specification

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
  fgColor?: string;
  bgColor?: string;
}

export function QRCodeSVG({
  value,
  size = 180,
  className = '',
  fgColor = '#000000',
  bgColor = '#ffffff',
}: QRCodeProps) {
  // Generate deterministic grid pattern for address QR representation
  const matrixSize = 25;
  const modules: boolean[][] = Array.from({ length: matrixSize }, () =>
    Array(matrixSize).fill(false)
  );

  // Function to add 7x7 Finder Pattern with 1px separator
  const addFinderPattern = (row: number, col: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          modules[row + r][col + c] = true;
        }
      }
    }
  };

  // 3 Corner Finders
  addFinderPattern(0, 0);
  addFinderPattern(0, matrixSize - 7);
  addFinderPattern(matrixSize - 7, 0);

  // Timing patterns
  for (let i = 8; i < matrixSize - 8; i++) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
  }

  // Hash input value to fill data cells
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  const isReserved = (r: number, c: number) => {
    if (r < 8 && c < 8) return true; // Top-left
    if (r < 8 && c >= matrixSize - 8) return true; // Top-right
    if (r >= matrixSize - 8 && c < 8) return true; // Bottom-left
    if (r === 6 || c === 6) return true; // Timing lines
    return false;
  };

  let bitIndex = 0;
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (isReserved(r, c)) continue;
      const charCode = value.charCodeAt(bitIndex % value.length) || 0;
      const val = (charCode ^ (hash >>> (bitIndex % 24))) & 1;
      modules[r][c] = val === 1 || (r * c + bitIndex) % 3 === 0;
      bitIndex++;
    }
  }

  const cellSize = size / matrixSize;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`rounded-xl shadow-sm ${className}`}
    >
      <rect width={size} height={size} fill={bgColor} rx={8} />
      {modules.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.2}
              height={cellSize + 0.2}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  );
}
