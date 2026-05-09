// src/app/page.tsx

const mockAssets = [
  { symbol: "AAPL", name: "Apple Inc.", type: "stock", qty: 10, avgCost: 5500, currentPrice: 6200 },
  { symbol: "BTC", name: "Bitcoin", type: "crypto", qty: 0.5, avgCost: 1500000, currentPrice: 1800000 },
  { symbol: "GLD", name: "ทองคำ", type: "gold", qty: 5, avgCost: 32000, currentPrice: 34500 },
  { symbol: "SCB", name: "ธนาคารไทยพาณิชย์", type: "stock", qty: 100, avgCost: 110, currentPrice: 98 },
];

const TYPE_LABEL: Record<string, string> = {
  stock: "หุ้น",
  crypto: "คริปโต",
  gold: "ทองคำ",
  etf: "ETF",
};

const TYPE_COLOR: Record<string, string> = {
  stock: "bg-blue-100 text-blue-700",
  crypto: "bg-purple-100 text-purple-700",
  gold: "bg-amber-100 text-amber-700",
  etf: "bg-green-100 text-green-700",
};

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const assets = mockAssets.map((a) => ({
    ...a,
    marketValue: a.qty * a.currentPrice,
    totalCost: a.qty * a.avgCost,
    pl: a.qty * a.currentPrice - a.qty * a.avgCost,
    plPct: ((a.currentPrice - a.avgCost) / a.avgCost) * 100,
  }));

  const totalValue = assets.reduce((s, a) => s + a.marketValue, 0);
  const totalCost = assets.reduce((s, a) => s + a.totalCost, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = (totalPL / totalCost) * 100;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Portfolio Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">ภาพรวมการลงทุนของคุณ</p>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">มูลค่ารวม</p>
            <p className="text-xl font-semibold text-gray-900">฿{fmt(totalValue)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">ต้นทุนรวม</p>
            <p className="text-xl font-semibold text-gray-900">฿{fmt(totalCost)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">กำไร / ขาดทุน</p>
            <p className={`text-xl font-semibold ${totalPL >= 0 ? "text-green-600" : "text-red-500"}`}>
              {totalPL >= 0 ? "+" : ""}฿{fmt(totalPL)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">ผลตอบแทน</p>
            <p className={`text-xl font-semibold ${totalPLPct >= 0 ? "text-green-600" : "text-red-500"}`}>
              {totalPLPct >= 0 ? "+" : ""}{totalPLPct.toFixed(2)}%
            </p>
          </div>
        </div>

        {/* Asset Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-700">สินทรัพย์ทั้งหมด</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="text-left px-5 py-3 font-medium">สินทรัพย์</th>
                  <th className="text-right px-5 py-3 font-medium">จำนวน</th>
                  <th className="text-right px-5 py-3 font-medium">ราคาปัจจุบัน</th>
                  <th className="text-right px-5 py-3 font-medium">มูลค่า</th>
                  <th className="text-right px-5 py-3 font-medium">กำไร/ขาดทุน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assets.map((a) => (
                  <tr key={a.symbol} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                          {a.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{a.symbol}</p>
                          <p className="text-xs text-gray-400">{a.name}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[a.type]}`}>
                          {TYPE_LABEL[a.type]}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-gray-600">{a.qty}</td>
                    <td className="px-5 py-4 text-right text-gray-600">฿{fmt(a.currentPrice)}</td>
                    <td className="px-5 py-4 text-right font-medium text-gray-900">฿{fmt(a.marketValue)}</td>
                    <td className="px-5 py-4 text-right">
                      <p className={`font-medium ${a.pl >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {a.pl >= 0 ? "+" : ""}฿{fmt(a.pl)}
                      </p>
                      <p className={`text-xs ${a.plPct >= 0 ? "text-green-500" : "text-red-400"}`}>
                        {a.plPct >= 0 ? "+" : ""}{a.plPct.toFixed(2)}%
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  );
}