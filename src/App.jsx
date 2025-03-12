import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { connectToESP32, sendCommand } from './BluetoothService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
   LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Chart.js のスケール登録（エラー防止）
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  let [relaxationValue, setRelaxationValue] = useState(50); // 現在のリラックス値
  let [previousRelaxation, setPreviousRelaxation] = useState(50); // 30秒前のリラックス値
  let [device, setDevice] = useState(null);
  let [characteristic, setCharacteristic] = useState(null);
  let [relaxationHistory, setRelaxationHistory] = useState([]);
  let [timeLabels, setTimeLabels] = useState([]);
  let [nNew, setNNew] = useState(0);
  let [expansionState, setExpansionState] = useState("なし");

  // 30秒ごとに `previousRelaxation` を更新
  useEffect(() => {
    const interval = setInterval(() => {
      setPreviousRelaxation(relaxationValue); // 直前の値を保存
    }, 30000);

    return () => clearInterval(interval);
  }, [relaxationValue]);

  // 計算と送信
  useEffect(() => {
    if (previousRelaxation !== null) {
      let e = (relaxationValue - previousRelaxation) / previousRelaxation;

      // n の計算式適用
      let nCalculated = 30 * e / Math.max(Math.abs(e), 0.8);
      setNNew(Math.round(nCalculated));

      // 膨張 or 収縮の状態を決定
      let state = nCalculated > 0 ? "膨張" : nCalculated < 0 ? "収縮" : "なし";
      setExpansionState(state);

      console.log(`相対誤差 e: ${e}`);
      console.log(`計算された膨張/収縮時間: ${nCalculated}秒 (${state})`);

      if (characteristic) {
        sendCommand(characteristic, Math.round(nCalculated));
      }

      setRelaxationHistory((prev) => [...prev, relaxationValue].slice(-30));
      setTimeLabels((prev) => [...prev, new Date().toLocaleTimeString()].slice(-30));
    }
  }, [relaxationValue]); 

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-center mb-8">フグ型デバイス</h1>

      <div className="mb-4 text-center">
        <button 
          onClick={() => connectToESP32(setDevice, setCharacteristic)}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          {device ? "ESP32接続済み" : "ESP32と接続"}
        </button>
      </div>

      {/* リラックス値の入力 */}
      <div className="mb-8">
        <label htmlFor="relaxation-input" className="block text-lg mb-2">
          リラックス値 (手動入力):
        </label>
        <input
          id="relaxation-input"
          type="number"
          min="1"
          max="200"
          value={relaxationValue}
          onChange={(e) => setRelaxationValue(parseFloat(e.target.value))}
          className="w-24 p-2 border rounded text-center"
        />
      </div>

      {/* 30秒前のリラックス値 */}
      <div className="bg-gray-100 rounded-lg p-4 mb-4 text-center">
        <h2 className="text-xl font-semibold">30秒前のリラックス値: {previousRelaxation}</h2>
      </div>

      {/* n値と膨張・収縮状態 */}
      <div className="bg-gray-100 rounded-lg p-4 mb-4 text-center">
        <h2 className="text-xl font-semibold">送信する時間: {nNew} 秒</h2>
        <h2 className="text-xl font-semibold">フグの状態: {expansionState}</h2>
      </div>

      {/* リラックス値の推移グラフ */}
      <div className="bg-white rounded-lg p-4 shadow">
        <h2 className="text-xl font-semibold mb-4">リラックス値の推移</h2>
        <div className="h-64">
          <Line 
            data={{
              labels: timeLabels,
              datasets: [{
                label: 'リラックス値',
                data: relaxationHistory,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                tension: 0.1,
              }]
            }} 
          />
        </div>
      </div>
    </div>
  );
}

export default App;
