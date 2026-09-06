const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, 'miko-anime.js'), 'utf8');
eval(code);

async function debugSearchResults() {
    const keyword = 'ชมรมคนไร้เพื่อน';
    console.log('Testing searchResults with:', keyword);
    const jsonStr = await searchResults(keyword);
    console.log('Raw searchResults JSON:\n', jsonStr);
    const parsed = JSON.parse(jsonStr);
    console.log(`Parsed ${parsed.length} items:`, parsed);
}

debugSearchResults();
