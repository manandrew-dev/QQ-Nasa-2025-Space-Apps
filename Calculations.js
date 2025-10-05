import express from "express";
import fs from "fs";
import { NetCDFReader } from "netcdfjs";

const router = express.Router();

function formatTime(date, time, tzone) {
  // Combine date and time from the frontend into a local Date object
const [year, month, day] = date.split("-").map(Number);
const [hour, minute] = time.split(":").map(Number);
const localDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Convert the timezone offset (hours → minutes) and adjust to UTC
  const offsetMinutes = parseInt(tzone, 10) * 60;
  const utcDate = new Date(localDate.getTime() - offsetMinutes * 60 * 1000);

  // Get UTC hours and minutes
  let hours = utcDate.getUTCHours();
  let minutes = utcDate.getUTCMinutes();

  // NASA data files are divided into 30-minute blocks.
  const blockIndex = Math.floor(minutes / 30);
  const blockStartMin = blockIndex * 30;
  const blockEndMin = blockStartMin + 29;
  const blockStartSec = 0;
  const blockEndSec = 59;

  // Compute end time (half an hour later, minus one second)
  let endHours = hours;
  let endMinutes = blockEndMin;
  if (blockEndMin >= 60) {
    endHours += 1;
    endMinutes -= 60;
  }

  // Format NASA-style start and end times
  const formattedStart = `S${hours.toString().padStart(2, '0')}${blockStartMin
    .toString()
    .padStart(2, '0')}${blockStartSec.toString().padStart(2, '0')}`;
  const formattedEnd = `E${endHours.toString().padStart(2, '0')}${endMinutes
    .toString()
    .padStart(2, '0')}${blockEndSec.toString().padStart(2, '0')}`;

  // File index code (e.g., .0000, .0030, .0060)
  const fileIndex = (hours * 60 + blockStartMin).toString().padStart(4, "0");

  // UTC date in YYYYMMDD format for NASA filename
  const utcDateString = utcDate.toISOString().slice(0, 10).replace(/-/g, "");

  return { formattedStart, formattedEnd, utcDateString, fileIndex };
}

// ---- Route: /calculate_prob ----
router.get("/calculate_prob", (req, res) => {
  try {
    const { coords, date, time, tzone } = req.query;
    const { formattedStart, formattedEnd, utcDateString, fileIndex } = formatTime(
      date,
      time,
      tzone
    );

    const year = utcDateString.slice(0, 4);
    const doy =
    Math.floor(
      (new Date(
        `${utcDateString.slice(0, 4)}-${utcDateString.slice(4, 6)}-${utcDateString.slice(6, 8)}`
      ) - new Date(`${year}-01-01`)) / 86400000
    ) + 1;

    const url = `https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/GPM_3IMERGHH.07/${year}/${doy
      .toString()
      .padStart(
        3,
        "0"
      )}/3B-HHR.MS.MRG.3IMERG.${utcDateString}-${formattedStart}-${formattedEnd}.${fileIndex}.V07B.HDF5`;

    console.log("Target URL:", url);
    res.json({ targeturl: url, coords });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export { router as calcRouter, formatTime };