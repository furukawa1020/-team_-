import React, { useState, useEffect } from "react";

const FuguGraphic = ({ stressValue }) => {
  const [currentSize, setCurrentSize] = useState(100);

  useEffect(() => {
    let newSize = 200 - stressValue; // ストレス値が 0 なら最大 (200)、100 なら最小 (100)
    newSize = Math.max(100, Math.min(newSize, 200)); // 最小100、最大200に制限

    let step = (newSize - currentSize) / 10; // 1秒かけてスムーズに変化

    const interval = setInterval(() => {
      setCurrentSize((prevSize) => {
        const updatedSize = prevSize + step;
        if (Math.abs(updatedSize - newSize) < 1) {
          clearInterval(interval);
          return newSize;
        }
        return updatedSize;
      });
    }, 100); // 100msごとに変化（1秒間で完了）

    return () => clearInterval(interval);
  }, [stressValue, currentSize]);

  return (
    <svg width="300" height="200" viewBox="0 0 300 200">
      {/* フグの本体（楕円） */}
      <ellipse cx="150" cy="100" rx={currentSize} ry={currentSize / 1.5} fill="lightblue" stroke="blue" strokeWidth="3" />

      {/* 目 */}
      <circle cx="110" cy="70" r="8" fill="black" />
      <circle cx="190" cy="70" r="8" fill="black" />

      {/* 口（ストレス値が高いと怒ったようにする） */}
      <path
        d={`M120,130 Q150,${140 + stressValue / 5} 180,130`}
        stroke="black"
        strokeWidth="3"
        fill="none"
      />

      {/* ヒレ */}
      <polygon points="50,100 80,80 80,120" fill="blue" />
      <polygon points="250,100 220,80 220,120" fill="blue" />
    </svg>
  );
};

export default FuguGraphic;
