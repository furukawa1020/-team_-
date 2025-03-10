import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc ,getDocs, deleteDoc, serverTimestamp, query, orderBy, limit} from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCImfkIYX3RAyvcu7tYZxt9oWkO2fLJDIs",
    authDomain: "fitbitinfo-cc806.firebaseapp.com",
    projectId: "fitbitinfo-cc806",
    storageBucket: "fitbitinfo-cc806.firebasestorage.app",
    messagingSenderId: "232435226164",
    appId: "1:232435226164:web:f3a5e29e14e96b99b99c61",
    measurementId: "G-BVPL2TW9M8"
};

// Firebase アプリを初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// もっとも最近追加されたデータを取得する 
const fetchUserData = async () => {
  try {
    const q = query(collection(db, "users"), orderBy("timestamp", "desc"), limit(1));
    console.log(q);
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const maxDoc = querySnapshot.docs[0];
      console.log("最大のIDを持つデータ:", maxDoc.id, maxDoc.data());
      return { id: maxDoc.id, data: maxDoc.data() };
    } else {
      console.log("データがありません");
      return null;
    }
  } catch (error) {
    console.error("データ取得エラー:", error);
    return null;
  }
};

// Firestore の全データを削除する関数
const deleteAllDocuments = async () => {
    try {
        const usersCollection = collection(db, "users");
        const snapshot = await getDocs(usersCollection);

        // すべてのドキュメントを削除
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);

        console.log("Firestore のデータをすべて削除しました。");
    } catch (error) {
        console.error("データ削除時のエラー:", error);
    }
};

const updateAccessToken = async (refreshToken, id, secret) => {
    try {
        const base64Before = `${id}:${secret}`;
        const base64After = btoa(base64Before); // Reactでは `btoa()` を使用

        const response = await fetch("https://api.fitbit.com/oauth2/token", {
            method: "POST",
            headers: {
                Accept: "application/json",
                Authorization: `Basic ${base64After}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
        });

        const data = await response.json();

        if (data.access_token && data.refresh_token) {
            console.log("access_tokenの更新 -> 成功");
            return {
                newAccessToken: data.access_token,
                newRefreshToken: data.refresh_token,
            };
        } else {
            console.error("access_tokenの更新 -> 失敗", data);
            return null;
        }
    } catch (error) {
        console.error("エラー発生: ", error);
        return null;
    }
};
// Firestore にデータを保存する関数 (最初のデータ保存時に全削除)
let isFirstSave = true; // 初回保存フラグ
const updateTokens = async (accessToken, refreshToken) => {
    try {
      console.log("accessToken:", accessToken);
      console.log("refreshToken:", refreshToken);

      if (!accessToken) {
        console.error("Error: accessToken is undefined or null");
        return;
      }
      if (!refreshToken) {
        console.error("Error: refreshToken is undefined or null");
        return;
      }

      const tokenRef = doc(db, "config", "config2");
      await setDoc(tokenRef, {
        access_token: accessToken,
        refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
      }, { merge: true });  // 🔹 変更点: 既存データを保持しつつ、トークンのみ更新

      console.log("Tokens updated successfully in Firestore");
    } catch (error) {
      console.error("Error updating tokens:", error);
    }
}



const saveToFirestore = async (value) => {
    try {
        
        const usersCollection = collection(db, "users");

/*         // 最初の保存時のみ削除処理を実行
        if (isFirstSave) {
            await deleteAllDocuments();
            isFirstSave = false; // 削除処理は1回だけ実行
        } */

        // Firestore に保存されているドキュメント数を取得
        const snapshot = await getDocs(usersCollection);
        const count = snapshot.size + 1; // 連番を決定

        // 連番のドキュメント ID を作成
        const docId = `data${String(count).padStart(5, '0')}`; // "data001" 形式

        // Firestore にデータを保存
        await setDoc(doc(usersCollection, docId), {
            value: value,
            timestamp: serverTimestamp()
        });

        console.log(`データを ${docId} に保存しました:`, value);
    } catch (error) {
        console.error("エラー:", error);
    }
};
const getFitbitConfigNames = async() =>{
  try{
    const configRef = collection(db, "config");
    const configSnap = await getDocs(configRef);
    if(!configSnap.empty){
      const configNames = configSnap.docs.map(doc => doc.id);
      return configNames
    }

  }catch(error){
    console.error("ドキュメントエラー", error);
    return null;
  }
}
const getFitbitConfig = async (configName) => {
    try {
      const configRef = doc(db, "config", configName);
      const configSnap = await getDoc(configRef);
  
      if (configSnap.exists()) {
        const config = configSnap.data();
        return {
          clientId: config.client_id,
          secretId: config.client_secret,
          accessToken: config.access_token,
          refreshToken: config.refresh_token,
        };
      } else {
        throw new Error("Fitbit config document not found in Firestore");
      }
    } catch (error) {
      console.error("Error fetching Fitbit config:", error);
      return null;
    }
  };
 
export { db, saveToFirestore, updateTokens, getFitbitConfig, updateAccessToken, fetchUserData, getFitbitConfigNames};
