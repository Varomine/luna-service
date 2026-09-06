async function testUrls() {
    const rawUrl = 'https://raw.githubusercontent.com/Varomine/luna-service/main/miko-anime/miko-anime.json';
    console.log('Fetching raw GitHub:', rawUrl);
    const res1 = await fetch(rawUrl);
    console.log('Raw GitHub Status:', res1.status);

    const pagesUrl = 'https://varomine.github.io/luna-service/miko-anime/miko-anime.json';
    console.log('Fetching GitHub Pages:', pagesUrl);
    const res2 = await fetch(pagesUrl);
    console.log('GitHub Pages Status:', res2.status);

    // Also check mioanime
    const mioPagesUrl = 'https://varomine.github.io/luna-service/mioanime/mioanime.json';
    console.log('Fetching mioanime GitHub Pages:', mioPagesUrl);
    const res3 = await fetch(mioPagesUrl);
    console.log('Mioanime GitHub Pages Status:', res3.status);
}

testUrls();
