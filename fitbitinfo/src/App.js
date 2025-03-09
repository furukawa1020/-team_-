import { useState, useEffect, useCallback, useRef} from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {getFitbitConfig, saveToFirestore, updateTokens, updateAccessToken, fetchUserData} from "./firebase";
let firstflag = true;
function App() {
  const [rrData, setRrData] = useState([]);
  const isFirstRun = useRef(true);
  // Fitbit API から心拍数データを取得し、直近1分間のデータに対して補完・変動付RRデータを作成する関数
  const fetchHeartRateData = useCallback(async () => {
    
    const config = await getFitbitConfig();  
    console.log(config);
    const latestdata = await fetchUserData()
    console.log(latestdata);
    const clientId = config.clientId;
    const secretId = config.secretId;
    let accessToken = config.accessToken;
    let refreshToken = config.refreshToken;
    const userId = "-"; // 自分のデータの場合は '-'
    const startDate = new Date().toISOString().split("T")[0]; // 今日の日付 (YYYY-MM-DD)
    const url = `https://api.fitbit.com/1/user/${userId}/activities/heart/date/${startDate}/1d/1sec.json`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      if(response.status==401){
        console.log("Access token expired. Refreshing...");
        //console.log("fetchdata=", fetchData);

        const token = await updateAccessToken(refreshToken, clientId, secretId);
        if(token){
          config.access_token = token.newAccessToken;
          config.refresh_token = token.newRefreshToken;
          updateTokens(config.access_token, config.refreshToken);
        }

      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const heartRateData = data["activities-heart-intraday"]?.dataset;
      console.log("Full Dataset:", heartRateData);

      if (heartRateData && heartRateData.length > 1) {
        // 最新のデータの時刻を取得（Fitbit のデータはラグがあるので、データ内の時刻を基準）
        const latestTime = new Date(`${startDate}T${heartRateData[heartRateData.length - 1].time}`);

        // 最新時刻から1分前までのデータを抽出
        const recentData = heartRateData.filter(item => {
          const itemTime = new Date(`${startDate}T${item.time}`);
          const diffInSeconds = (latestTime - itemTime) / 1000;
          return diffInSeconds >= 0 && diffInSeconds <= 60;
        });

        // 補完に用いるためのヘルパー関数（±5% のランダム変動を加える）
        const addVariation = (rr) => {
          const variation = (Math.random() - 0.5) * 0.1; // -0.05 ～ +0.05
          return rr * (1 + variation);
        };

        if (recentData.length > 1) {
          let rrIntervals = [];

          for (let i = 0; i < recentData.length; i++) {
            const current = recentData[i];
            const currentTime = new Date(`${startDate}T${current.time}`);
            const rrValueCurrent = 60000 / current.value; // 現在データのRR間隔（ms）

            if (i === 0) {
              // 最初のデータはそのまま追加（変動あり）
              rrIntervals.push({ index: rrIntervals.length + 1, rr: addVariation(rrValueCurrent) });
            } else {
              const previous = recentData[i - 1];
              const previousTime = new Date(`${startDate}T${previous.time}`);
              const gapSeconds = (currentTime - previousTime) / 1000; // 前データとの時間差（秒）

              // 前のデータの BPM から、gapSeconds 内に発生し得る心拍数を計算
              // 1秒あたりの心拍数は previous.value / 60
              const expectedBeats = Math.floor(gapSeconds * (previous.value / 60));
              const rrValuePrevious = 60000 / previous.value; // 前データに基づくRR間隔

              // gap内に期待される心拍数分、前データのRR値（変動あり）を補完
              for (let j = 0; j < expectedBeats; j++) {
                rrIntervals.push({ index: rrIntervals.length + 1, rr: addVariation(rrValuePrevious) });
              }
              // 現在のデータ点も追加（変動あり）
              rrIntervals.push({ index: rrIntervals.length + 1, rr: addVariation(rrValueCurrent) });
            }
          }
          setRrData(rrIntervals);
        }
      }
    } catch (error) {
      console.error("Error fetching heart rate data:", error);
    }
  }, []); // 空の依存配列により、関数は一度だけ生成

  // fetchHeartRateData を30秒ごとに実行
  useEffect(() => {
    if(isFirstRun.current){
      isFirstRun.current = false;
      fetchHeartRateData(); 
    }
    const interval = setInterval(fetchHeartRateData, 30000);
    return () => clearInterval(interval);
  }, [fetchHeartRateData]);

  // rrData から Poincaréプロット用データを作成
  // 横軸: rrData[0...n-2] の rr、縦軸: rrData[1...n-1] の rr
  const rrPlotData = rrData.length > 1
    ? rrData.slice(0, -1).map((item, index) => ({
        x: item.rr,
        y: rrData[index + 1].rr,
      }))
    : [];
  let relax = 0.0;
// rrPlotData を使って中心値と relax を秒単位で計算
if (rrPlotData.length > 1) {
  const n = rrPlotData.length;
  // ここでは、最初のペアの y 値（最初の RR(n)）を durationFirst、
  // 最後のペアの x 値（最後の RR(n-1)）を durationLast とする
  const durationFirst = rrPlotData[0].y; // ms
  const durationLast  = rrPlotData[n - 1].x; // ms

  // 各軸の合計（ms 単位）
  const sumX = rrPlotData.reduce((acc, cur) => acc + cur.x, 0);
  const sumY = rrPlotData.reduce((acc, cur) => acc + cur.y, 0);

  // ms 単位の centerX, centerY を計算し、その後 1000 で割って秒単位に変換
  const centerX_ms = (sumX - durationLast) / (n - 1);
  const centerY_ms = (sumY - durationFirst) / (n - 1);

  const centerX = centerX_ms / 1000;  // 秒単位
  const centerY = centerY_ms / 1000;  // 秒単位

  relax = Math.sqrt(centerX * centerX + centerY * centerY);  // 秒単位
  saveToFirestore(relax);
  console.log("centerX (s):", centerX, "centerY (s):", centerY, "relax (s):", relax);
}
  return (
<div className="App" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
  <div style={{ width: "100%", maxWidth: "600px" }}> {/* グラフの中央配置用 */}
    <h1 style={{ textAlign: "center" }}>RR Point Plot</h1>
    <h2 style={{textAlign: "center"}}>Relax: {relax}</h2>
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 50, left: 60 }}>  {/* 余白を増やす */}
        <CartesianGrid strokeDasharray="3 3" />
        
        <XAxis 
          dataKey="x" 
          type="number"
          name="RR(n-1)" 
          unit="ms" 
          domain={[0, 1500]}  
          ticks={[0, 500, 1000, 1500]}
          label={{ 
            value: "RR Interval (n-1)", 
            position: "insideBottom", 
            dy: 30  // 位置を下げる
          }} 
        />
       
        <YAxis 
          dataKey="y" 
          name="RR(n)" 
          unit="ms"
          domain={[0, 1500]}  
          ticks={[0, 500, 1000, 1500]}
          label={{ 
            value: "RR Interval (n)", 
            angle: -90, 
            position: "insideBottom", 
            dx: -50,  // 位置を調整
            dy: -100 
          }} 
        />

        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
        <Scatter name="RR Plot" data={rrPlotData} fill="#8884d8" />
      </ScatterChart>
    </ResponsiveContainer>

  </div>
