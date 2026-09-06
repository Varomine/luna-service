async function testThaiSearch() {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': 'https://miko-anime.com/search/',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
    };

    const keyword = 'ชมรมคนไร้เพื่อน';
    console.log('=== Test 1: POST to library/search.php with:', keyword);
    const body = new URLSearchParams({ name: keyword }).toString();
    console.log('Body URL encoded:', body);

    const res = await fetch('https://miko-anime.com/library/search.php', {
        method: 'POST',
        headers,
        body
    });

    console.log('Status:', res.status);
    const html = await res.text();
    console.log('Response Length:', html.length);
    console.log('\nResponse HTML Content:\n', html);

    // Let's also check GET /search/?q=ชมรมคนไร้เพื่อน or /search/
    console.log('\n=== Test 2: GET https://miko-anime.com/search/?q=... ===');
    const getRes = await fetch(`https://miko-anime.com/search/?q=${encodeURIComponent(keyword)}`, {
        headers: { 'User-Agent': headers['User-Agent'], 'Referer': 'https://miko-anime.com/' }
    });
    console.log('GET Status:', getRes.status);
    const getHtml = await getRes.text();
    console.log('GET Length:', getHtml.length);
    console.log('GET Snippet:\n', getHtml.slice(0, 1500));
}

testThaiSearch();
