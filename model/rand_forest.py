# model/rand_forest.py — robust CLI returning JSON only
import sys, json, math
from datetime import datetime

# Offline nearest AU city fallback (used only if no city passed)
AU_CITIES = [
    ("Sydney",   -33.8688, 151.2093),
    ("Melbourne",-37.8136, 144.9631),
    ("Brisbane", -27.4698, 153.0251),
    ("Perth",    -31.9523, 115.8613),
    ("Adelaide", -34.9285, 138.6007),
    ("Canberra", -35.2809, 149.1300),
    ("Hobart",   -42.8821, 147.3272),
    ("Darwin",   -12.4634, 130.8456),
]

def nearest_au_city(lat, lng):
    best = None
    best_d2 = 1e18
    for name, clat, clng in AU_CITIES:
        d2 = (lat - clat) ** 2 + (lng - clng) ** 2
        if d2 < best_d2:
            best_d2 = d2
            best = name
    return best

def parse_args(argv):
    # Expect: lat lng tzone date time [city]
    if len(argv) < 6:
        print(json.dumps({"error": "Usage: rand_forest.py <lat> <lng> <tzone> <date:YYYY-MM-DD> <time:HH:MM> [city]"}))
        sys.exit(0)
    try:
        lat = float(argv[1]); lng = float(argv[2])
    except Exception:
        print(json.dumps({"error": "Invalid lat/lng"})); sys.exit(0)
    tzone = str(argv[3])
    date_s = argv[4]
    time_s = argv[5]
    city = argv[6] if len(argv) >= 7 and argv[6] else None
    return lat, lng, tzone, date_s, time_s, city

def mock_predict(lat, lng, tzone, date_s, time_s, city):
    # Replace this with your actual ML model inference and chart generation
    try:
        dt = datetime.fromisoformat(f"{date_s}T{time_s}")
    except Exception:
        dt = datetime.utcnow()
    prob = (abs(math.sin((lat + lng) * 0.1)) * 0.6 + (dt.hour % 6) * 0.05)
    prob = max(0.0, min(1.0, prob))
    avg_mm_hr = round(prob * 5.0, 2)
    category = "Heavy" if prob > 0.66 else "Moderate" if prob > 0.33 else "Light" if prob > 0.1 else "None"
    return {
        "location": city or "Unknown",
        "confidence": prob,  # 0..1
        "average_precipitation_mm_per_hr": avg_mm_hr,
        "rain_intensity_category": category,
        "chart_image_base64": None  # embed base64 chart string here when ready
    }

def main():
    lat, lng, tzone, date_s, time_s, city = parse_args(sys.argv)
    if not city:
        city = nearest_au_city(lat, lng)
    result = mock_predict(lat, lng, tzone, date_s, time_s, city)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
