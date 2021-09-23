const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const config = require('./config.js');

(async () => {
    try {
        var args = process.argv.slice(2);
        if (args.length === 0) {
            console.log("Missing book url");
            return;
        }

        if (config.user.length === 0) {
            console.log("Edit config.js");
            return;
        }

        const browser = await puppeteer.launch({
            defaultViewport: { height: config.height, width: config.width },
            headless: true
        });
        const page = await browser.newPage();
        await page.setUserAgent(config.userAgent);

        // Login
        await page.goto('https://www.hubscuola.it/login', { waitUntil: 'networkidle2' });
        const cookieSelector = 'button.iubenda-cs-accept-btn';
        await page.waitForSelector(cookieSelector);
        await page.click(cookieSelector);
        await page.type('input[name=email]', config.user);
        await page.type('input[name=password]', config.password);
        await page.click('button.button_accedi');
        await page.waitForNavigation();

        const url = args[0];
        const parsedUrl = new URL(url);
        if (parsedUrl.searchParams.get('page') < 2) {
            await fs.rm(config.output, { recursive: true, force: true }).catch(e => { });
            await fs.mkdir(config.output);
        }
        await page.goto(url, { waitUntil: 'networkidle2' });

        const nextButtonSelector = 'a.g-btn-page--next';

        async function scrapePage() {
            const frameHandle = await page.waitForSelector('iframe[title="PSPDFKit"]');
            const frame = await frameHandle.contentFrame();

            const elementSelector = 'section.PSPDFKit-Page[data-page-is-loaded="true"]';
            let element = await frame.waitForSelector(elementSelector);

            // await page.waitForTimeout(4000);
            await page.waitForNetworkIdle();

            /* await frame.evaluate((elementSelector) => {
                let el = document.querySelector(elementSelector);
                el.requestFullscreen();
            }, elementSelector); */

            await page.evaluate((nextButtonSelector) => {
                let el = document.querySelector(nextButtonSelector);
                el.style.visibility = "hidden";
            }, nextButtonSelector);

            const pageNumberHandle = await frame.evaluateHandle(e => e.getAttribute('data-page-index'), element);
            let pageNumber = await pageNumberHandle.jsonValue();
            pageNumber = parseInt(pageNumber);
            const formattedPageNumber = new Intl.NumberFormat("en", { minimumIntegerDigits: 3 }).format(pageNumber);
            console.log(formattedPageNumber);
            await element.screenshot({ path: config.output + '/' + formattedPageNumber + '.png' });

            await page.evaluate((nextButtonSelector) => {
                let el = document.querySelector(nextButtonSelector);
                el.style.visibility = "visible";
            }, nextButtonSelector);

            await page.click(nextButtonSelector);
            await page.waitForNetworkIdle();

            await scrapePage();
        }

        await scrapePage();

        await browser.close();
    } catch (e) {
        console.log(e);
        process.exit(1);
    }
})();
