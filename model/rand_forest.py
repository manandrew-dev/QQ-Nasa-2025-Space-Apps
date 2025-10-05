import os
import sys
import json
import pandas as pd
from flask import Flask, request, jsonify
from geopy.geocoders import Nominatim
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
import joblib

# =========================================================
# 🔧 基本路径配置
# =========================================================
MODEL_PATH = "random_forest_model.pkl"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "weatherAUS.csv")

app = Flask(__name__)

# =========================================================
# 🧠 简单 WeatherPredictor 类
# =========================================================
class WeatherPredictor:
    def __init__(self, model_type="random_forest", task="classification"):
        self.model_type = model_type
        self.task = task
        self.model = None

    def train(self, df):
        df = df.dropna(subset=["RainTomorrow"])
        df["RainTomorrow"] = (df["RainTomorrow"] == "Yes").astype(int)

        # 选取简单特征
        X = pd.get_dummies(df[["Location", "MinTemp", "MaxTemp", "Rainfall", "Humidity3pm", "Pressure9am"]].fillna(0))
        y = df["RainTomorrow"]

        self.model = RandomForestClassifier(n_estimators=100, random_state=42)
        self.model.fit(X, y)
        self.columns = X.columns

    def predict(self, df):
        X = pd.get_dummies(df[["Location", "MinTemp", "MaxTemp", "Rainfall", "Humidity3pm", "Pressure9am"]].fillna(0))
        for col in self.columns:
            if col not in X.columns:
                X[col] = 0
        X = X[self.columns]
        return self.model.predict(X)

    def predict_proba(self, df):
        X = pd.get_dummies(df[["Location", "MinTemp", "MaxTemp", "Rainfall", "Humidity3pm", "Pressure9am"]].fillna(0))
        for col in self.columns:
            if col not in X.columns:
                X[col] = 0
        X = X[self.columns]
        return self.model.predict_proba(X)


# =========================================================
# 🧩 模型加载/保存函数
# =========================================================
def save_model(model, path):
    joblib.dump(model, path)

def load_model(path):
    return joblib.load(path)


# =========================================================
# 🧠 模型准备
# =========================================================
if not os.path.exists(MODEL_PATH):
    print("\n⚠️ No saved model found. Training new model...")
    df = pd.read_csv(CSV_PATH)
    predictor = WeatherPredictor(model_type='random_forest', task='classification')
    predictor.train(df)
    save_model(predictor, MODEL_PATH)
    model = predictor
else:
    print("\n✓ Loading existing model...")
    model = load_model(MODEL_PATH)


# =========================================================
# 🌐 Flask API 部分（保持原功能）
# =========================================================
@app.route("/predict", methods=["POST"])
def predict_api():
    data = request.get_json()
    location = data.get("location")
    date = data.get("date")

    if not location or not date:
        return jsonify({"error": "Missing location or date"}), 400

    # 构造假设天气条件
    dummy = pd.DataFrame({
        "Location": [location],
        "MinTemp": [15],
        "MaxTemp": [25],
        "Rainfall": [2],
        "Humidity3pm": [70],
        "Pressure9am": [1010]
    })

    prediction = model.predict(dummy)[0]
    prob = float(model.predict_proba(dummy)[0][1])

    return jsonify({
        "location": location,
        "date": date,
        "rain_tomorrow": bool(prediction),
        "confidence": prob
    })


# =========================================================
# 🚀 CLI 模式（用于 Node.js 调用）
# =========================================================
if len(sys.argv) >= 3:
    try:
        lat, lon = float(sys.argv[1]), float(sys.argv[2])
    except ValueError:
        print(json.dumps({"error": "Invalid latitude/longitude"}))
        sys.exit(0)

    geolocator = Nominatim(user_agent="nasa_space_app")
    location = geolocator.reverse((lat, lon), language="en")

    if location and "address" in location.raw:
        addr = location.raw["address"]
        city = addr.get("city") or addr.get("town") or addr.get("state")
    else:
        city = None

    if not city:
        print(json.dumps({"error": "City not found for given coordinates"}))
        sys.exit(0)

    # 构造输入样本
    dummy = pd.DataFrame({
        "Location": [city],
        "MinTemp": [15],
        "MaxTemp": [25],
        "Rainfall": [2],
        "Humidity3pm": [70],
        "Pressure9am": [1010]
    })

    try:
        pred = model.predict(dummy)[0]
        prob = float(model.predict_proba(dummy)[0][1])
        result = {
            "location": city,
            "prediction": "Yes" if pred == 1 else "No",
            "confidence": prob
        }
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(0)


# =========================================================
# 🖥️ 启动 Flask 服务（只有直接运行时才会执行）
# =========================================================
if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", 8000))
    print("=" * 70)
    print("🌦️ WEATHER PREDICTION API RUNNING")
    print("=" * 70)
    app.run(host="0.0.0.0", port=PORT, debug=True)
