const fs = require('fs');
const path = require('path');

// Read miko-anime.js
const code = fs.readFileSync(path.join(__dirname, 'miko-anime.js'), 'utf8');

// Evaluate in global context
eval(code);

async function testLunaMikoModule() {
    console.log('=== Test 1: searchResults("One Piece") ===');
    const searchRes = JSON.parse(await searchResults('One Piece'));
    console.log(`Found ${searchRes.length} search results:`);
    console.log(searchRes.slice(0, 3));

    if (searchRes.length === 0) throw new Error('Search returned 0 items!');

    const animeUrl = searchRes[0].href;
    console.log('\n=== Test 2: extractDetails ===', animeUrl);
    const details = JSON.parse(await extractDetails(animeUrl));
    console.log('Details:', details);

    console.log('\n=== Test 3: extractEpisodes ===', animeUrl);
    const episodes = JSON.parse(await extractEpisodes(animeUrl));
    console.log(`Extracted ${episodes.length} episodes:`);
    console.log(episodes.slice(0, 5));

    if (episodes.length === 0) throw new Error('Episodes list empty!');

    const epUrl = episodes[0].href;
    console.log('\n=== Test 4: extractStreamUrl ===', epUrl);
    const streamInfo = JSON.parse(await extractStreamUrl(epUrl));
    console.log('Stream Info:', streamInfo);
}

testLunaMikoModule().catch(err => console.error('Luna Module Test Error:', err));
