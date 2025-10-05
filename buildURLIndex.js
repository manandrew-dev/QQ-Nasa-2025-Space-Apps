import fs from 'fs'; // File system module for file operations
import readline from 'readline'; // Readline module for reading files line by line

let urlIndex = null; // Variable to store the URL index
let building = null; // Variable to indicate if the index is being built
let lastSize = 0; // Variable to track the last size of the file

export async function buildURLIndex(dataPath = './data/data.txt') {
    if (building) {
        return building; // If already building, return the existing promise
    }
    building = (async () => {
        const nextSet = new Set(); // Set to store unique URLs
        
        const stream = fs.createReadStream(dataPath, { encoding: 'utf8' }); // Create a read stream for the data file
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity }); // Read file line by line

        try {
            for await (const line of rl) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    nextSet.add(trimmedLine); // Add non-empty lines to the set
                }
            }
            
            urlIndex = nextSet; // Update the URL index with the new set
            lastSize = fs.statSync(dataPath).size;
        } finally {
            rl.close(); // Ensure the readline interface is closed
            stream.destroy();
            building = null; // Reset the building variable
        }
    })();
    return building; // Return the promise representing the build process
}

export function hasURL(targeturl) {
    if (!urlIndex) {
        throw new Error('URL index not built yet. Please wait and try again.');
    }
    return urlIndex.has(String(targeturl).trim()); // Check if the target URL exists in the index
}

export function urlIndexSize() {
    return lastSize; // Return the last size of the data file
}

export function isURLIndexReady() {
    return !!urlIndex; // Return true if the URL index is built, false otherwise
}