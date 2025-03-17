import React, { useState, useEffect, useRef } from "react";
import { Line } from "react-chartjs-2";
import { connectToESP32, sendCommand } from "./BluetoothService";
import { fetchUserData } from "./firebase.js"; // Firebase からデータ取得
import { relaxLogistic } from "./MathFunc"; // 0-100 に変換
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Chart.js の登録
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function App() {
  // リラックス値（心拍数の逆数）
  const [relaxValue, setRelaxValue] = useState(null);
  const [prevRelaxValue, setPrevRelaxValue] = useState(null);
  const [mappedHistory, setMappedHistory] = useState([]); // 0-100 に変換したデータ
  const [timeLabels, setTimeLabels] = useState([]);
  const [device, setDevice] = useState(null);
  const [characteristic, setCharacteristic] = useState(null);
  const [nValue, setNValue] = useState(0);
  const startTimeRef = useRef(Date.now());

  // 30秒ごとに Firestore から最新のデータを取得
  useEffect(() => {
    const fetchData = async () => {
      const newData = await fetchUserData();
      if (newData && newData.data && newData.data.value) {
        const newRelaxValue = newData.data.value;

        // 30秒前のデータを更新
        setPrevRelaxValue(relaxValue);
        setRelaxValue(newRelaxValue);
      }
    };

    // 初回データ取得
    fetchData();

    // 30秒ごとにデータを取得
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // n の計算とデータ更新
  useEffect(() => {
    if (relaxValue !== null && prevRelaxValue !== null) {
      const e = (relaxValue - prevRelaxValue) / prevRelaxValue; // 相対誤差 e
      const n = (25 * e) / Math.max(Math.abs(e), 0.8); // n の計算式
      setNValue(n);

      // 0-100 に変換したストレス値
      const stressMapped = relaxLogistic(relaxValue);

      // BLE 経由で ESP32 に送信
      if (characteristic) {
        sendCommand(characteristic, Math.round(n));
      }

      // 履歴データの更新（最新の30ポイントを保持）
      setMappedHistory((prev) => [...prev.slice(-29), stressMapped]);

      // 時間ラベルの更新
      const currentTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setTimeLabels((prev) => [...prev.slice(-29), `${currentTime}秒`]);
    }
  }, [relaxValue, prevRelaxValue, characteristic]);

  // グラフデータの設定
  const chartData = {
    labels: timeLabels,
    datasets: [
      {
        label: "ストレス値 (0-100 に変換)",
        data: mappedHistory,
        borderColor: "rgb(255, 99, 132)",
        backgroundColor: "rgba(255, 99, 132, 0.5)",
        tension: 0.1,
      },
    ],
  };

  // グラフオプションの設定
  const chartOptions = {
    responsive: true,
    scales: {
      y: {
        min: 0,
        max: 100,
        title: {
          display: true,
          text: "ストレス値 (0-100)",
        },
      },
      x: {
        title: {
          display: true,
          text: "時間（秒）",
        },
      },
    },
    animation: {
      duration: 0,
    },
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-center mb-8">フグ型デバイス ストレスシミュレーター</h1>

      {/* Bluetooth接続ボタン */}
      <div className="mb-4 text-center">
        <button
          onClick={() => connectToESP32(setDevice, setCharacteristic)}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          {device ? "ESP32接続済み" : "ESP32と接続"}
        </button>
      </div>

      {/* 取得したリラックス値の表示 */}
      <div className="mb-8 text-center">
        <p className="text-lg">現在のリラックス値 (生データ): <span className="font-bold text-blue-600">{relaxValue !== null ? relaxValue : "取得中..."}</span></p>
        <p className="text-lg">30秒前のリラックス値: <span className="font-bold text-gray-600">{prevRelaxValue !== null ? prevRelaxValue : "N/A"}</span></p>
        <p className="text-lg">変換後のストレス値 (0-100): <span className="font-bold text-green-600">{relaxValue !== null ? relaxLogistic(relaxValue).toFixed(2) : "計算中..."}</span></p>
        <p className="text-lg">計算された n 値 (秒数): <span className={`font-bold ${nValue > 0 ? "text-red-600" : "text-blue-600"}`}>{nValue.toFixed(2)}</span></p>
        <p className="text-lg">
          フグの状態:{" "}
          {nValue > 0 ? (
            <span className="text-red-600 font-bold">膨張 (LED点灯)</span>
          ) : (
            <span className="text-blue-600 font-bold">収縮 (LED消灯)</span>
          )}
        </p>
      </div>

      {/* グラフ表示 */}
      <div className="bg-white rounded-lg p-4 shadow">
        <h2 className="text-xl font-semibold mb-4">ストレス値の推移 (0-100 に変換)</h2>
        <div className="h-64">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}

export default App;
