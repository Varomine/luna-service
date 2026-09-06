async function testStreamPlayability() {
    const playlistUrl = 'https://overlay.stream-s.sbs/quality/R9kkPLcO/1080/';
    console.log('=== Step 1: Fetching playlist:', playlistUrl);

    const playlistRes = await fetch(playlistUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Referer': 'https://overlay.stream-s.sbs/'
        }
    });

    console.log('Playlist HTTP Status:', playlistRes.status);
    const m3u8Text = await playlistRes.text();
    console.log('\nM3U8 Playlist Content:\n', m3u8Text.slice(0, 1000));

    // Extract segment URLs
    const lines = m3u8Text.split('\n').map(l => l.trim());
    const segments = lines.filter(l => l && !l.startsWith('#'));

    console.log(`\nFound ${segments.length} segments.`);
    if (segments.length === 0) {
        console.error('ERROR: No segment URLs found!');
        return;
    }

    // Test Segment 0 (proxied segment)
    const seg0 = segments[0];
    console.log('\n=== Step 2: Fetching Segment 0 ===\nURL:', seg0);
    const seg0Res = await fetch(seg0, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Referer': 'https://overlay.stream-s.sbs/'
        }
    });
    console.log('Segment 0 Status:', seg0Res.status);
    console.log('Segment 0 Content-Type:', seg0Res.headers.get('content-type'));
    console.log('Segment 0 CORS header:', seg0Res.headers.get('access-control-allow-origin'));

    const seg0Data = Buffer.from(await seg0Res.arrayBuffer());
    console.log('Segment 0 Size:', seg0Data.length, 'bytes');
    console.log('Segment 0 First 16 Bytes (hex):', seg0Data.slice(0, 16).toString('hex'));

    // Check if TS sync byte 0x47 is present
    if (seg0Data[0] === 0x47) {
        console.log('✅ Segment 0 is a VALID MPEG-TS video segment (Sync byte 0x47 verified)!');
    } else {
        console.log('❌ Segment 0 does NOT start with 0x47 sync byte!');
    }

    // Test Segment 1 (direct box-04 segment)
    const seg1 = segments[1];
    console.log('\n=== Step 3: Fetching Segment 1 ===\nURL:', seg1);
    const seg1Res = await fetch(seg1, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Referer': 'https://overlay.stream-s.sbs/'
        }
    });
    console.log('Segment 1 Status:', seg1Res.status);
    console.log('Segment 1 Content-Type:', seg1Res.headers.get('content-type'));
    console.log('Segment 1 CORS header:', seg1Res.headers.get('access-control-allow-origin'));

    const seg1Data = Buffer.from(await seg1Res.arrayBuffer());
    console.log('Segment 1 Size:', seg1Data.length, 'bytes');
    console.log('Segment 1 First 16 Bytes (hex):', seg1Data.slice(0, 16).toString('hex'));

    if (seg1Data[0] === 0x47) {
        console.log('✅ Segment 1 is a VALID MPEG-TS video segment (Sync byte 0x47 verified)!');
    } else {
        console.log('❌ Segment 1 does NOT start with 0x47 sync byte!');
    }
}

testStreamPlayability();
