import express from "express";
import fs from "fs";
import { NetCDFReader } from "netcdfjs";

const router = express.Router();

/**
 * Convert local date/time to NASA-style UTC file name format
 * Example output:
 * {
 *   formattedStart: 'S233000',
 *   formattedEnd: 'E235959',
 *   utcDateString: '20250531',
 *   fileIndex: '1410'
 * }
 */
function formatTime(date, time, tzone) {
  // Parse date and time into UTC (no timezone ambiguity)
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Apply timezone offset (hours → minutes)
  const offsetMinutes = parseInt(tzone, 10) * 60;
  const utcDate = new Date(localDate.getTime() - offsetMinutes * 60 * 1000);

  // Get UTC hour & minute
  let hours = utcDate.getUTCHours();
  let minutes = utcDate.getUTCMinutes();

  // Each IMERG file covers a 30-minute block
  const blockIndex = Math.floor(minutes / 30);
  const blockStartMin = blockIndex * 30;
  const blockEndMin = blockStartMin + 29;
  const blockStartSec = 0;
  const blockEndSec = 59;

  // Compute end time (half an hour later, minus 1 sec)
  let endHours = hours;
  let endMinutes = blockEndMin;
  if (blockEndMin >= 60) {
    endHours += 1;
    endMinutes -= 60;
  }

  // Format NASA-style time segments
  const formattedStart = `S${hours.toString().padStart(2, "0")}${blockStartMin
    .toString()
    .padStart(2, "0")}${blockStartSec.toString().padStart(2, "0")}`;
  const formattedEnd = `E${endHours.toString().padStart(2, "0")}${endMinutes
    .toString()
    .padStart(2, "0")}${blockEndSec.toString().padStart(2, "0")}`;

  // File index code (e.g., .0000, .0030, .0060, ...)
  const fileIndex = (hours * 60 + blockStartMin).toString().padStart(4, "0");

  // UTC date in YYYYMMDD format for NASA filename
  const utcDateString = utcDate.toISOString().slice(0, 10).replace(/-/g, "");

  return { formattedStart, formattedEnd, utcDateString, fileIndex };
}

/**
 * ---- Route: /calculate_prob ----
 * Given a future date/time from frontend, return historical NASA IMERG filenames
 * covering the same month/day/time range for years 1999–2025.
 */
router.get("/calculate_prob", (req, res) => {
  try {
    const { coords, date, time, tzone } = req.query;

    if (!date || !time || !tzone) {
      return res
        .status(400)
        .json({ error: "Missing required parameters: date, time, tzone" });
    }

    // Extract the month & day from input date
    const [inputYear, inputMonth, inputDay] = date.split("-").map(Number);

    const results = [];

    // Loop through historical years 1999–2025
    for (let year = 1998; year <= 2025; year++) {
        // 🚫 Skip future data beyond 2025-05-31 (no data available yet)
        if (year === 2025 && (inputMonth > 5 || (inputMonth === 5 && inputDay > 31))) continue;
        const newDate = `${year}-${String(inputMonth).padStart(2, "0")}-${String(inputDay).padStart(2, "0")}`;      

      const { formattedStart, formattedEnd, utcDateString, fileIndex } =
        formatTime(newDate, time, tzone);

      // Compute day of year (DOY)
      const doy =
        Math.floor(
          (new Date(
            `${utcDateString.slice(0, 4)}-${utcDateString.slice(
              4,
              6
            )}-${utcDateString.slice(6, 8)}`
          ) -
            new Date(`${year}-01-01`)) /
            86400000
        ) + 1;

      // Construct NASA data URL
      const url = `https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/GPM_3IMERGHH.07/${year}/${doy
        .toString()
        .padStart(
          3,
          "0"
        )}/3B-HHR.MS.MRG.3IMERG.${utcDateString}-${formattedStart}-${formattedEnd}.${fileIndex}.V07B.HDF5`;

      results.push({
        year,
        url,
      });
    }

    // Send JSON response
    res.json({
      message: `Historical IMERG files for ${String(inputMonth).padStart(
        2,
        "0"
      )}-${String(inputDay).padStart(2, "0")} ${time}`,
      count: results.length,
      files: results,
      coords,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export { router as calcRouter, formatTime };
