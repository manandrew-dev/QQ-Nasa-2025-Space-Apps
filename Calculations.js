import fs from 'fs'; // File system module for file operations
import { NetCDReader } from 'netcdfjs'; // NetCDF reader library

function formatTime(time) {
    //pass
    return time;
}

async function calculate_prob() {
    app.get('/calculate_prob', (req, res) => {
        try {
            const { time }  = req.query;
            const { date } = req.query;
            const { formatedTime } = formatTime(time);
            const filepath = './data/data.txt'
            const data = fs.readFileSync(filepath, 'utf8').split('\n').map(line => line.trim()).filter(boolean);

            const targeturl = `https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/GPM_3IMERGHH.07/1998/001/3B-HHR.MS.MRG.3IMERG.${date}-${formatedTime}.0000.V07B.HDF5`
        }
        catch (error) {
            // Handle errors
        }
    });
}