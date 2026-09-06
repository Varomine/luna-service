async function verifyLiveManifest() {
    const url = 'https://raw.githubusercontent.com/Varomine/luna-service/main/miko-anime/miko-anime.json';
    console.log('=== Checking live raw GitHub manifest:', url);
    const res = await fetch(url);
    console.log('HTTP Status:', res.status);
    const json = await res.json();
    console.log('Manifest content:', json);
}

verifyLiveManifest();
