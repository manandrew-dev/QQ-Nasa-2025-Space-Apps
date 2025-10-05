import sys, json, os, h5py, numpy as np

def extract_precip_at_location(filepath, target_lat, target_lon):
    if not os.path.exists(filepath):
        return {"error": f"File not found: {filepath}"}

    try:
        with h5py.File(filepath, "r") as f:
            for key in ["Grid/precipitation", "Grid/precipitationCal", "Grid/precipitationUncal"]:
                if key in f:
                    precip = np.array(f[key])
                    ds_name = key
                    break
            else:
                return {"error": "No precipitation dataset found"}

            lat = np.array(f["Grid/lat"])
            lon = np.array(f["Grid/lon"])

            # 输出调试信息
            shape = precip.shape
            sys.stderr.write(f"[DEBUG] {ds_name} shape={shape}, lat={lat.size}, lon={lon.size}\n")

            # 修正纬度方向
            if lat[0] > lat[-1]:
                lat = lat[::-1]
                if precip.ndim >= 2:
                    precip = np.flip(precip, axis=-2)

            # 最近点索引（防止越界）
            lat_idx = int(np.clip(np.argmin(np.abs(lat - float(target_lat))), 0, len(lat) - 1))
            lon_idx = int(np.clip(np.argmin(np.abs(lon - float(target_lon))), 0, len(lon) - 1))

            # 自动判断维度顺序
            if precip.ndim == 3:
                # 判断哪个轴匹配 lat/lon 大小
                if shape[-2] == lat.size and shape[-1] == lon.size:
                    val = np.nanmean(precip[:, lat_idx, lon_idx])
                elif shape[-2] == lon.size and shape[-1] == lat.size:
                    val = np.nanmean(precip[:, lon_idx, lat_idx])
                else:
                    val = np.nanmean(precip)
            elif precip.ndim == 2:
                if shape[0] == lat.size and shape[1] == lon.size:
                    val = precip[lat_idx, lon_idx]
                elif shape[0] == lon.size and shape[1] == lat.size:
                    val = precip[lon_idx, lat_idx]
                else:
                    val = np.nanmean(precip)
            else:
                val = float(np.nanmean(precip))

            if np.isnan(val) or val < 0:
                val = 0.0

            return {"precip_mm_per_hr": float(val)}

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(json.dumps({"error": "Usage: python read_imerg.py lat lon filepath"}))
        sys.exit(1)

    lat, lon, filepath = sys.argv[1], sys.argv[2], sys.argv[3]

    # 🚀 调试信息写入 stderr，不干扰 stdout
    sys.stderr.write(f"[DEBUG] reading {filepath}\n")

    result = extract_precip_at_location(filepath, float(lat), float(lon))
    print(json.dumps(result))  # ✅ 仅输出最终 JSON