</div>

  );
}

export default App;


/* import { useState, useEffect } from "react";
import { saveToFirestore } from "./firebase"; // Firestore 保存関数
import "./App.css";

function App() {
  const [heartRate, setHeartRate] = useState(0);

  // Fitbit API から心拍数データを取得する関数（1秒刻みのデータを要求）
  const fetchHeartRateData = async () => {
    const accessToken = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyM1EzN1ciLCJzdWIiOiJDSEZMQjUiLCJpc3MiOiJGaXRiaXQiLCJ0eXAiOiJhY2Nlc3NfdG9rZW4iLCJzY29wZXMiOiJyc29jIHJlY2cgcnNldCByaXJuIHJveHkgcm51dCBycHJvIHJzbGUgcmNmIHJhY3QgcmxvYyBycmVzIHJ3ZWkgcmhyIHJ0ZW0iLCJleHAiOjE3NDA5MDQwNDYsImlhdCI6MTc0MDg3NTI0Nn0.5ITZLhLNQU2k01Ujuii2r3s19sKZtPZYOUJOtZ_n4hs"; // 注意: アクセストークンは直接埋め込まず、環境変数等で管理するのが望ましいです
    const userId = "-"; // 自分のデータの場合は '-' または 'me'
    const startDate = new Date().toISOString().split("T")[0]; // 今日の日付 (YYYY-MM-DD)
    // 1秒刻みのデータを取得するためにエンドポイントを変更
    const url = `https://api.fitbit.com/1/user/${userId}/activities/heart/date/${startDate}/1d/1sec.json`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // intradayデータの取得（1秒刻みのデータが返される）
      const heartRateData = data["activities-heart-intraday"]?.dataset;
      const latestHeartRate = heartRateData[heartRateData.length - 1].value;
      console.log("Full Dataset:", heartRateData);

      if (heartRateData && heartRateData.length > 0) {
        const now = new Date();
        // 直近1分間（60秒以内）のデータのみをフィルタリング
        const recentData = heartRateData.filter(item => {
          // APIの時刻データは "HH:MM:SS" の形式なので、今日の日付と結合して Date オブジェクトに変換
          const itemTime = new Date(`${startDate}T${item.time}`);
          const diffInSeconds = (now - itemTime) / 1000;
          return diffInSeconds >= 0 && diffInSeconds <= 60;
        });

        if (recentData.length > 0) {
          // 最新のデータを利用（必要に応じて複数データの平均などを計算することも可能）
          const latestHeartRate = recentData[recentData.length - 1].value;
          setHeartRate(latestHeartRate);
          saveToFirestore(latestHeartRate); // Firestore に保存
          console.log("Latest Heart Rate (from recent 1 minute):", latestHeartRate);
        } else {
          const latestHeartRate = heartRateData[heartRateData.length - 1].value;
          setHeartRate(latestHeartRate);
          saveToFirestore(latestHeartRate); // Firestore に保存
          console.log("直近1分間のデータがありません");
        }
      }
    } catch (error) {
      console.error("Error fetching heart rate data:", error);
    }
  };

  useEffect(() => {
    // 初回データ取得
    fetchHeartRateData();
    // 必要に応じて定期的にデータ取得（例: 30秒毎）
    const interval = setInterval(fetchHeartRateData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Heart Rate: {heartRate}</h1>
      </header>
    </div>
  );
}

export default App;
 */