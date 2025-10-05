import os
import json
import h5py
import numpy as np
import sys

DATA_DIR = "./data"
MISSING_VALUE = -9999.9


def extract_precip_at_location(filepath, target_lat, target_lon, max_radius=5):

    try:
        with h5py.File(filepath, "r") as f:
            lat = np.array(f["Grid/lat"])
            lon = np.array(f["Grid/lon"])
            precip = np.array(f["Grid/precipitation"])
            precip = np.squeeze(precip)

            # 🚀 修正纬度方向（若倒序）
            if lat[0] > lat[-1]:
                lat = lat[::-1]
                precip = precip[::-1, :]

            # ✅ 强制假定文件使用 -180~180，经度输入直接使用
            if target_lon < -180 or target_lon > 180:
                # 若输入异常（超出范围），自动归一化
                target_lon = ((target_lon + 180) % 360) - 180

            # 找到最近格点
            lat_idx = np.argmin(np.abs(lat - target_lat))
            lon_idx = np.argmin(np.abs(lon - target_lon))

            # 获取初始值
            value = precip[lat_idx, lon_idx]

            # ✅ 若该点有效 → 返回
            if value != MISSING_VALUE and not np.isnan(value):
                return float(value)

            # 🚀 否则逐步扩大邻域搜索
            for radius in range(1, max_radius + 1):
                lat_min = max(lat_idx - radius, 0)
                lat_max = min(lat_idx + radius + 1, precip.shape[0])
                lon_min = max(lon_idx - radius, 0)
                lon_max = min(lon_idx + radius + 1, precip.shape[1])

                region = precip[lat_min:lat_max, lon_min:lon_max]
                region = region[region != MISSING_VALUE]
                if region.size > 0:
                    return float(np.mean(region))

            # ❌ 未找到有效值
            return None

    except Exception as e:
        sys.stderr.write(f"Error reading {filepath}: {e}\n")
        return None


def process_all_files(data_dir, lat, lon):

    values = []
    for filename in os.listdir(data_dir):
        if filename.endswith(".HDF5"):
            filepath = os.path.join(data_dir, filename)
            val = extract_precip_at_location(filepath, lat, lon)
            if val is not None:
                values.append(val)

    if not values:
        return {"error": "No valid precipitation data found"}


    avg_precip_hr = float(np.mean(values))
    avg_precip_day = avg_precip_hr * 3
    rainy_count = sum(v > 0.1 for v in values)
    rain_prob = round(rainy_count / len(values) * 100, 1)

    will_rain = rain_prob > 30 or avg_precip_hr > 0.2

    if avg_precip_hr < 0.1:
        category = "no rain"
    elif avg_precip_hr < 1:
        category = "light rain"
    elif avg_precip_hr < 4:
        category = "moderate rain"
    else:
        category = "heavy rain"

    return {
        "location": f"lat={lat}, lon={lon}",
        "average_precipitation_mm_per_hr": round(avg_precip_hr, 3),
        "average_daily_precipitation_mm": round(avg_precip_day, 3),
        "rain_probability_percent": rain_prob,
        "will_it_rain": will_rain,
        "rain_intensity_category": category,
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python read_imerg.py <lat> <lon>"}))
        sys.exit(0)

    lat = float(sys.argv[1])
    lon = float(sys.argv[2])
    result = process_all_files(DATA_DIR, lat, lon)
    print(json.dumps(result, indent=2))
